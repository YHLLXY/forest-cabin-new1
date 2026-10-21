import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  DoubleSide,
  SphereGeometry,
  Vector3
} from 'three';
import { fbm2, hash2, makeStoneTexture } from './terrain';
import type { ClimateFrame } from './climate';
import type { Collider } from '../camera/rig';

const DEG = Math.PI / 180;
/** 小屋朝向：门脸(+X 本地轴)指向方位角 70°（东北面），逆光英雄镜头(yaw 70)正对发亮窗 */
const CABIN_ROT = -20 * DEG;

/* ---------- 程序纹理 ---------- */

/** 原木：年轮纹理沿 v（= 长度方向）拉伸的竖向条纹 + 节疤 */
function makeLogTexture(): CanvasTexture {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const data = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = (y * n + x) * 4;
      // 条纹沿 v（纵向）拉长：u 方向高频、v 方向低频
      const ring = fbm2(x * 0.22, y * 0.028, 3);
      const grain = fbm2(x * 0.55 + 31, y * 0.11 - 7, 2);
      const knot = Math.max(
        hash2(Math.floor(x / 40) * 7.3, Math.floor(y / 60) * 3.1) > 0.93 ? 0.55 - 0.9 * Math.abs(Math.sin((x % 40) / 40 * Math.PI)) * Math.max(0, 1 - Math.abs((y % 60) - 30) / 26) : 0,
        0
      );
      const v = clamp01(0.52 + ring * 0.40 + grain * 0.18 - knot);
      data[p] = Math.round(v * 226 + 20);        // R 偏暖
      data[p + 1] = Math.round(v * 168 + 14);
      data[p + 2] = Math.round(v * 118 + 10);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 木板：竖排拼板，板缝深线，横向擦痕 */
function makePlankTexture(): CanvasTexture {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const data = img.data;
  const plankW = n / 5;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = (y * n + x) * 4;
      const pid = Math.floor(x / plankW);
      const seam = x % plankW < 3 ? 0.62 : 1;
      const edge = x % plankW > plankW - 2 ? 0.72 : 1;
      const hue = 0.9 + hash2(pid * 13.7, 2.9) * 0.2;
      const scratch = fbm2(x * 0.06, y * 0.5 - pid * 9, 2);
      const v = clamp01((0.5 + scratch * 0.42) * seam * edge * hue);
      data[p] = Math.round(v * 205 + 22);
      data[p + 1] = Math.round(v * 150 + 14);
      data[p + 2] = Math.round(v * 104 + 10);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 窗帘窗：暖光核心 + 竖向帘褶，作 map + emissiveMap 双用 */
function makeWindowTexture(): CanvasTexture {
  const n = 128;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const data = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = (y * n + x) * 4;
      const u = x / n;
      const v = y / n;
      const fold = 0.78 + 0.22 * Math.sin(u * 17 + fbm2(u * 6, v * 2, 2) * 5);
      const core = Math.max(0, 1 - Math.hypot((u - 0.5) * 1.5, (v - 0.42) * 1.9));
      const dim = fold * (0.34 + 0.66 * core) * (1 - 0.35 * v * v * (1 - core));
      data[p] = Math.round(clamp01(0.18 + dim) * 255);
      data[p + 1] = Math.round(clamp01(0.10 + dim * 0.82) * 255);
      data[p + 2] = Math.round(clamp01(0.05 + dim * 0.55) * 255);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/* ---------- 小屋 ---------- */

export interface CabinRig {
  group: Group;
  colliders: Collider[];
  /** 烟囱口（本地坐标，世界坐标 = group.localToWorld） */
  smokeAnchor: Vector3;
  setClimate: (f: ClimateFrame) => void;
}

export function buildCabin(heightFn: (x: number, z: number) => number): CabinRig {
  const group = new Group();
  group.rotation.y = CABIN_ROT;
  group.position.y = heightFn(0, 0) - 0.05;

  const stoneTex = makeStoneTexture();
  const foundationTex = stoneTex.clone();
  foundationTex.repeat.set(3.5, 1);
  foundationTex.needsUpdate = true;
  const chimneyTex = stoneTex.clone();
  chimneyTex.repeat.set(1.1, 3.4);
  chimneyTex.needsUpdate = true;

  const logTex = makeLogTexture();
  const plankTex = makePlankTexture();

const logMat = new MeshStandardMaterial({ map: logTex, roughness: 0.88, metalness: 0, color: 0xffffff });
  const plankMat = new MeshStandardMaterial({ map: plankTex, roughness: 0.85, metalness: 0 });
  const darkWoodMat = new MeshStandardMaterial({ color: 0x35271c, roughness: 0.9, metalness: 0 });
  const stoneMat = new MeshStandardMaterial({ map: foundationTex, color: 0xe6d8c4, roughness: 0.92, metalness: 0 });
  const chimneyMat = new MeshStandardMaterial({ map: chimneyTex, color: 0xdccbb2, roughness: 0.95, metalness: 0 });
  const winTex = makeWindowTexture();
  const glassMat = new MeshStandardMaterial({
    map: winTex,
    color: 0x777777,
    emissive: 0xffa04e,
    emissiveMap: winTex,
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0
  });

  const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  /* 石砌基座 + 屋内地板 */
  box(5.85, 0.45, 4.65, stoneMat, 0, 0.22, 0);
  box(5.3, 0.08, 4.2, plankMat, 0, 0.42, 0);

  /* 原木墙：11 层，对角交替出榫（长墙沿 X，短墙沿 Z） */
  const COURSES = 11;
  const LOG_R = 0.115;
  const WALL_TOP = 0.4 + COURSES * LOG_R * 2; // ≈2.93
  const LX = 5.4;  // 长墙全长（本地 X）
  const LZ = 4.2;  // 短墙全长（本地 Z）
  const logs: Mesh[] = [];
  for (let i = 0; i < COURSES; i++) {
    const y = 0.40 + LOG_R + i * LOG_R * 2;
    const xProud = i % 2 === 0 ? 0.30 : 0.06;
    const zProud = i % 2 === 0 ? 0.06 : 0.30;
    // 长墙（法线 ±Z 本地，原木沿 X）
    for (const zs of [-LZ / 2, LZ / 2]) {
      const m = new Mesh(new CylinderGeometry(LOG_R, LOG_R, LX + xProud * 2, 9, 1), logMat);
      m.rotation.z = Math.PI / 2;
      m.position.set(0, y, zs);
      logs.push(m);
    }
    // 短墙（法线 ±X 本地，原木沿 Z）；前山墙在门洞以下断成两段
    for (const xs of [-LX / 2, LX / 2]) {
      const isFront = xs > 0;
      const doorTopY = 2.46;
      if (isFront && y < doorTopY) {
        const dz0 = -0.15 - 0.55; // 门洞左缘（含框）
        const dz1 = -0.15 + 0.55; // 门洞右缘
        const zA0 = -LZ / 2 - zProud;
        const zB1 = LZ / 2 + zProud;
        const segA = new Mesh(new CylinderGeometry(LOG_R, LOG_R, dz0 - zA0, 9, 1), logMat);
        segA.rotation.x = Math.PI / 2;
        segA.position.set(xs, y, (zA0 + dz0) / 2);
        const segB = new Mesh(new CylinderGeometry(LOG_R, LOG_R, zB1 - dz1, 9, 1), logMat);
        segB.rotation.x = Math.PI / 2;
        segB.position.set(xs, y, (dz1 + zB1) / 2);
        logs.push(segA, segB);
      } else {
        const m = new Mesh(new CylinderGeometry(LOG_R, LOG_R, LZ + zProud * 2, 9, 1), logMat);
        m.rotation.x = Math.PI / 2;
        m.position.set(xs, y, 0);
        logs.push(m);
      }
    }
  }
  for (const m of logs) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  /* 山墙（三角内原木收分 + 双面底板封死，防从 Apex 缝隙看进屋内） */
  const APEX = WALL_TOP + 1.31; // 屋脊 ≈4.24
  const GABLE_TRI = new BufferGeometry();
  GABLE_TRI.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, WALL_TOP - 0.04, -LZ / 2 - 0.16, 0, WALL_TOP - 0.04, LZ / 2 + 0.16, 0, APEX + 0.02, 0],
      3
    )
  );
  GABLE_TRI.computeVertexNormals();
  const gableBackMat = plankMat.clone();
  gableBackMat.side = DoubleSide;
  for (const xs of [-LX / 2 - 0.06, LX / 2 + 0.06]) {
    const back = new Mesh(GABLE_TRI, gableBackMat);
    back.position.x = xs;
    group.add(back);
    for (let r = 0; r < 8; r++) {
      const y = WALL_TOP + 0.09 + r * 0.16;
      const half = Math.max(0.14, (LZ / 2 + 0.14) * ((APEX - y) / (APEX - WALL_TOP - 0.09)));
      const m = new Mesh(new CylinderGeometry(0.085, 0.085, half * 2, 7, 1), logMat);
      m.rotation.x = Math.PI / 2;
      m.position.set(xs, y, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }

  /* 屋顶：双坡板 + 屋脊圆木（檐口正好搭在墙顶） */
  const ROOF_RUN = LZ / 2 + 0.35;
  const ROOF_RISE = APEX - WALL_TOP;
  const roofAngle = Math.atan2(ROOF_RISE, ROOF_RUN);
  const slopeLen = Math.hypot(ROOF_RUN, ROOF_RISE) + 0.1;
  for (const zs of [1, -1]) {
    const panel = new Mesh(new BoxGeometry(LX + 0.72, 0.09, slopeLen), plankMat);
    panel.rotation.x = zs > 0 ? roofAngle : -roofAngle;
    panel.position.set(0, (WALL_TOP + APEX) / 2 + 0.02, zs * (ROOF_RUN / 2));
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
  }
  const ridge = new Mesh(new CylinderGeometry(0.1, 0.1, LX + 0.9, 7, 1), logMat);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, APEX + 0.1, 0);
  ridge.castShadow = true;
  group.add(ridge);

  /* 烟囱（西南山墙外侧，收窄避免压住山墙） */
  const stack: Array<[number, number]> = [
    [1.5, 0.72],
    [1.15, 0.66],
    [0.95, 0.62],
    [0.75, 0.58]
  ];
  let cy = 0.5;
  for (const [h, w] of stack) {
    box(w, h, w, chimneyMat, -3.12, cy + h / 2, 0.55);
    cy += h;
  }
  box(0.8, 0.16, 0.8, chimneyMat, -3.12, cy + 0.08, 0.55);
  box(0.4, 0.1, 0.4, darkWoodMat, -3.12, cy + 0.2, 0.55); // 烟道口（深色）
  const smokeAnchor = new Vector3(-3.12, cy + 0.3, 0.55);

  /* 门 + 门斗 + 石阶（门朝 +X：厚度沿 X、宽度沿 Z） */
  const doorMat = new MeshStandardMaterial({ map: plankTex, color: 0x9a7a5a, roughness: 0.82, metalness: 0 });
  box(0.1, 2.22, 1.18, darkWoodMat, 2.66, 1.51, -0.15);   // 门框
  box(0.07, 2.06, 0.98, doorMat, 2.72, 1.43, -0.15);
  const handle = new Mesh(new SphereGeometry(0.038, 8, 6), darkWoodMat);
  handle.position.set(2.78, 1.42, 0.18);
  group.add(handle);
  box(1.0, 0.4, 1.3, stoneMat, 3.14, 0.2, -0.15);          // 石阶
  const hood = box(0.95, 0.05, 1.7, plankMat, 3.24, 2.36, -0.15); // 门斗小雨棚
  hood.rotation.z = -0.42;
  for (const zs of [-0.5, 0.5]) {
    const post = new Mesh(new CylinderGeometry(0.045, 0.05, 1.84, 7, 1), logMat);
    post.position.set(3.52, 1.32, -0.15 + zs);
    post.castShadow = true;
    group.add(post);
  }

  /* 窗（框 + 玻璃 + 十字棂）——向外凸出圆木外皮约 5cm，避免被墙面原木挡住 */
  const makeWindow = (w: number, h: number): Group => {
    const g = new Group();
    const add = (bw: number, bh: number, bd: number, x: number, y: number, mat: MeshStandardMaterial): void => {
      const m = new Mesh(new BoxGeometry(bw, bh, bd), mat);
      m.position.set(x, y, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    add(w + 0.14, 0.09, 0.12, 0, h / 2 + 0.04, darkWoodMat);
    add(w + 0.14, 0.09, 0.12, 0, -h / 2 - 0.04, darkWoodMat);
    add(0.09, h + 0.1, 0.12, -w / 2 - 0.03, 0, darkWoodMat);
    add(0.09, h + 0.1, 0.12, w / 2 + 0.03, 0, darkWoodMat);
    add(w + 0.2, 0.07, 0.18, 0, -h / 2 - 0.1, darkWoodMat);  // 窗台
    const glass = new Mesh(new PlaneGeometry(w, h), glassMat);
    g.add(glass);
    add(0.045, h, 0.035, 0, 0, darkWoodMat);                 // 竖棂
    add(w, 0.045, 0.035, 0, 0, darkWoodMat);                 // 横棂
    return g;
  };

  const place = (x: number, y: number, z: number, ry: number, w: number, h: number): void => {
    const win = makeWindow(w, h);
    win.rotation.y = ry;
    win.position.set(x, y, z);
    group.add(win);
  };
  const GABLE_X = LX / 2 + 0.17;
  place(GABLE_X, 1.82, -1.32, Math.PI / 2, 0.78, 0.9);
  place(GABLE_X, 1.82, 1.02, Math.PI / 2, 0.7, 0.9);
  place(-GABLE_X, 1.86, -1.05, -Math.PI / 2, 0.82, 0.92);
  place(0.68, 1.86, LZ / 2 + 0.17, 0, 0.92, 0.88);
  place(-0.5, 1.86, -LZ / 2 - 0.17, Math.PI, 0.92, 0.88);

  /* 屋内壁炉火光（Phase 3 面板接管闪烁；半径收紧防止穿墙漏光） */
  const fire = new PointLight(0xffb469, 0.4, 3.6, 2.0);
  fire.position.set(-1.15, 1.7, -0.35);
  group.add(fire);

  /* ---------- 碰撞体（世界坐标，随小屋旋转变换） ---------- */
  const cos = Math.cos(CABIN_ROT);
  const sin = Math.sin(CABIN_ROT);
  const wpt = (x: number, z: number): { x: number; z: number } => ({
    x: x * cos + z * sin,
    z: -x * sin + z * cos
  });
  const colliders: Collider[] = [];
  const wallBox = (x: number, y: number, z: number, hx: number, hy: number, hz: number): void => {
    const c = wpt(x, z);
    colliders.push({ type: 'box', cx: c.x, cy: y, cz: c.z, hx, hy, hz, rot: CABIN_ROT });
  };
  wallBox(0, 1.65, LZ / 2, LX / 2 + 0.2, 1.3, 0.18);
  wallBox(0, 1.65, -LZ / 2, LX / 2 + 0.2, 1.3, 0.18);
  wallBox(LX / 2, 1.65, 0, 0.18, 1.3, LZ / 2 + 0.2);
  wallBox(-LX / 2, 1.65, 0, 0.18, 1.3, LZ / 2 + 0.2);
  const ch = wpt(-3.12, 0.55);
  colliders.push({ type: 'cyl', x: ch.x, z: ch.z, r: 0.5, y0: 0, y1: 5.4 });

  /* 窗光随气候：日落后渐亮，深夜最盛 */
  const setClimate = (f: ClimateFrame): void => {
    const glowK = smooth01(clamp01((6 - f.el) / 12));
    glassMat.emissiveIntensity = 0.22 + glowK * 1.5;
    fire.intensity = 0.3 + glowK * 2.5;
  };

  return { group, colliders, smokeAnchor, setClimate };
}

function smooth01(v: number): number {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
}
