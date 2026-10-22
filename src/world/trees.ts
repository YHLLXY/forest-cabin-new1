import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RGBADepthPacking,
  SRGBColorSpace,
  Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Collider } from '../camera/rig';

/* ---------- 针叶卡片纹理：灰度针簇（绿色由顶点色×实例色供给） ---------- */

let foliageTex: CanvasTexture | null = null;

function getFoliageTexture(): CanvasTexture {
  if (foliageTex) return foliageTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  let s = 91;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 54; i++) {
    const ang = rnd() * Math.PI * 2;
    const r0 = 6 + rnd() * 10;
    const len = 26 + rnd() * 30;
    const x0 = S / 2 + Math.cos(ang) * r0;
    const y0 = S / 2 + Math.sin(ang) * r0 * 0.9;
    const x1 = S / 2 + Math.cos(ang) * (r0 + len);
    const y1 = S / 2 + Math.sin(ang) * (r0 + len) * 0.9;
    const l = 215 + Math.floor(rnd() * 40);
    ctx.strokeStyle = `rgba(${l},${l},${l},${0.5 + rnd() * 0.5})`;
    ctx.lineWidth = 1.6 + rnd() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // 左下角留一块全白不透明区，树干/枝条 UV 全部指到这里（不受针簇透明度影响）
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, S - 10, 10, 10);
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  foliageTex = tex;
  return tex;
}

/* ---------- 几何工具 ---------- */

function colored(geo: BufferGeometry, r: number, g: number, b: number): BufferGeometry {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = r;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return geo;
}

/** 把全部 UV 钉到纹理左下角的全白补丁上（树干/枝条专用） */
function pinUVs(geo: BufferGeometry): BufferGeometry {
  const n = geo.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = 5 / 128;
    uv[i * 2 + 1] = 5 / 128;
  }
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geo;
}

function vertColors(geo: BufferGeometry, fn: (y: number) => Color): void {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getY(i)).toArray(col, i * 3);
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
}

/* ---------- 单树几何：主干 + 轮生枝 + 针叶卡片 ---------- */

interface TreeCfg {
  th: number; // 主干高
  ys: number[]; // 轮生层高度
  ls: number[]; // 各层枝长
  droop: number; // 枝下倾角（rad 基准）
  cw: number; // 卡片宽基准
  ch: number; // 卡片高基准
  top: number; // 顶梢高
}

const CFG = {
  spruce: {
    th: 2.7,
    ys: [1.0, 1.5, 2.0, 2.45, 2.85],
    ls: [1.3, 1.1, 0.88, 0.62, 0.4],
    droop: 0.3,
    cw: 0.7,
    ch: 0.62,
    top: 3.85
  },
  pine: {
    th: 2.1,
    ys: [0.75, 1.3, 1.85, 2.3],
    ls: [1.7, 1.45, 1.1, 0.7],
    droop: 0.58,
    cw: 0.9,
    ch: 0.7,
    top: 3.1
  }
} satisfies Record<string, TreeCfg>;

const DARK = new Color(0.15, 0.2, 0.09);
const LIGHT = new Color(0.29, 0.4, 0.16);
const BARK = new Color(0.26, 0.19, 0.13);

