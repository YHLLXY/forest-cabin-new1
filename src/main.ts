import {
  ACESFilmicToneMapping,
  FogExp2,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer
} from 'three';
import { parseParams, type PresetId } from './core/params';
import { PRESET_CLOCK, Climate } from './world/climate';
import { PerfSampler } from './core/perf';
import { PostFX } from './core/post';
import { Lighting } from './core/lights';
import { type TerrainRig, makeRocks, makeTerrain, makeMountains } from './world/terrain';
import { Sky } from './world/sky';
import { FogPatches } from './world/fogpatches';
import { buildCabin } from './world/cabin';
import { plantForest } from './world/trees';
import { createSmoke } from './world/smoke';
import { createFireflies } from './world/fireflies';
import { OrbitRig, type Collider } from './camera/rig';
import { createPanel, type PanelApi } from './ui/panel';

const params = parseParams();

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const tier = (params.q ?? (isMobile ? 'medium' : 'high')) as 'low' | 'medium' | 'high' | 'ultra';
const TIER = {
  low:    { dpr: 0.85, msaa: 0, shadow: 1024 },
  medium: { dpr: 1.25, msaa: 2, shadow: 2048 },
  high:   { dpr: 1.75, msaa: 4, shadow: 2048 },
  ultra:  { dpr: 2.0,  msaa: 4, shadow: 4096 }
}[tier];

