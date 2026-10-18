import { Color } from 'three';
import type { PresetId } from '../core/params';

type Pair = [dusk: number, dawn: number];

const P = (a: number, b = a): Pair => [a, b];

interface Palette {
  kelvin: Pair;
  sunI: Pair;
  skyTop: Pair;
  skyHor: Pair;
  glow: Pair;
  glowS: Pair;
  cloud: Pair;
  hemiSky: Pair;
  hemiGnd: Pair;
  hemiI: Pair;
  fillCol: Pair;
  fillI: Pair;
  fogCol: Pair;
  fogD: Pair;
  exp: Pair;
  bloom: Pair;
}

interface Anchor {
  el: number;
  p: Palette;
}

/** 调色锚点：以太阳高度角为主轴，晨/昏各一套配色。 */
const ANCHORS: Anchor[] = [
  {
    el: 28,
    p: {
      kelvin: P(5900, 6200), sunI: P(3.0, 3.0),
      skyTop: P(0x4a79c0, 0x5680c8), skyHor: P(0xcad8ea, 0xd8e2ee),
      glow: P(0xfff1d8, 0xfff1e4), glowS: P(0.9, 0.9),
      cloud: P(0xffffff, 0xffffff),
      hemiSky: P(0x9cb8dc, 0xa6bedd), hemiGnd: P(0x6a6352, 0x6d6655), hemiI: P(0.85, 0.85),
      fillCol: P(0x93a8c6, 0x9db0c9), fillI: P(0.35, 0.35),
      fogCol: P(0xc2d0e0, 0xccd8e4), fogD: P(0.0025, 0.0025),
      exp: P(1.0, 1.0), bloom: P(0.28, 0.28)
    }
  },
  {
    el: 8,
    p: {
      kelvin: P(4700, 5100), sunI: P(2.4, 2.2),
      skyTop: P(0x31538f, 0x3a5a93), skyHor: P(0xe6b078, 0xeda27e),
      glow: P(0xffd9a0, 0xffd2a8), glowS: P(1.5, 1.5),
      cloud: P(0xffdcb4, 0xffd4b0),
      hemiSky: P(0x7e93ba, 0x8898b8), hemiGnd: P(0x5a4a3a, 0x5e4e3c), hemiI: P(0.68, 0.68),
      fillCol: P(0x6e80a6, 0x7687a8), fillI: P(0.40, 0.40),
      fogCol: P(0xc8a27c, 0xd2a88a), fogD: P(0.0035, 0.0035),
      exp: P(1.0, 1.0), bloom: P(0.30, 0.30)
    }
  },
  {
    el: 0,
    p: {
      kelvin: P(3300, 4400), sunI: P(1.7, 1.35),
      skyTop: P(0x2b3f6e, 0x394a74), skyHor: P(0xf29a58, 0xef8d78),
      glow: P(0xff8f40, 0xff9270), glowS: P(1.25, 1.05),
      cloud: P(0xf0a672, 0xf2b498),
      hemiSky: P(0x93a0c4, 0x9aa7c8), hemiGnd: P(0x4a3a2e, 0x4f4032), hemiI: P(1.18, 1.12),
      fillCol: P(0x46587e, 0x4d5a80), fillI: P(0.50, 0.50),
      fogCol: P(0xb98c6e, 0xc48b80), fogD: P(0.0045, 0.0045),
      exp: P(1.28, 1.2), bloom: P(0.45, 0.42)
    }
  },
  {
    el: -8,
    p: {
      kelvin: P(7600, 8000), sunI: P(0.50, 0.45),
      skyTop: P(0x1e2b50, 0x24305a), skyHor: P(0x8b95c2, 0x949cc8),
      glow: P(0x9a8fd2, 0xa493cc), glowS: P(0.7, 0.66),
      cloud: P(0x92a0c6, 0x9aa4ca),
      hemiSky: P(0x53627f, 0x59658a), hemiGnd: P(0x2b2218, 0x2f261d), hemiI: P(0.62, 0.60),
      fillCol: P(0x31415f, 0x364662), fillI: P(0.55, 0.55),
      fogCol: P(0x697696, 0x707c9c), fogD: P(0.006, 0.006),
      exp: P(1.06, 1.05), bloom: P(0.55, 0.53)
    }
  },
  {
    el: -18,
    p: {
      kelvin: P(10200, 10400), sunI: P(0.20, 0.18),
      skyTop: P(0x101a34, 0x141e38), skyHor: P(0x46547e, 0x4e587f),
      glow: P(0x5a6aa6, 0x5f6ba8), glowS: P(0.35, 0.33),
      cloud: P(0x7688ae, 0x7a8ab0),
      hemiSky: P(0x3a4a6e, 0x3f5074), hemiGnd: P(0x201810, 0x241c14), hemiI: P(0.44, 0.42),
      fillCol: P(0x2a3854, 0x2e3c58), fillI: P(0.50, 0.50),
      fogCol: P(0x3c4a66, 0x414e6a), fogD: P(0.007, 0.007),
      exp: P(0.99, 0.99), bloom: P(0.60, 0.58)
    }
  },
  {
    el: -45,
    p: {
      kelvin: P(12400, 12600), sunI: P(0.02, 0.02),
      skyTop: P(0x050910, 0x070a12), skyHor: P(0x101c32, 0x131e34),
      glow: P(0x2a3a66, 0x2e3c66), glowS: P(0.12, 0.12),
      cloud: P(0x48587e, 0x4a587e),
      hemiSky: P(0x1b2438, 0x1e2740), hemiGnd: P(0x0f0c08, 0x100d08), hemiI: P(0.3, 0.3),
      fillCol: P(0x1d2a44, 0x202c46), fillI: P(0.45, 0.45),
      fogCol: P(0x0b1524, 0x0c1626), fogD: P(0.008, 0.008),
      exp: P(0.9, 0.9), bloom: P(0.66, 0.64)
    }
  }
];

