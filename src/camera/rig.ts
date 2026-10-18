import {
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3
} from 'three';

export type Collider =
  | { type: 'cyl'; x: number; z: number; r: number; y0: number; y1: number }
  | { type: 'box'; cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; rot: number };

export interface RigOptions {
  yaw?: number;
  dist?: number;
  cam?: { pos: [number, number, number]; target: [number, number, number] };
}

const DEG = Math.PI / 180;
export const MIN_DIST = 2.2;
export const MAX_DIST = 45;
const PITCH_MIN = -0.17;
const PITCH_MAX = 0.62;
const CAM_PAD = 0.13;

/**
 * 环绕相机：
 * - 拖拽 360° 水平无限 / 俯仰有界；滚轮·双指指数推拉 2.2–45m
 * - 双击定格目标点（再次拖拽回小屋）
 * - 静止呼吸漂移（reduced-motion 下完全静止）
 * - 碰撞：柱体/盒体推出 + 地形高度 clamp
 */
export class OrbitRig {
  yaw = 0.35;
  pitch = 0.2;
  dist = 11.5;
  readonly target = new Vector3(0, 1.5, 0);
  readonly homeTarget = new Vector3(0, 1.5, 0);
  locked = false;
  reduced = false;
  frozen = false;

  colliders: Collider[] = [];
  terrainFn: ((x: number, z: number) => number) | null = null;

  private dblTargets: Object3D[] = [];
  private camOverride = false;

  private cam: PerspectiveCamera;
  private el: HTMLElement;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchBase = 0;
  private pinchDist = 0;
  private dragging = false;
  private idle = 1;
  private breathT = 0;
  private ray = new Raycaster();
  private ndc = new Vector2();
  private vPos = new Vector3();
  private vBreath = new Vector3();

  constructor(cam: PerspectiveCamera, el: HTMLElement, opts: RigOptions = {}) {
    this.cam = cam;
    this.el = el;
    this.el.style.touchAction = 'none';

    if (opts.cam) {
      const p = opts.cam.pos;
      const t = opts.cam.target;
      this.target.set(t[0], t[1], t[2]);
      this.homeTarget.copy(this.target);
      const d = new Vector3(p[0], p[1], p[2]).sub(this.target);
      this.dist = MathUtils.clamp(d.length(), MIN_DIST, MAX_DIST);
      this.yaw = Math.atan2(d.x, d.z);
      this.pitch = MathUtils.clamp(Math.asin(MathUtils.clamp(d.y / d.length(), -1, 1)), PITCH_MIN, PITCH_MAX);
      this.locked = true;
      this.camOverride = true; // 定点模式：重置拖拽不回原点
    } else {
      if (opts.yaw !== undefined) this.yaw = opts.yaw * DEG;
      if (opts.dist !== undefined) this.dist = MathUtils.clamp(opts.dist, MIN_DIST, MAX_DIST);
    }

    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointermove', this.onMove);
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('pointercancel', this.onUp);
    this.el.addEventListener('wheel', this.onWheel, { passive: false });
    this.el.addEventListener('dblclick', this.onDbl);
    this.el.addEventListener('contextmenu', this.onCtx);
  }

  setDblClickTargets(list: Object3D[]): void {
    this.dblTargets = list;
  }

  private onCtx = (e: Event): void => {
    e.preventDefault();
  };