function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance'
  });
  if (!renderer.capabilities.isWebGL2) {
    document.getElementById('webgl-fail')!.style.display = 'flex';
    return;
  }

  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.info.autoReset = false;
  renderer.shadowMap.autoUpdate = true;

  const scene = new Scene();
  scene.fog = new FogExp2(0xb98c6e, 0.016);

  const camera = new PerspectiveCamera(52, 1, 0.12, 1250);

  /* ---------- 世界 ---------- */
  const climate = new Climate();
  const lighting = new Lighting();
  scene.add(lighting.sun, lighting.sun.target, lighting.hemi, lighting.fill);

  const sky = new Sky();
  scene.add(sky.mesh);

  const terrain: TerrainRig = makeTerrain();
  scene.add(terrain.mesh);

  const rocks = makeRocks(12, terrain.heightAt);
  for (const r of rocks.meshes) scene.add(r);

  const mountains = makeMountains();
  for (const m of mountains.meshes) scene.add(m);

  const fogPatches = new FogPatches(scene, terrain.heightAt);

  const cabin = buildCabin(terrain.heightAt);
  scene.add(cabin.group);

  const forest = plantForest({ heightAt: terrain.heightAt, rocks: rocks.colliders });
  scene.add(forest.mesh);

  /* ---------- 相机 ---------- */
  const colliders: Collider[] = rocks.colliders.map((c) => ({
    type: 'cyl',
    x: c.x,
    z: c.z,
    r: c.r,
    y0: terrain.heightAt(c.x, c.z) - 1,
    y1: terrain.heightAt(c.x, c.z) + 3
  }));
  colliders.push(...cabin.colliders, ...forest.colliders);
  const rig = new OrbitRig(camera, canvas, {
    yaw: params.yaw ?? undefined,
    dist: params.dist ?? undefined,
    cam: params.cam ?? undefined
  });
  rig.terrainFn = terrain.heightAt;
  rig.colliders = colliders;
  rig.setDblClickTargets([terrain.mesh, ...rocks.meshes]);
  rig.frozen = params.shot || params.t !== null;
  rig.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 初始光照状态 ---------- */
  const startPreset = (params.light ?? 'dusk') as PresetId;
  climate.setClock(PRESET_CLOCK[startPreset]);
  if (params.t !== null) climate.setClock(params.t);

  /* ---------- 光影面板（shot/bench 模式不装） ---------- */
  let panel: PanelApi | null = null;
  if (!params.shot && !params.bench) {
    panel = createPanel({
      locked: params.light !== null,
      defaultShadow: TIER.shadow,
      startPreset,
      onPreset: (id) => climate.setPreset(id),
      onShadow: (n) => lighting.setShadowResolution(n)
    });
  }

  const dpr = Math.min(window.devicePixelRatio || 1, TIER.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const post = new PostFX(renderer, scene, camera, TIER.msaa);
  post.bloom.strength = climate.frame.bloom;

  lighting.setShadowResolution(TIER.shadow);

  /* ---------- 氛围粒子（炊烟 / 萤火虫） ---------- */
  const smoke = createSmoke(cabin.smokeAnchor, dpr);
  scene.add(smoke.points);
  const fireflies = createFireflies({ heightAt: terrain.heightAt, dpr });
  scene.add(fireflies.points);

  /* ---------- 性能 ---------- */
  const perf = new PerfSampler(renderer, params.shot || params.bench);
  let frames = 0;
  let benchStage = 0; // 0=未写 1=几何统计已写 2=完整性能已写
  const writeBench = (extra: Record<string, unknown>): void => {
    let s = document.getElementById('__forest_bench');
    if (!s) {
      s = document.createElement('script');
      s.id = '__forest_bench';
      (s as HTMLScriptElement).type = 'application/json';
      document.body.appendChild(s);
    }
    s.textContent = JSON.stringify({ tier, dpr, calls: lastCalls, tris: lastTris, ...extra }, null, 2);
  };
  const maybeBench = (): void => {
    if (!params.bench) return;
    if (benchStage < 1 && frames >= 60) {
      benchStage = 1;
      writeBench({});
    }
    if (benchStage < 2) {
      const r = perf.report();
      if (r.samples >= 50) {
        benchStage = 2;
        writeBench({ frameP50: r.frameP50, frameP95: r.frameP95, frameP99: r.frameP99, cpuP50: r.cpuP50, samples: r.samples, device: r.device });
      }
    }
  };

  /* ---------- UI 提示 ---------- */
  if (!params.shot && !params.bench) {
    document.getElementById('hint')!.innerHTML =
      '拖拽 环绕 · 滚轮/双指 推拉 · 双击 定格<br><kbd>1</kbd>-<kbd>4</kbd> 黄昏 / 蓝调 / 夜晚 / 黎明 · 右上 ⚙ 光影面板';
  }

  const PRESET_KEYS: readonly PresetId[] = ['dusk', 'blue', 'night', 'dawn'];
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === '1' || k === '2' || k === '3' || k === '4') {
      // 焦点在面板内时不接管滑杆操作
      if (e.target instanceof HTMLElement && e.target.closest('#fx-panel,#fx-handle')) return;
      const id = PRESET_KEYS[Number(k) - 1];
      climate.setPreset(id);
      panel?.onExternalPreset(id);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, TIER.dpr));
  });
  post.setSize(window.innerWidth, window.innerHeight, dpr);

  /* ---------- 主循环 ---------- */
  let lastT = performance.now();
  let elapsed = 0;
  let revealed = false;
  let lastCalls = 0;
  let lastTris = 0;

  const tick = (): void => {
    requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1;

    perf.begin();
    const alive = !params.shot && params.t === null;
    panel?.feedFrame(climate.frame);
    panel?.applyToClimate(climate);
    climate.update(alive ? dt : 0);
    const f = climate.frame;
    const dirs = lighting.update(f);

    const fog = scene.fog as FogExp2;
    fog.color.copy(f.fogCol);
    fog.density = f.fogD;
    mountains.update(f);
    cabin.setClimate(f, panel ? { fire: panel.mul('fire'), win: panel.mul('win') } : undefined);

    elapsed = alive ? elapsed + dt : elapsed;
    sky.update(f, dirs.sunDir, dirs.moonDir, elapsed);
    fogPatches.update(f, elapsed, !alive);
    smoke.update(alive ? dt * (rig.reduced ? 0.4 : 1) : 0, f, panel ? panel.mul('smoke') : 1);
    fireflies.update(alive ? dt : 0, f, rig.reduced ? 0.35 : 1);
    rig.update(alive ? dt : 0, elapsed);

    renderer.toneMappingExposure = f.exposure * (panel?.mul('exp') ?? 1);
    post.bloom.strength = f.bloom * (panel?.mul('bloom') ?? 1);
    post.setDisplayFX(panel?.mul('grain') ?? 1, panel?.mul('vig') ?? 1);
    renderer.info.reset();
    post.render(dt === 0 ? 1 / 60 : dt, elapsed);
    perf.end(renderer);
    lastCalls = renderer.info.render.calls;
    lastTris = renderer.info.render.triangles;
    frames++;

    if (!revealed) {
      revealed = true;
      const loading = document.getElementById('loading')!;
      // fastload：headless 取证截图用——loading 立即消失，避免网络空闲抢拍撞上 0.6s 淡出
      if (params.shot || params.bench || new URLSearchParams(window.location.search).has('fastload')) {
        loading.style.transition = 'none';
      }
      loading.classList.add('gone');
      // 淡出完成后整体移出合成层（headless 合成下 opacity 卡帧的兜底）
      window.setTimeout(() => { loading.style.display = 'none'; }, 900);
    }
    maybeBench();
  };
  requestAnimationFrame(tick);
}

boot();
