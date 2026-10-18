import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  Texture
} from 'three';
import type { ClimateFrame } from './climate';

/* ---------- 确定性噪声 ---------- */

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2(x: number, y: number, oct: number): number {
  let v = 0;
  let amp = 0.5;
  let fx = x;
  let fy = y;
  for (let k = 0; k < oct; k++) {
    v += amp * noise2(fx, fy);
    fx = fx * 2.11 + 13.7;
    fy = fy * 2.11 - 7.3;
    amp *= 0.5;
  }
  return v;
}

const s01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---------- 地形 ---------- */

export function heightAt(x: number, z: number): number {
  const big = fbm2(x * 0.019, z * 0.019, 3);
  const small = fbm2(x * 0.09 + 3.7, z * 0.09 - 1.3, 3);
  const h = big * 5.4 + small * 1.1 - 2.4;
  const d = Math.hypot(x, z);
  const flat = s01((d - 15) / 18); // 小屋台地：半径 15m 内压平
  return h * flat + 0.62 * (1 - flat);
}

function makeGroundTexture(): CanvasTexture {
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
      const v = fbm2(x * 0.11, y * 0.11, 3);
      const v2 = fbm2(x * 0.31 + 9, y * 0.31 - 4, 2);
      const g = 0.30 + v * 0.34;
      const r = 0.20 + v * 0.22 + v2 * 0.16;
      const b = 0.14 + v * 0.10;
      const grit = (hash2(x * 1.1, y * 1.1) - 0.5) * 0.06;
      data[p] = Math.round(Math.min(1, r + grit) * 255);
      data[p + 1] = Math.round(Math.min(1, g + grit * 0.7) * 255);
      data[p + 2] = Math.round(Math.min(1, b + grit * 0.5) * 255);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(cv);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(74, 74);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface TerrainRig {
  mesh: Mesh;
  heightAt: (x: number, z: number) => number;
}

export function makeTerrain(): TerrainRig {
  const geo = new PlaneGeometry(380, 380, 130, 130);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // 顶点色只做"调色系数"（偏白 + 局部增强），暗色交给纹理本底
  const moss = new Color(1.0, 0.95, 0.78);
  const mossDark = new Color(0.62, 0.68, 0.56);
  const dirt = new Color(1.5, 1.15, 0.82);
  const tmp = new Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const d = Math.hypot(x, z);
    const clearing = 1 - s01((d - 8.5) / 5.5);
    const n = fbm2(x * 0.23 + 40, z * 0.23 - 17, 2);
    tmp.copy(moss).lerp(mossDark, n * 0.8);
    tmp.lerp(dirt, clearing);
    const grit = (hash2(x * 1.7, z * 1.7) - 0.5) * 0.055;
    colors[i * 3] = tmp.r + grit;
    colors[i * 3 + 1] = tmp.g + grit;
    colors[i * 3 + 2] = tmp.b + grit;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new MeshStandardMaterial({
    map: makeGroundTexture(),
    vertexColors: true,
    roughness: 0.96,
    metalness: 0
  });
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, heightAt };
}

/* ---------- 石头 ---------- */

function makeStoneTexture(): Texture {
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
      const v = fbm2(x * 0.14, y * 0.14, 3) * 0.6 + hash2(x * 1.7, y * 1.7) * 0.25;
      const c = 0.38 + v * 0.38;
      data[p] = Math.round(c * 255);
      data[p + 1] = Math.round(c * 255 * 0.99);
      data[p + 2] = Math.round(c * 255 * 0.97);
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

export interface RockCollider {
  x: number;
  z: number;
  r: number;
}

export function makeRocks(count: number, heightFn: (x: number, z: number) => number): { meshes: Mesh[]; colliders: RockCollider[] } {
  const mat = new MeshStandardMaterial({
    map: makeStoneTexture(),
    roughness: 0.9,
    metalness: 0,
    flatShading: true
  });
  const meshes: Mesh[] = [];
  const colliders: RockCollider[] = [];
  let seed = 7;

  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let k = 0; k < count; k++) {
    const geom = new DodecahedronGeometry(1, 1);
    const p = geom.attributes.position;
    const jitter = 0.24;
    for (let i = 0; i < p.count; i++) {
      const jx = (hash2(i * 1.7 + seed, 4.2) - 0.5) * jitter;
      const jy = (hash2(i * 1.7 + seed, 9.1) - 0.5) * jitter;
      const jz = (hash2(i * 1.7 + seed, 14.8) - 0.5) * jitter;
      p.setXYZ(i, p.getX(i) + jx, p.getY(i) + jy * 0.55, p.getZ(i) + jz);
    }
    geom.computeVertexNormals();

    const s = 0.45 + rnd() * 1.7;
    const ang = rnd() * Math.PI * 2;
    const rad = 18 + rnd() * 30;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const mesh = new Mesh(geom, mat);
    mesh.position.set(x, heightFn(x, z) + s * 0.18, z);
    mesh.scale.set(s, s * (0.55 + rnd() * 0.4), s);
    mesh.rotation.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    colliders.push({ x, z, r: s * 0.92 });
  }
  return { meshes, colliders };
}

/* ---------- 远山剪影（两圈）---------- */

function makeRing(radius: number, hBase: number, noiseScale: number, seed: number): Mesh {
  const seg = 190;
  const positions: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r0 = fbm2(Math.cos(a0) * noiseScale + seed, Math.sin(a0) * noiseScale - seed, 3);
    const r1 = fbm2(Math.cos(a1) * noiseScale + seed, Math.sin(a1) * noiseScale - seed, 3);
    const h0 = hBase * (0.42 + 0.58 * r0);
    const h1 = hBase * (0.42 + 0.58 * r1);
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    positions.push(x0, -6, z0, x1, -6, z1, x1, h1, z1);
    positions.push(x0, -6, z0, x1, h1, z1, x0, h0, z0);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mat = new MeshBasicMaterial({
    color: 0x1b2334,
    fog: false,
    side: DoubleSide
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export interface MountainsRig {
  meshes: Mesh[];
  /** 手动大气透视：剪影色 = 雾色×haze + 暗色×(1-haze)，比场景雾更暗更沉 */
  update: (f: ClimateFrame) => void;
}

export function makeMountains(): MountainsRig {
  const nearBase = new Color(0x161e30);
  const farBase = new Color(0x101727);
  const nearMesh = makeRing(240, 34, 3.1, 11.3);
  const farMesh = makeRing(330, 64, 2.0, 42.7);
  const tmpA = new Color();
  const tmpB = new Color();

  const update = (f: ClimateFrame): void => {
    (nearMesh.material as MeshBasicMaterial).color
      .copy(tmpA.copy(f.fogCol).multiplyScalar(0.30))
      .add(tmpB.copy(nearBase).multiplyScalar(0.70));
    (farMesh.material as MeshBasicMaterial).color
      .copy(tmpA.copy(f.fogCol).multiplyScalar(0.46))
      .add(tmpB.copy(farBase).multiplyScalar(0.54));
  };

  return { meshes: [nearMesh, farMesh], update };
}



