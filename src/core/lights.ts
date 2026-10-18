import { Color, DirectionalLight, HemisphereLight, MathUtils, Vector3 } from 'three';
import type { ClimateFrame } from '../world/climate';

const DEG = Math.PI / 180;
const vTmp = new Vector3();
const vMoon = new Vector3();

/** Tanner Helland 开尔文→RGB 近似（公开算法） */
export function kelvinToColor(k: number, out: Color): Color {
  const t = MathUtils.clamp(k, 1000, 40000) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  out.setRGB(
    MathUtils.clamp(r, 0, 255) / 255,
    MathUtils.clamp(g, 0, 255) / 255,
    MathUtils.clamp(b, 0, 255) / 255
  );
  return out;
}

export function dirFromElAz(elDeg: number, azDeg: number, out: Vector3): Vector3 {
  const elR = Math.max(elDeg, -89) * DEG;
  const azR = azDeg * DEG;
  const c = Math.cos(elR);
  return out.set(Math.sin(azR) * c, Math.sin(elR), Math.cos(azR) * c);
}

/** 一盏灯在太阳与月亮间平滑插值（方向/颜色/强度），阴影图不闪 */
export class Lighting {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly fill: DirectionalLight;
  readonly sunDir = new Vector3(0, 0, -1);
  readonly moonDir = new Vector3(0, -1, 0);

  private sunColor = new Color();
  private moonTint = new Color();

  constructor() {
    this.sun = new DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 6;
    sc.far = 170;
    this.sun.shadow.bias = -0.00028;
    this.sun.shadow.normalBias = 0.024;
    this.sun.shadow.autoUpdate = true;

    this.hemi = new HemisphereLight(0x7080a8, 0x40382c, 0.55);
    this.fill = new DirectionalLight(0x556688, 0.5);

    this.moonTint.setRGB(0.72, 0.80, 1.0);
  }

  /** @returns 最新帧数据（light 负责计算插值后的主光方向） */
  update(f: ClimateFrame, out?: { lightPos: Vector3 }): { sunDir: Vector3; moonDir: Vector3 } {
    const el = f.el;
    const az = f.az;
    dirFromElAz(el, az, this.sunDir);
    const moonEl = MathUtils.clamp(-el * 0.75 - 8, 6, 40);
    dirFromElAz(moonEl, az + 180, this.moonDir);

    // 太阳→月亮 混合（高度 -10° 开始，-28° 完成）
    const m = f.moonMix;
    vTmp.copy(this.sunDir).multiplyScalar(66);
    vMoon.copy(this.moonDir).multiplyScalar(66);
    vTmp.lerp(vMoon, m);
    this.sun.position.copy(vTmp);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();

    this.sun.intensity = MathUtils.lerp(f.sunI, f.moonI, m);
    kelvinToColor(MathUtils.lerp(f.kelvin, 13200, m), this.sunColor);
    this.sun.color.copy(this.sunColor).lerp(this.moonTint, m * 0.65);

    this.hemi.color.copy(f.hemiSky);
    this.hemi.groundColor.copy(f.hemiGnd);
    this.hemi.intensity = f.hemiI;

    this.fill.position.set(-this.sunDir.x, 0.42, -this.sunDir.z).normalize().multiplyScalar(50);
    this.fill.color.copy(f.fillCol);
    this.fill.intensity = f.fillI;

    if (out) out.lightPos.copy(vTmp);
    return { sunDir: this.sunDir, moonDir: this.moonDir };
  }

  setShadowResolution(size: number): void {
    this.sun.shadow.mapSize.set(size, size);
  }
}
