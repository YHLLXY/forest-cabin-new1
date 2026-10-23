import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CABIN_ROT } from './cabin';
import type { ClimateFrame } from './climate';
import type { Collider } from '../camera/rig';

/* P4a 屋内陈设：建于 cabin 本地坐标系（随 cabin.group 统一旋转/落位）。
   静态件按材质合并批；炭床/烛焰为动态件单独持有，update 逐帧闪烁。 */

const FLOOR_Y = 0.46; // 板地板顶面（cabin 地板 0.42 + 0.04）

export interface InteriorRig {
  group: Group;
  colliders: Collider[];
  update: (dt: number, f: ClimateFrame, mul?: { fire: number }) => void;
}

export function buildInterior(): InteriorRig {
  const group = new Group();

  /* —— 批管线（同 cabin.ts：几何烘矩阵 → 按材质归堆合并） —— */
  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const m4 = new Matrix4();
  const eu = new Euler();
  const qt = new Quaternion();
  const vp = new Vector3();
  const one = new Vector3(1, 1, 1);
  const part = (
    base: BufferGeometry, mat: MeshStandardMaterial,
    x: number, y: number, z: number,
    rx = 0, ry = 0, rz = 0
  ): void => {
    qt.setFromEuler(eu.set(rx, ry, rz));
    m4.compose(vp.set(x, y, z), qt, one);
    const g = base.clone();
    g.applyMatrix4(m4);
    let list = batches.get(mat);
    if (!list) batches.set(mat, list = []);
    list.push(g);
  };

  /* —— 材质 —— */
  const woodDark = new MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 });
  const woodMid = new MeshStandardMaterial({ color: 0x5e4530, roughness: 0.88 });
  const clothMat = new MeshStandardMaterial({ color: 0xd6c9b2, roughness: 0.95 });
  const blanketMat = new MeshStandardMaterial({ color: 0x7a3526, roughness: 0.96 });
  const rugMat = new MeshStandardMaterial({ color: 0x5e2a20, roughness: 0.97 });
  const cushionMat = new MeshStandardMaterial({ color: 0x9a6a4a, roughness: 0.95 });
  const hearthStone = new MeshStandardMaterial({ color: 0x8d7f6e, roughness: 0.95 });
  const clayMat = new MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 });
  const bookA = new MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.85 });
  const bookB = new MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.85 });
  const bookC = new MeshStandardMaterial({ color: 0x77414a, roughness: 0.85 });
  const candleMat = new MeshStandardMaterial({ color: 0xf2e8cf, roughness: 0.6 });
  const emberMat = new MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff8030, emissiveIntensity: 1.4, roughness: 1 });
  const flameMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xffc486, emissiveIntensity: 3.2, roughness: 0.5 });

  /* —— 床（西北角：靠 -Z 长墙，床头抵 -X 山墙） —— */
  const bx0 = -2.16, bx1 = -0.23, bz0 = -1.94, bz1 = -1.22;
  const bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
  for (const [lx, lz] of [
    [bx0 + 0.06, bz0 + 0.06], [bx1 - 0.06, bz0 + 0.06],
    [bx0 + 0.06, bz1 - 0.06], [bx1 - 0.06, bz1 - 0.06]
  ]) {
    part(new BoxGeometry(0.09, 0.34, 0.09), woodDark, lx, FLOOR_Y + 0.17, lz);
  }
  part(new BoxGeometry(bx1 - bx0, 0.09, 0.07), woodDark, bcx, FLOOR_Y + 0.36, bz1 - 0.02);
  part(new BoxGeometry(bx1 - bx0, 0.09, 0.07), woodDark, bcx, FLOOR_Y + 0.36, bz0 + 0.02);
  part(new BoxGeometry(0.07, 0.5, bz1 - bz0), woodDark, bx1, FLOOR_Y + 0.3, bcz);           // 床尾板
  part(new BoxGeometry(0.07, 0.85, bz1 - bz0 + 0.04), woodDark, bx0, FLOOR_Y + 0.46, bcz);  // 床头板
  part(new BoxGeometry(bx1 - bx0 - 0.06, 0.14, bz1 - bz0 - 0.06), clothMat, bcx, FLOOR_Y + 0.47, bcz);
  part(new BoxGeometry(0.44, 0.11, bz1 - bz0 - 0.12), candleMat, bx0 + 0.34, FLOOR_Y + 0.57, bcz); // 枕
  part(new BoxGeometry(1.02, 0.06, bz1 - bz0 + 0.08), blanketMat, bx1 - 0.62, FLOOR_Y + 0.57, bcz); // 毯

  /* —— 长桌（+Z 墙窗下） —— */
  const tx = 0.95, tz = 0.4;
  part(new BoxGeometry(1.5, 0.07, 0.75), woodMid, tx, FLOOR_Y + 0.715, tz);
  for (const [lx, lz] of [
    [tx - 0.68, tz - 0.3], [tx - 0.68, tz + 0.3],
    [tx + 0.68, tz - 0.3], [tx + 0.68, tz + 0.3]
  ]) {
    part(new BoxGeometry(0.07, 0.68, 0.07), woodMid, lx, FLOOR_Y + 0.34, lz);
  }
  part(new BoxGeometry(1.34, 0.05, 0.04), woodMid, tx, FLOOR_Y + 0.24, tz - 0.3);
  part(new BoxGeometry(1.34, 0.05, 0.04), woodMid, tx, FLOOR_Y + 0.24, tz + 0.3);

  /* 矮凳（+Z 墙边）+ 布垫 */
  part(new BoxGeometry(1.16, 0.06, 0.32), woodMid, 0.55, FLOOR_Y + 0.4, 1.72);
  for (const lx of [-0.5, 0.5]) {
    for (const lz of [-0.1, 0.1]) {
      part(new BoxGeometry(0.07, 0.36, 0.07), woodMid, 0.55 + lx, FLOOR_Y + 0.18, 1.72 + lz);
    }
  }
  part(new BoxGeometry(0.42, 0.08, 0.32), cushionMat, 0.32, FLOOR_Y + 0.47, 1.72);

  /* —— 炭炉（-X 山墙内壁：火箱 + 炭床 + 烧柴 + 炉前石板） —— */
  part(new BoxGeometry(0.09, 1.0, 0.95), hearthStone, -2.55, FLOOR_Y + 0.5, -0.3);   // 背板
  part(new BoxGeometry(0.55, 0.72, 0.12), hearthStone, -2.32, FLOOR_Y + 0.38, -0.78); // 侧颊
  part(new BoxGeometry(0.55, 0.72, 0.12), hearthStone, -2.32, FLOOR_Y + 0.38, 0.18);
  part(new BoxGeometry(0.72, 0.05, 1.05), hearthStone, -2.24, FLOOR_Y + 0.025, -0.3); // 炉前石板

  /* 柴堆（+Z 墙角，两立一横） */
  part(new CylinderGeometry(0.065, 0.065, 0.55, 7, 1), woodMid, -1.42, FLOOR_Y + 0.09, 1.56, Math.PI / 2);
  part(new CylinderGeometry(0.065, 0.065, 0.55, 7, 1), woodMid, -1.42, FLOOR_Y + 0.09, 1.7, Math.PI / 2);
  part(new CylinderGeometry(0.065, 0.065, 0.55, 7, 1), woodMid, -1.42, FLOOR_Y + 0.21, 1.63, Math.PI / 2);

  /* 陶罐（炉角） */
  part(new CylinderGeometry(0.17, 0.14, 0.3, 9, 1), clayMat, -2.2, FLOOR_Y + 0.15, 0.95);
  part(new CylinderGeometry(0.08, 0.05, 0.14, 9, 1), clayMat, -2.2, FLOOR_Y + 0.38, 0.95);
  part(new CylinderGeometry(0.11, 0.08, 0.04, 9, 1), clayMat, -2.2, FLOOR_Y + 0.47, 0.95);

  /* 木箱（门旁 +X 墙南侧） */
  part(new BoxGeometry(0.85, 0.54, 0.6), woodDark, 2.28, FLOOR_Y + 0.27, 1.5);
  part(new BoxGeometry(0.87, 0.07, 0.62), woodMid, 2.28, FLOOR_Y + 0.57, 1.5);   // 盖
  part(new BoxGeometry(0.87, 0.4, 0.05), woodMid, 2.28, FLOOR_Y + 0.27, 1.185);  // 挡带
  part(new BoxGeometry(0.87, 0.4, 0.05), woodMid, 2.28, FLOOR_Y + 0.27, 1.815);

  /* 地毯（桌下） */
  const rugGeo = new PlaneGeometry(1.55, 1.05);
  rugGeo.rotateX(-Math.PI / 2);
  rugGeo.translate(tx, FLOOR_Y + 0.012, tz);
  batches.set(rugMat, [rugGeo]);

  /* —— 壁架 + 书（床头山墙面，山墙窗 z≈-1.05 以南） —— */
  for (const ly of [1.42, 1.78]) {
    part(new BoxGeometry(0.05, 0.05, 0.66), woodDark, -2.6, FLOOR_Y + ly, -1.76);
  }
  part(new BoxGeometry(0.05, 0.36, 0.68), woodDark, -2.58, FLOOR_Y + 1.62, -1.76); // 托板
  for (const [lz, lw, bh, mat] of [
    [-1.97, 0.05, 0.24, bookA], [-1.88, 0.06, 0.28, bookB], [-1.79, 0.05, 0.22, bookC],
    [-1.72, 0.05, 0.26, bookA], [-1.63, 0.07, 0.21, bookB], [-1.53, 0.05, 0.25, bookC]
  ] as Array<[number, number, number, MeshStandardMaterial]>) {
    part(new BoxGeometry(0.14, bh, lw), mat, -2.56, FLOOR_Y + 1.44 + bh / 2, lz);
  }

  /* —— 蜡烛（桌面） —— */
  const CX = 0.68, CZ = 0.28;
  part(new CylinderGeometry(0.055, 0.06, 0.02, 8, 1), woodDark, CX, FLOOR_Y + 0.75, CZ);   // 烛台座
  part(new CylinderGeometry(0.021, 0.024, 0.17, 8, 1), candleMat, CX, FLOOR_Y + 0.855, CZ); // 蜡身
  part(new CylinderGeometry(0.03, 0.03, 0.2, 7, 1), clayMat, CX + 0.22, FLOOR_Y + 0.85, CZ - 0.16); // 烛剪? 空罐

  /* 落盘：静态件按材质合并 */
  for (const [mat, geos] of batches) {
    group.add(new Mesh(mergeGeometries(geos, false)!, mat));
  }

  /* 炭床（动态 emissive，未并入静态批） */
  const emberGeo = new BoxGeometry(0.44, 0.13, 0.42);
  emberGeo.translate(-2.42, FLOOR_Y + 0.115, -0.3);
  group.add(new Mesh(emberGeo, emberMat));

  /* 火箱烧柴 */
  group.add(new Mesh(
    mergeGeometries([
      new CylinderGeometry(0.05, 0.05, 0.36, 7, 1).rotateX(Math.PI / 2).translate(-2.45, FLOOR_Y + 0.24, -0.12),
      new CylinderGeometry(0.05, 0.05, 0.3, 7, 1).rotateX(Math.PI / 2).translate(-2.38, FLOOR_Y + 0.24, -0.44)
    ], false)!,
    woodDark
  ));

  /* —— 动态烛焰 + 两盏室内灯 —— */
  const flame = new Mesh(new SphereGeometry(0.042, 8, 6), flameMat);
  flame.scale.set(0.55, 1.5, 0.55);
  flame.position.set(CX, FLOOR_Y + 0.985, CZ);
  group.add(flame);

  const candleLight = new PointLight(0xffb066, 0.5, 3.4, 2.0);
  candleLight.position.set(CX, FLOOR_Y + 1.05, CZ);
  const emberLight = new PointLight(0xff8a3c, 0.55, 1.5, 2.0);
  emberLight.position.set(-2.15, FLOOR_Y + 0.42, -0.3);
  group.add(candleLight, emberLight);

  /* —— 陈设碰撞体（世界坐标，随小屋旋转，同 cabin wallBox 做法） —— */
  const cos = Math.cos(CABIN_ROT);
  const sin = Math.sin(CABIN_ROT);
  const wpt = (x: number, z: number): { x: number; z: number } => ({
    x: x * cos + z * sin,
    z: -x * sin + z * cos
  });
  const colliders: Collider[] = [];
  const boxCol = (x: number, y: number, z: number, hx: number, hy: number, hz: number): void => {
    const c = wpt(x, z);
    colliders.push({ type: 'box', cx: c.x, cy: y, cz: c.z, hx, hy, hz, rot: CABIN_ROT });
  };
  boxCol(bcx, FLOOR_Y + 0.5, bcz, (bx1 - bx0) / 2 + 0.05, 0.55, (bz1 - bz0) / 2 + 0.05); // 床
  boxCol(tx, FLOOR_Y + 0.42, tz, 0.78, 0.42, 0.44);      // 桌
  boxCol(0.55, FLOOR_Y + 0.45, 1.72, 0.62, 0.45, 0.24);  // 凳
  boxCol(2.28, FLOOR_Y + 0.32, 1.5, 0.46, 0.35, 0.34);   // 木箱
  boxCol(-2.32, FLOOR_Y + 0.55, -0.3, 0.32, 0.6, 0.58);  // 炭炉

  let t = 0;
  const flick = (): number =>
    Math.max(0, 0.62 + 0.3 * Math.sin(t * 9.1) + 0.12 * Math.sin(t * 17.3 + 2.1) + 0.08 * Math.sin(t * 29.7 + 4.4));

  const update = (dt: number, f: ClimateFrame, mul?: { fire: number }): void => {
    t += dt;
    const s = smooth01(clamp01((6 - f.el) / 12)); // 夜渐强（同 cabin 窗光）
    const fm = Math.max(0, mul?.fire ?? 1);
    const fl = flick();
    candleLight.intensity = (0.3 + s * 0.55) * (0.7 + 0.3 * fl) * fm;
    emberLight.intensity = (0.4 + s * 0.85) * (0.55 + 0.45 * fl) * fm;
    emberMat.emissiveIntensity = 1.1 + 0.9 * fl * s;
    flame.position.y = FLOOR_Y + 0.985 + 0.006 * Math.sin(t * 11.3);
    flame.scale.y = 1.35 + 0.3 * (0.5 + 0.5 * fl);
  };

  return { group, colliders, update };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smooth01(v: number): number {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
}
