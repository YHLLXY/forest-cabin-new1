import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Collider } from '../camera/rig';

/* ---------- 单树几何：主干 + 四层树冠，顶点色分色，整树约 92 三角形 ---------- */

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

function buildTreeGeometry(): BufferGeometry {
  const trunk = colored(new CylinderGeometry(0.09, 0.15, 1.6, 7, 1), 0.26, 0.19, 0.13);
  trunk.translate(0, 0.8, 0);
  // 树冠由下至上渐亮，底部偏蓝沉一些（暮色针叶林，整体压暗避免青绿卡通感）
  const tiers: BufferGeometry[] = [trunk];
  const cones: Array<[number, number, number]> = [
    [1.08, 1.55, 1.95],
    [0.85, 1.4, 2.9],
    [0.6, 1.25, 3.75],
    [0.33, 1.05, 4.55]
  ];
  let k = 0;
  for (const [rad, h, y] of cones) {
    const t = k / 3;
    const r = 0.17 + t * 0.09;
    const g = 0.25 + t * 0.06;
    const b = 0.10 + t * 0.03;
    const cone = colored(new ConeGeometry(rad, h, 8, 1), r, g, b);
    cone.translate(0, y, 0);
    tiers.push(cone);
    k++;
  }
  const merged = mergeGeometries(tiers, false)!;
  merged.computeVertexNormals();
  return merged;
}

/* ---------- 布林随机种子（确定性，刷新/截图一致） ---------- */

export interface ForestInput {
  heightAt: (x: number, z: number) => number;
  rocks: Array<{ x: number; z: number; r: number }>;
}

export interface ForestRig {
  mesh: InstancedMesh;
  colliders: Collider[];
}

/** 黄昏太阳方位（回望缺口，保留一线落日视野） */
const SUNSET_AZ = 252;

export function plantForest(input: ForestInput): ForestRig {
  const COUNT = 250;
  const geo = buildTreeGeometry();
  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true
  });
  const mesh = new InstancedMesh(geo, mat, COUNT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

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

  let idx = 0;
  let tries = 0;
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
    mesh.setMatrixAt(idx, mtx);

    const tm = 0.78 + rnd() * 0.4;
    tint.setRGB(tm * (0.9 + rnd() * 0.2), tm, tm * (0.86 + rnd() * 0.14));
    mesh.setColorAt(idx, tint);

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
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { mesh, colliders };
}