function buildTreeGeometry(variant: keyof typeof CFG): BufferGeometry {
  const cfg = CFG[variant];
  const parts: BufferGeometry[] = [];
  let s = variant === 'spruce' ? 7 : 13;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const trunk = colored(pinUVs(new CylinderGeometry(0.055, 0.15, cfg.th, 6, 1, true)), BARK.r, BARK.g, BARK.b);
  trunk.translate(0, cfg.th / 2, 0);
  parts.push(trunk);

  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const dummy = new Object3D();
  const shade = new Color();

  /** 单张针叶卡片：中心点 p，yaw 朝向，pitch 俯仰，尺寸 w×h */
  function addCard(p: Vector3, yaw: number, pitch: number, w: number, h: number): void {
    const card = new PlaneGeometry(w, h);
    const t = Math.min(1, Math.max(0, (p.y - 0.7) / (cfg.top - 0.7)));
    shade.copy(DARK).lerp(LIGHT, t);
    vertColors(card, () => shade);
    dummy.position.copy(p);
    dummy.rotation.set(pitch, yaw, rnd() * 0.5 - 0.25, 'YXZ');
    dummy.updateMatrix();
    card.applyMatrix4(dummy.matrix);
    parts.push(card);
  }

  for (let wi = 0; wi < cfg.ys.length; wi++) {
    const y = cfg.ys[wi];
    const L = cfg.ls[wi];
    const sizeK = 0.55 + 0.45 * (L / cfg.ls[0]);
    const off = rnd() * Math.PI * 2; // 每层轮生角错开
    for (let bi = 0; bi < 6; bi++) {
      const a = off + (bi / 6) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
      const d = cfg.droop * (0.75 + rnd() * 0.5);
      const dir = new Vector3(Math.cos(a) * Math.cos(d), -Math.sin(d), Math.sin(a) * Math.cos(d));

      // 枝条：3 棱开口圆柱
      const br = pinUVs(new CylinderGeometry(0.012, 0.028, L, 3, 1, true));
      br.translate(0, L / 2, 0);
      q.setFromUnitVectors(up, dir);
      br.applyMatrix4(new Matrix4().makeRotationFromQuaternion(q));
      br.translate(0, y, 0);
      parts.push(colored(br, BARK.r * 0.9, BARK.g * 0.9, BARK.b * 0.9));

      // 针叶卡片：枝身两处交叉双片 + 梢端单片（叠出有体积的冠）
      const w = cfg.cw * sizeK * (0.8 + rnd() * 0.4);
      const h = cfg.ch * sizeK * (0.8 + rnd() * 0.4);
      const pitch = -d * 0.8;
      for (const t of [0.25, 0.45, 0.68]) {
        const p = new Vector3(Math.cos(a), -Math.sin(d), Math.sin(a)).multiplyScalar(L * t);
        p.y += y - d * L * t * 0.35;
        addCard(p, a + Math.PI / 2, pitch, w, h);
        addCard(p, a, pitch, w, h);
      }
      const tip = new Vector3(Math.cos(a), -Math.sin(d), Math.sin(a)).multiplyScalar(L * 0.95);
      tip.y += y - d * L * 0.95 * 0.35;
      addCard(tip, a + rnd() * Math.PI, pitch, w * 0.95, h * 0.95);
    }
  }

  // 顶梢竖卡（防秃杆）
  for (let i = 0; i < 5; i++) {
    const ty = cfg.top - 0.7 + i * 0.26;
    addCard(new Vector3((rnd() - 0.5) * 0.15, ty, (rnd() - 0.5) * 0.15), rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5, cfg.cw * 0.65, cfg.ch * 0.85);
  }

  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

/* ---------- 布林随机种子（确定性，刷新/截图一致） ---------- */

export interface ForestInput {
  heightAt: (x: number, z: number) => number;
  rocks: Array<{ x: number; z: number; r: number }>;
}

export interface ForestRig {
  meshes: InstancedMesh[];
  colliders: Collider[];
}

/** 黄昏太阳方位（回望缺口，保留一线落日视野） */
const SUNSET_AZ = 252;

export function plantForest(input: ForestInput): ForestRig {
  const COUNT = 250;
  const tex = getFoliageTexture();
  const mat = new MeshStandardMaterial({
    map: tex,
    vertexColors: true,
    alphaTest: 0.45,
    side: DoubleSide,
    roughness: 0.95,
    metalness: 0,
    flatShading: true
  });
  // 阴影也用针簇剪影（否则卡片投出实心方块）
  const depthMat = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: tex, alphaTest: 0.45 });
  depthMat.side = DoubleSide;

  const geos = [buildTreeGeometry('spruce'), buildTreeGeometry('pine')];
  const meshes = geos.map((g) => {
    const m = new InstancedMesh(g, mat, COUNT);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.customDepthMaterial = depthMat;
    return m;
  });

  const placed: Array<{ x: number; z: number; s: number }> = [];
  const colliders: Collider[] = [];
  const mtx = new Matrix4();
  const pos = new Vector3();
  const quat = new Quaternion();
  const scl = new Vector3();
  const tint = new Color();
  let seed = 19;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const counts = [0, 0];
  let tries = 0;
  let idx = 0;
  while (idx < COUNT && tries < COUNT * 40) {
    tries++;
    const ang = rnd() * Math.PI * 2;
    const rr = 16 + Math.pow(rnd(), 1.25) * 92; // 内密外疏：16–108m
    const x = Math.cos(ang) * rr;
    const z = Math.sin(ang) * rr;
    if (rr < 15) continue;

    // 保留朝向黄昏太阳的一条薄视野带（可少量留树剪影，不遮挡主视线）
    let treeAz = (Math.atan2(x, z) * 180) / Math.PI;
    treeAz = ((treeAz % 360) + 360) % 360;
    let dAz = Math.abs(treeAz - SUNSET_AZ);
    if (dAz > 180) dAz = 360 - dAz;
    if (rr < 34 && dAz < 13 && rnd() < 0.88) continue;

    // 与岩石保持距离
    let blocked = false;
    for (const r of input.rocks) {
      const dx = x - r.x;
      const dz = z - r.z;
      if (dx * dx + dz * dz < (r.r + 1.1) * (r.r + 1.1)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const s = 0.75 + rnd() * 1.05;
    for (const p of placed) {
      const dx = x - p.x;
      const dz = z - p.z;
      const min = 2.1 + 0.85 * (s + p.s);
      if (dx * dx + dz * dz < min * min) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const gy = input.heightAt(x, z) - 0.16 - s * 0.05;
    pos.set(x, gy, z);
    quat.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
    const hVar = 0.88 + rnd() * 0.34;
    scl.set(s, s * hVar, s);
    mtx.compose(pos, quat, scl);

    const v = rnd() < 0.55 ? 0 : 1;
    const mesh = meshes[v];
    mesh.setMatrixAt(counts[v], mtx);
    const tm = 0.78 + rnd() * 0.4;
    tint.setRGB(tm * (0.9 + rnd() * 0.2), tm, tm * (0.86 + rnd() * 0.14));
    mesh.setColorAt(counts[v], tint);
    counts[v]++;

    placed.push({ x, z, s });
    if (rr < 40) {
      colliders.push({
        type: 'cyl',
        x,
        z,
        r: 0.26 * s,
        y0: input.heightAt(x, z) - 1,
        y1: input.heightAt(x, z) + 5.4 * s * hVar
      });
    }
    idx++;
  }
  for (let v = 0; v < 2; v++) {
    meshes[v].count = counts[v];
    meshes[v].instanceMatrix.needsUpdate = true;
    const ic = meshes[v].instanceColor;
    if (ic) ic.needsUpdate = true;
  }

  return { meshes, colliders };
}