export const PRESET_CLOCK: Record<PresetId, number> = {
  dusk: 65400,
  blue: 69120,
  night: 84600,
  dawn: 20700
};

export interface ClimateFrame {
  el: number;
  az: number;
  dawn: number;
  cloud: number;
  kelvin: number;
  sunI: number;
  skyTop: Color;
  skyHor: Color;
  glow: Color;
  glowS: number;
  cloudTint: Color;
  hemiSky: Color;
  hemiGnd: Color;
  hemiI: number;
  fillCol: Color;
  fillI: number;
  fogCol: Color;
  fogD: number;
  star: number;
  moonDisc: number;
  moonI: number;
  moonMix: number;
  fireflies: number;
  exposure: number;
  bloom: number;
}

interface State {
  el: number;
  az: number;
  dawn: number;
  cloud: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (v: number) => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};

/** 秒 → 太阳高度角/方位角/晨偏（全天曲线，预测确定性） */
export function stateFromClock(t: number): State {
  const dayT = ((t % 86400) + 86400) % 86400;
  const el = 45 * Math.sin((2 * Math.PI * (dayT - 21600)) / 86400);
  const az = normDeg(250 + ((dayT - 64800) / 86400) * 360);
  const dawn = smooth01(clamp01((46800 - dayT) / 7200));
  return { el, az, dawn, cloud: 0.40 };
}

function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

export class Climate {
  private el = -2.2;
  private az = 252.5;
  private dawn = 0;
  private cloud = 0.4;
  private animFrom: State | null = null;
  private animTarget: State | null = null;
  private animT = -1;
  readonly animDur = 1.9;
  readonly frame: ClimateFrame;

  private cA = new Color();
  private cB = new Color();
  private cC = new Color();
  private cD = new Color();

  constructor() {
    this.frame = {
      el: this.el,
      az: this.az,
      dawn: this.dawn,
      cloud: this.cloud,
      kelvin: 3300,
      sunI: 1.7,
      skyTop: new Color(),
      skyHor: new Color(),
      glow: new Color(),
      glowS: 1.25,
      cloudTint: new Color(),
      hemiSky: new Color(),
      hemiGnd: new Color(),
      hemiI: 0.55,
      fillCol: new Color(),
      fillI: 0.5,
      fogCol: new Color(),
      fogD: 0.0065,
      star: 0,
      moonDisc: 0,
      moonI: 0,
      moonMix: 0,
      fireflies: 0,
      exposure: 1.03,
      bloom: 0.45
    };
    this.rebuild();
  }

