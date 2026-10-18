export interface CamOverride {
  pos: [number, number, number];
  target: [number, number, number];
}

const PRESET_IDS = new Set(['dusk', 'blue', 'night', 'dawn']);

export interface UrlParams {
  /** 固定时钟（一天中的秒数 0–86400） */
  t: number | null;
  /** 画质档 low/medium/high/ultra */
  q: string | null;
  /** 无 UI 静帧模式（截图用） */
  shot: boolean;
  /** 性能模式：帧结束后把采样 JSON 写进 DOM */
  bench: boolean;
  /** 初始水平角（度） */
  yaw: number | null;
  /** 初始距离（米） */
  dist: number | null;
  /** 直达室内 */
  inside: boolean;
  /** 相机定点 x,y,z,tx,ty,tz */
  cam: CamOverride | null;
  /** 光照预设 dusk/blue/night/dawn（不写回 localStorage） */
  light: string | null;
}

export function parseParams(): UrlParams {
  const p = new URLSearchParams(window.location.search);
  const num = (k: string): number | null => {
    const v = p.get(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const camStr = p.get('cam');
  let cam: CamOverride | null = null;
  if (camStr !== null) {
    const parts = camStr.split(',').map(Number);
    if (parts.length === 6 && parts.every(Number.isFinite)) {
      cam = {
        pos: [parts[0], parts[1], parts[2]],
        target: [parts[3], parts[4], parts[5]]
      };
    }
  }

  const lightRaw = p.get('light');
  return {
    t: num('t'),
    q: p.get('q'),
    shot: p.get('shot') === '1',
    bench: p.get('bench') === '1',
    yaw: num('yaw'),
    dist: num('dist'),
    inside: p.get('inside') === '1',
    cam,
    light: lightRaw !== null && PRESET_IDS.has(lightRaw) ? lightRaw : null
  };
}

export type PresetId = 'dusk' | 'blue' | 'night' | 'dawn';
