import type { Climate, ClimateFrame } from '../world/climate';
import type { PresetId } from '../core/params';

/* ---------- 参数模型 ----------
 * 绝对值类（az/el/kelvin）：不接管时跟随气候锚点，接管后每帧锁值
 * 倍率类（其余）：乘在气候帧结果上，默认 ×1.00
 */
export type ParamKey =
  | 'az' | 'el' | 'kelvin' | 'sunI'
  | 'fog' | 'exp'
  | 'fire' | 'win' | 'smoke'
  | 'grain' | 'vig' | 'bloom';

type Owned = Partial<Record<ParamKey, number>>;

const PRESETS: ReadonlyArray<{ id: PresetId; label: string }> = [
  { id: 'dusk', label: '黄昏' },
  { id: 'blue', label: '蓝调' },
  { id: 'night', label: '夜晚' },
  { id: 'dawn', label: '黎明' }
];

interface Spec {
  key: ParamKey;
  label: string;
  aria: string;
  group: 'sun' | 'air' | 'fire' | 'pic';
  kind: 'abs' | 'mul';
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

const mulFmt = (v: number): string => `×${v.toFixed(2)}`;

const SPECS: readonly Spec[] = [
  { key: 'az', label: '方位', aria: '太阳方位角', group: 'sun', kind: 'abs', min: 0, max: 360, step: 0.5, fmt: (v) => `${v.toFixed(1)}°` },
  { key: 'el', label: '高度', aria: '太阳高度角', group: 'sun', kind: 'abs', min: -45, max: 45, step: 0.25, fmt: (v) => `${v.toFixed(2)}°` },
  { key: 'sunI', label: '强度', aria: '太阳强度', group: 'sun', kind: 'mul', min: 0, max: 2, step: 0.02, fmt: mulFmt },
  { key: 'kelvin', label: '色温', aria: '太阳色温', group: 'sun', kind: 'abs', min: 2200, max: 12500, step: 50, fmt: (v) => `${v.toFixed(0)}K` },
  { key: 'fog', label: '雾', aria: '雾浓度', group: 'air', kind: 'mul', min: 0, max: 2.5, step: 0.02, fmt: mulFmt },
  { key: 'exp', label: '曝光', aria: '曝光', group: 'air', kind: 'mul', min: 0.4, max: 1.8, step: 0.02, fmt: mulFmt },
  { key: 'fire', label: '炉火', aria: '炉火强度', group: 'fire', kind: 'mul', min: 0, max: 2, step: 0.02, fmt: mulFmt },
  { key: 'win', label: '窗灯', aria: '窗灯亮度', group: 'fire', kind: 'mul', min: 0, max: 2, step: 0.02, fmt: mulFmt },
  { key: 'smoke', label: '炊烟', aria: '炊烟量', group: 'fire', kind: 'mul', min: 0, max: 3, step: 0.05, fmt: mulFmt },
  { key: 'grain', label: '颗粒', aria: '胶片颗粒', group: 'pic', kind: 'mul', min: 0, max: 2.5, step: 0.05, fmt: mulFmt },
  { key: 'vig', label: '暗角', aria: '暗角强度', group: 'pic', kind: 'mul', min: 0, max: 2, step: 0.05, fmt: mulFmt },
  { key: 'bloom', label: '辉光', aria: '泛光强度', group: 'pic', kind: 'mul', min: 0, max: 2, step: 0.02, fmt: mulFmt }
];

const GROUP_TITLES: Record<Spec['group'], string> = {
  sun: '太阳',
  air: '空气',
  fire: '灯火',
  pic: '画面'
};

const SHADOW_TIERS: ReadonlyArray<{ v: number; label: string }> = [
  { v: 512, label: '低 512' },
  { v: 1024, label: '中 1024' },
  { v: 2048, label: '高 2048' },
  { v: 4096, label: '超高 4096' }
];

const STORAGE_KEY = 'fcabin-panel.v1';
const SAVE_DEBOUNCE_MS = 400;

export interface PanelCallbacks {
  /** ?light= 在场时不读写 localStorage */
  locked: boolean;
  defaultShadow: number;
  /** 初始预设（URL ?light= 或默认黄昏），保证 chips 高亮一致 */
  startPreset?: PresetId;
  onPreset: (id: PresetId) => void;
  onShadow: (size: number) => void;
}

interface StoreShape {
  o: Owned;
  shadow: number | null;
}

function readStore(locked: boolean): StoreShape | null {
  if (locked) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const j = JSON.parse(raw) as StoreShape;
    if (typeof j !== 'object' || j === null) return null;
    return { o: j.o ?? {}, shadow: typeof j.shadow === 'number' ? j.shadow : null };
  } catch {
    return null;
  }
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export interface PanelApi {
  /** 每帧缓存气候帧数值（仅为未接管滑杆的显示源），不产生 DOM 写入 */
  feedFrame(f: ClimateFrame): void;
  /** 把滑杆状态注入气候（在 climate.update 之前调） */
  applyToClimate(c: Climate): void;
  mul(key: ParamKey): number;
  /** 预设被外部切换（键盘 1-4）：清接管 + 刷新 chips */
  onExternalPreset(id?: PresetId): void;
  open(): void;
}

export function createPanel(cb: PanelCallbacks): PanelApi {
  const owned: Owned = {};

  const cur = { az: 252.5, el: -2.2, kelvin: 3300 };
  let activePreset: PresetId = cb.startPreset ?? 'dusk';
  let shadowVal = cb.defaultShadow;

  /* ---------- DOM ---------- */
  const handle = document.createElement('button');
  handle.id = 'fx-handle';
  handle.setAttribute('aria-controls', 'fx-panel');
  handle.setAttribute('aria-expanded', 'false');
  handle.setAttribute('aria-label', '打开光影面板');
  handle.title = '光影面板';
  handle.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
    '<line x1="12" y1="2.6" x2="12" y2="6.2"/><line x1="12" y1="17.8" x2="12" y2="21.4"/>' +
    '<line x1="2.6" y1="12" x2="6.2" y2="12"/><line x1="17.8" y1="12" x2="21.4" y2="12"/>' +
    '<line x1="5.3" y1="5.3" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="18.7" y2="18.7"/>' +
    '<line x1="5.3" y1="18.7" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="18.7" y2="5.3"/>' +
    '</g></svg>';

  const panel = document.createElement('aside');
  panel.id = 'fx-panel';
  panel.setAttribute('aria-label', '光影面板');
  panel.inert = true;

  const rowHtml = (s: Spec): string =>
    `<div class="row"><label for="fx-s-${s.key}">${s.label}</label>` +
    `<input id="fx-s-${s.key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" aria-label="${s.aria}">` +
    `<output for="fx-s-${s.key}">—</output></div>`;

  const groupHtml = (g: Spec['group']): string => {
    const rows = SPECS.filter((s) => s.group === g).map(rowHtml).join('');
    return `<section class="sec"><h3>${GROUP_TITLES[g]}</h3>${rows}</section>`;
  };

  panel.innerHTML =
    `<header><strong>光影面板</strong>` +
    `<button id="fx-close" aria-label="关闭光影面板">×</button></header>` +
    `<div id="fx-chips" role="group" aria-label="昼夜预设">` +
    PRESETS.map((p) => `<button class="chip" data-id="${p.id}" aria-pressed="false">${p.label}</button>`).join('') +
    `</div>` +
    groupHtml('sun') + groupHtml('air') + groupHtml('fire') + groupHtml('pic') +
    `<div class="fx-foot">` +
    `<label for="fx-shadow">阴影</label>` +
    `<select id="fx-shadow">` +
    SHADOW_TIERS.map((t) => `<option value="${t.v}"${t.v === cb.defaultShadow ? ' selected' : ''}>${t.label}</option>`).join('') +
    `</select>` +
    `<button id="fx-restore" type="button">恢复默认</button>` +
    `</div>`;

  document.body.appendChild(handle);
  document.body.appendChild(panel);

  /* ---------- 持久化（防抖） ---------- */
  let saveTimer = -1;
  const persist = (): void => {
    if (cb.locked) return; // ?light= 场景整场不写回
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        const shadowCustom = shadowVal !== cb.defaultShadow;
        if (Object.keys(owned).length === 0 && !shadowCustom) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          const data: StoreShape = { o: owned, shadow: shadowCustom ? shadowVal : null };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      } catch { /* 隐私模式等：静默降级 */ }
    }, SAVE_DEBOUNCE_MS);
  };

  /* 恢复之前会话的接管值与阴影档 */
  const stored = readStore(cb.locked);
  if (stored) {
    for (const s of SPECS) {
      const v = stored.o[s.key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        owned[s.key] = clamp(v, s.min, s.max);
      }
    }
    if (stored.shadow !== null && SHADOW_TIERS.some((t) => t.v === stored.shadow)) {
      shadowVal = stored.shadow;
    }
  }

  /* ---------- 行刷新 ---------- */
  const inputs = new Map<ParamKey, HTMLInputElement>();
  const outs = new Map<ParamKey, HTMLOutputElement>();
  for (const s of SPECS) {
    const inp = panel.querySelector<HTMLInputElement>(`#fx-s-${s.key}`)!;
    const out = panel.querySelector<HTMLOutputElement>(`#fx-s-${s.key} ~ output`!) ||
      inp.parentElement!.querySelector('output')!;
    inputs.set(s.key, inp);
    outs.set(s.key, out);
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      owned[s.key] = v;
      // 绝对值滑杆接管后显示值即源
      if (s.key === 'az' || s.key === 'el' || s.key === 'kelvin') cur[s.key] = v;
      setRowText(s, v);
      persist();
    });
  }

  function setRowText(s: Spec, v: number): void {
    const txt = s.fmt(v);
    outs.get(s.key)!.textContent = txt;
    const inp = inputs.get(s.key)!;
    inp.setAttribute('aria-valuetext', txt);
  }

  /** 滑杆位置 + 读数：绝对值类跟随最新气候帧，倍率类显示当前接管值 */
  function refreshSlider(s: Spec): void {
    const inp = inputs.get(s.key)!;
    const absV = cur[s.key as 'az' | 'el' | 'kelvin'];
    const v = s.kind === 'abs' ? (owned[s.key] ?? absV) : (owned[s.key] ?? 1);
    inp.value = String(v);
    setRowText(s, owned[s.key] ?? (s.kind === 'abs' ? absV : 1));
  }

  const refreshAll = (): void => {
    for (const s of SPECS) refreshSlider(s);
    refreshChips();
  };

  /* ---------- chips ---------- */
  const chips = Array.from(panel.querySelectorAll<HTMLButtonElement>('.chip'));
  function refreshChips(): void {
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.id === activePreset));
  }
  for (const c of chips) {
    c.addEventListener('click', () => {
      const id = c.dataset.id as PresetId;
      activePreset = id;
      clearOwned();
      cb.onPreset(id);
      persist();
      refreshAll();
    });
  }

  function clearOwned(): void {
    for (const k of Object.keys(owned) as ParamKey[]) delete owned[k];
  }

  /* ---------- 阴影档 / 恢复默认 ---------- */
  const shadowSel = panel.querySelector<HTMLSelectElement>('#fx-shadow')!;
  shadowSel.value = String(shadowVal);
  shadowSel.addEventListener('change', () => {
    const v = Number(shadowSel.value);
    if (!Number.isFinite(v)) return;
    shadowVal = v;
    cb.onShadow(v);
    persist();
  });

  panel.querySelector('#fx-restore')!.addEventListener('click', () => {
    clearOwned();
    shadowVal = cb.defaultShadow;
    shadowSel.value = String(shadowVal);
    cb.onShadow(cb.defaultShadow);
    if (!cb.locked) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
    }
    refreshAll();
  });

  /* ---------- 抽屉开合 + 焦点管理 ---------- */
  const closeBtn = panel.querySelector<HTMLButtonElement>('#fx-close')!;
  const openPanel = (): void => {
    if (!panel.inert) return;
    panel.inert = false;
    panel.classList.add('open');
    handle.setAttribute('aria-expanded', 'true');
    refreshAll();
    closeBtn.focus({ preventScroll: true });
  };
  const closePanel = (): void => {
    if (panel.inert) return;
    panel.classList.remove('open');
    panel.inert = true;
    handle.setAttribute('aria-expanded', 'false');
    handle.focus({ preventScroll: true });
  };

  handle.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
    }
  });

  /* ---------- dbg: ?panel=1 打开 ---------- */
  if (new URLSearchParams(window.location.search).get('panel') === '1') {
    openPanel();
  }

  /* ---------- API ---------- */
  return {
    feedFrame(f: ClimateFrame): void {
      cur.az = f.az;
      cur.el = f.el;
      cur.kelvin = f.kelvin;
      // 打开状态下跟随刷新未接管行；关闭时不动 DOM
      if (!panel.inert) refreshAll();
    },
    applyToClimate(c: Climate): void {
      const o = owned;
      if (o.el === undefined && o.az === undefined && o.kelvin === undefined && o.sunI === undefined && o.fog === undefined) {
        c.setOverride(null);
        return;
      }
      c.setOverride({ el: o.el, az: o.az, kelvin: o.kelvin, sunIMul: o.sunI, fogMul: o.fog });
    },
    mul(key: ParamKey): number {
      return owned[key] ?? 1;
    },
    onExternalPreset(id?: PresetId): void {
      activePreset = id ?? activePreset;
      clearOwned();
      persist();
      refreshAll();
    },
    open: openPanel
  };
}