  setPreset(id: PresetId): void {
    this.transitionTo(stateFromClock(PRESET_CLOCK[id]));
  }

  setClock(t: number): void {
    const s = stateFromClock(t);
    this.el = s.el;
    this.az = s.az;
    this.dawn = s.dawn;
    this.cloud = s.cloud;
    this.animT = -1;
    this.animFrom = null;
    this.animTarget = null;
    this.rebuild();
  }

  /** 过渡到目标状态（az 走最短方向，el 连续变化触发锚点调色） */
  transitionTo(target: State): void {
    this.animFrom = { el: this.el, az: this.az, dawn: this.dawn, cloud: this.cloud };
    this.animT = 0;
    this.animTarget = { ...target };
  }

  update(dt: number): void {
    if (this.animT >= 0 && this.animFrom && this.animTarget) {
      this.animT += dt / this.animDur;
      const k = smooth01(Math.min(1, this.animT));
      const f = this.animFrom;
      const tg = this.animTarget;
      this.el = f.el + (tg.el - f.el) * k;
      // 方位角走最短路径
      let dAz = tg.az - f.az;
      dAz = ((dAz % 360) + 360) % 360;
      if (dAz > 180) dAz -= 360;
      this.az = normDeg(f.az + dAz * k);
      this.dawn = f.dawn + (tg.dawn - f.dawn) * k;
      this.cloud = f.cloud + (tg.cloud - f.cloud) * k;
      if (this.animT >= 1) {
        this.el = tg.el;
        this.az = tg.az;
        this.dawn = tg.dawn;
        this.cloud = tg.cloud;
        this.animT = -1;
        this.animFrom = null;
        this.animTarget = null;
      }
    }
    this.rebuild();
  }

  private rebuild(): void {
    const fr = this.frame;
    fr.el = this.el;
    fr.az = this.az;
    fr.dawn = this.dawn;
    fr.cloud = this.cloud;

    // 找锚点区间
    const el = this.el;
    let i = 0;
    while (i < ANCHORS.length - 2 && el < ANCHORS[i + 1].el) i++;
    const a = ANCHORS[i];
    const b = ANCHORS[Math.min(i + 1, ANCHORS.length - 1)];
    const f = clamp01((el - a.el) / Math.max(0.001, b.el - a.el));

    const num = (key: keyof Palette): number => {
      const duskA = a.p[key][0];
      const duskB = b.p[key][0];
      const dawnA = a.p[key][1];
      const dawnB = b.p[key][1];
      const duskV = duskA + (duskB - duskA) * f;
      const dawnV = dawnA + (dawnB - dawnA) * f;
      return duskV + (dawnV - duskV) * this.dawn;
    };
    const col = (key: keyof Palette, out: Color): Color => {
      this.cA.setHex(a.p[key][0]);
      this.cB.setHex(b.p[key][0]);
      this.cC.copy(this.cA).lerp(this.cB, f);
      this.cA.setHex(a.p[key][1]);
      this.cB.setHex(b.p[key][1]);
      this.cD.copy(this.cA).lerp(this.cB, f);
      return out.copy(this.cC).lerp(this.cD, this.dawn);
    };

    fr.kelvin = num('kelvin');
    fr.sunI = num('sunI');
    col('skyTop', fr.skyTop);
    col('skyHor', fr.skyHor);
    col('glow', fr.glow);
    fr.glowS = num('glowS');
    col('cloud', fr.cloudTint);
    col('hemiSky', fr.hemiSky);
    col('hemiGnd', fr.hemiGnd);
    fr.hemiI = num('hemiI');
    col('fillCol', fr.fillCol);
    fr.fillI = num('fillI');
    col('fogCol', fr.fogCol);
    fr.fogD = num('fogD');
    fr.exposure = num('exp');
    fr.bloom = num('bloom');

    fr.star = clamp01((-el - 7) / 10);
    fr.moonDisc = clamp01((-el - 6) / 9);
    fr.moonI = 0.38 * clamp01((-el - 14) / 22);
    fr.moonMix = smooth01(clamp01((-el - 10) / 18));
    // 需求书：太阳高度角低于 14° 时萤火虫出现，夜里更多
    fr.fireflies = clamp01((14 - el) / 14);
  }
}
