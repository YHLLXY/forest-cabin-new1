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
import { OrbitRig, type Collider } from './camera/rig';

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

  /* ---------- 相机 ---------- */
  const colliders: Collider[] = rocks.colliders.map((c) => ({
    type: 'cyl',
    x: c.x,
    z: c.z,
    r: c.r,
    y0: terrain.heightAt(c.x, c.z) - 1,
    y1: terrain.heightAt(c.x, c.z) + 3
  }));
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

  const dpr = Math.min(window.devicePixelRatio || 1, TIER.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const post = new PostFX(renderer, scene, camera, TIER.msaa);
  post.bloom.strength = climate.frame.bloom;

  lighting.setShadowResolution(TIER.shadow);

  /* ---------- 性能 ---------- */
  const perf = new PerfSampler(renderer, params.shot || params.bench);
  let benchWrote = false;
  const maybeBench = (): void => {
    if (!params.bench || benchWrote) return;
    const r = perf.report();
    if (r.samples >= 50) {
      benchWrote = true;
      let s = document.getElementById('__forest_bench');
      if (!s) {
        s = document.createElement('script');
        s.id = '__forest_bench';
        (s as HTMLScriptElement).type = 'application/json';
        document.body.appendChild(s);
      }
      s.textContent = JSON.stringify({ ...r, tier, dpr }, null, 2);
    }
  };

  /* ---------- UI 提示 ---------- */
  if (!params.shot && !params.bench) {
    document.getElementById('hint')!.innerHTML =
      '拖拽 环绕 · 滚轮/双指 推拉 · 双击 定格<br><kbd>1</kbd>-<kbd>4</kbd> 黄昏 / 蓝调 / 夜晚 / 黎明';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '1') climate.setPreset('dusk');
    else if (e.key === '2') climate.setPreset('blue');
    else if (e.key === '3') climate.setPreset('night');
    else if (e.key === '4') climate.setPreset('dawn');
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

  const tick = (): void => {
    requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1;

    perf.begin();
    const alive = !params.shot && params.t === null;
    climate.update(alive ? dt : 0);
    const f = climate.frame;
    const dirs = lighting.update(f);

    const fog = scene.fog as FogExp2;
    fog.color.copy(f.fogCol);
    fog.density = f.fogD;
    mountains.update(f);

    elapsed = alive ? elapsed + dt : elapsed;
    sky.update(f, dirs.sunDir, dirs.moonDir, elapsed);
    fogPatches.update(f, elapsed, !alive);
    rig.update(alive ? dt : 0, elapsed);

    renderer.toneMappingExposure = f.exposure;
    post.bloom.strength = f.bloom;
    renderer.info.reset();
    post.render(dt === 0 ? 1 / 60 : dt, elapsed);
    perf.end(renderer);

    if (!revealed) {
      revealed = true;
      const loading = document.getElementById('loading')!;
      if (params.shot || params.bench) loading.style.transition = 'none';
      loading.classList.add('gone');
    }
    maybeBench();
  };
  requestAnimationFrame(tick);
}

boot();
