import {
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene
} from 'three';
import type { ClimateFrame } from './climate';

function makeMistTexture(): CanvasTexture {
  const n = 128;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, n, n);
  return new CanvasTexture(cv);
}

interface Patch {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  baseOpacity: number;
  phase: number;
  x0: number;
  z0: number;
}

/** 贴地雾片：低矮柔雾层，随风缓慢漂移 */
export class FogPatches {
  private patches: Patch[] = [];
  private tint = new Color(0.9, 0.92, 0.96);

  constructor(scene: Scene, terrainH: (x: number, z: number) => number) {
    const tex = makeMistTexture();
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + (k % 3) * 0.4;
      const rad = 13 + (((k * 37) % 100) / 100) * 24;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const size = 5 + (k % 4) * 1.8;
      const geo = new PlaneGeometry(size, size * (0.6 + (k % 3) * 0.2));
      geo.rotateX(-Math.PI / 2);
      const mat = new MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        color: 0x8899aa,
        fog: false
      });
      const mesh: Patch['mesh'] = new Mesh(geo, mat);
      mesh.position.set(x, terrainH(x, z) + 0.45 + (k % 3) * 0.34, z);
      mesh.rotation.y = k * 0.53;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.patches.push({
        mesh,
        baseOpacity: 0.10 + (((k * 13) % 10) / 10) * 0.12,
        phase: k * 1.83,
        x0: x,
        z0: z
      });
    }
  }

  update(f: ClimateFrame, elapsed: number, frozen: boolean): void {
    this.tint.copy(f.fogCol).lerp(WHITEISH, 0.12);
    const g = (0.75 + f.fogD * 30) * (0.38 + 0.62 * clamp01((10 - f.el) / 32));
    for (const p of this.patches) {
      const t = frozen ? 0 : elapsed;
      const m = p.mesh;
      if (!frozen) {
        m.position.x = p.x0 + Math.sin(t * 0.06 + p.phase) * 1.6;
        m.position.z = p.z0 + Math.cos(t * 0.045 + p.phase * 1.7) * 1.3;
        m.rotation.y += 0.00008;
      }
      m.material.opacity = p.baseOpacity * g * (0.75 + 0.25 * Math.sin(t * 0.21 + p.phase * 2.3));
      m.material.color.copy(this.tint);
    }
  }
}

const WHITEISH = new Color(0.9, 0.92, 0.96);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