  private onDown = (e: PointerEvent): void => {
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchBase = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchDist = this.dist;
    }
    this.dragging = true;
    this.idle = 0;
    // 用户接管 → 回到小屋目标（定点模式除外）
    if (!this.camOverride && this.locked) {
      this.target.copy(this.homeTarget);
      this.locked = false;
    }
  };

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.idle = 0;

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchBase > 8 && this.pinchDist > 0) {
        this.dist = MathUtils.clamp(this.pinchDist * (this.pinchBase / d), MIN_DIST, MAX_DIST);
      }
      return;
    }
    if (!this.dragging || this.camOverride) return;
    this.yaw -= dx * 0.005;
    this.pitch = MathUtils.clamp(this.pitch + dy * 0.005, PITCH_MIN, PITCH_MAX);
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.pinchBase = 0;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.camOverride) return;
    this.dist = MathUtils.clamp(this.dist * Math.pow(1.0016, e.deltaY), MIN_DIST, MAX_DIST);
    this.idle = 0;
  };

  private onDbl = (e: MouseEvent): void => {
    if (this.camOverride || this.dblTargets.length === 0) return;
    const r = this.el.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    this.ray.setFromCamera(this.ndc, this.cam);
    const hits = this.ray.intersectObjects(this.dblTargets, false);
    if (hits.length > 0) {
      this.target.copy(hits[0].point);
      this.target.y += 0.6;
      this.locked = true;
    } else if (this.locked) {
      this.target.copy(this.homeTarget);
      this.locked = false;
    }
  };

  /** 每帧：位姿 + 呼吸漂移 + 碰撞解析 */
  update(dt: number, elapsed: number): void {
    this.idle += dt;
    if (!this.camOverride) {
      const active = !this.reduced && !this.frozen && !this.dragging;
      const breathe = active ? MathUtils.smoothstep(this.idle, 0.4, 1.5) : 0;
      if (breathe > 0.01) {
        this.breathT = elapsed;
        const b = breathe * 0.022; // ±2cm 级
        this.vBreath.set(
          Math.sin(this.breathT * 0.9) * b,
          Math.sin(this.breathT * 1.35 + 1.7) * b * 0.55,
          Math.cos(this.breathT * 0.7 + 0.4) * b
        );
      } else {
        this.vBreath.set(0, 0, 0);
      }
    }

    const sp = Math.cos(this.pitch);
    this.vPos.set(
      this.target.x + Math.sin(this.yaw) * sp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * sp * this.dist
    );

    this.resolve(this.vPos);

    this.cam.position.set(
      this.vPos.x + this.vBreath.x,
      this.vPos.y + this.vBreath.y,
      this.vPos.z + this.vBreath.z
    );
    this.cam.lookAt(this.target);
  }

  private resolve(p: Vector3): void {
    for (const c of this.colliders) {
      if (c.type === 'cyl') {
        if (p.y < c.y0 - 0.3 || p.y > c.y1 + 0.3) continue;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const h = Math.hypot(dx, dz);
        const min = c.r + CAM_PAD;
        if (h < min) {
          const k = h < 0.001 ? 1 : min / h;
          p.x = c.x + dx * k;
          p.z = c.z + dz * k;
        }
      } else {
        // 转局部坐标（绕 y 轴 -rot）
        const cos = Math.cos(-c.rot);
        const sin = Math.sin(-c.rot);
        const wl = p.x - c.cx;
        const wz = p.z - c.cz;
        const lx = wl * cos - wz * sin;
        const lz = wl * sin + wz * cos;
        const dy = p.y - c.cy;
        const hx = c.hx + CAM_PAD;
        const hz = c.hz + CAM_PAD;
        const hy = c.hy + CAM_PAD;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz && Math.abs(dy) < hy) {
          const px = hx - Math.abs(lx);
          const pz = hz - Math.abs(lz);
          const py = hy - Math.abs(dy);
          let nlx = lx;
          let nlz = lz;
          let ny = dy;
          if (py <= px && py <= pz) {
            ny = Math.sign(dy || 1) * hy;
          } else if (px <= pz) {
            nlx = Math.sign(lx || 1) * hx;
          } else {
            nlz = Math.sign(lz || 1) * hz;
          }
          // 转回世界坐标
          const cosW = Math.cos(c.rot);
          const sinW = Math.sin(c.rot);
          p.x = c.cx + (nlx * cosW - nlz * sinW);
          p.z = c.cz + (nlx * sinW + nlz * cosW);
          p.y = c.cy + ny;
        }
      }
    }
    if (this.terrainFn) {
      const minY = this.terrainFn(p.x, p.z) + 0.35;
      if (p.y < minY) p.y = minY;
    }
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('dblclick', this.onDbl);
    this.el.removeEventListener('contextmenu', this.onCtx);
  }
}
