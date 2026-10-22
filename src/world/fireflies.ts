/**
 * 萤火虫 — 屋前草甸萤火虫光点（3b）
 *
 * 设计：
 * - 96 粒单 draw call；base 位置 CPU 用 LCG 确定撒点（屋前环带 r 3.5~16m，
 *   贴地形 +0.35~1.5m），每帧只写 uniform，零动态 buffer
 * - 游走 = 三频 Lissajous（x/z 独立正弦 + y 短幅），闪烁 = sin^6 尖脉冲
 *   （CTA 相位错开，抽样点亮而非同闪）
 * - 门控：太阳高度角 el 16°→6° 越线淡入，白天彻底归零（黎明 el=28 → 不可见）；
 *   夜里随 el 再抬 35% 辉度
 * - additive + 无深度写入：光感优先，深度测试保留（会被屋体/树干遮挡）
 * - dt=0 冻结时间，reduced-motion 由 motionScale 收幅
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import type { ClimateFrame } from './climate';

const COUNT = 96;
const TAU = Math.PI * 2;

export interface FirefliesRig {
  points: Points;
  update(dt: number, f: ClimateFrame, motionScale: number): void;
  dispose(): void;
}

export function createFireflies(opts: {
  heightAt: (x: number, z: number) => number;
  center?: Vector3;
  dpr: number;
}): FirefliesRig {
  let seed = 2468;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const cx = opts.center?.x ?? 0;
  const cz = opts.center?.z ?? 0;

  const base = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT * 4); // 相位：xy=游走，z=闪烁，w=半径微差
  for (let i = 0; i < COUNT; i++) {
    const ang = rnd() * TAU;
    const r = 3.5 + Math.sqrt(rnd()) * 12.5; // 3.5~16m，面积均匀
    let x = cx + Math.cos(ang) * r;
    let z = cz + Math.sin(ang) * r;
    x = Math.round(x * 100) / 100; // 稳定小数，防 heightAt 噪声抖动
    z = Math.round(z * 100) / 100;
    base[i * 3] = x;
    base[i * 3 + 1] = opts.heightAt(x, z) + 0.35 + rnd() * 1.15;
    base[i * 3 + 2] = z;
    phase[i * 4] = rnd() * TAU;
    phase[i * 4 + 1] = rnd() * TAU;
    phase[i * 4 + 2] = rnd() * TAU;
    phase[i * 4 + 3] = 0.75 + rnd() * 0.5;
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(base, 3));
  geo.setAttribute('phase', new BufferAttribute(phase, 4));

  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAct: { value: 0 },
      uMotion: { value: 1 },
      uCol: { value: new Vector3(0.72, 1.0, 0.42) },
      uFogD: { value: 0.004 },
      uFogCol: { value: new Vector3(0.72, 0.55, 0.42) },
      uDpr: { value: opts.dpr }
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 phase;
      uniform float uTime;
      uniform float uMotion;
      uniform float uDpr;
      uniform float uAct;
      varying float vBlink;
      void main() {
        float t = uTime;
        vec3 wob = vec3(
          sin(t * 0.31 + phase.x) + 0.55 * sin(t * 0.83 + phase.y * 2.0),
          0.85 * sin(t * 0.23 + phase.y),
          cos(t * 0.27 + phase.z) + 0.55 * sin(t * 0.71 + phase.x * 1.7)
        ) * (0.55 + phase.w * 0.4) * uMotion * 0.85;
        vec3 pos = position + wob * 0.55;
        // 闪烁：尖脉冲，各体相位错开
        float pulse = sin(t * 2.6 + phase.z * 5.0) * 0.5 + 0.5;
        vBlink = 0.35 + 0.65 * pow(pulse, 4.5);
        vec4 mv4 = modelViewMatrix * vec4(pos, 1.0);
        float d = -mv4.z;
        float size = phase.w * uDpr * 34.0 / max(1.0, d);
        gl_PointSize = clamp(size, 3.0, 30.0);
        gl_Position = projectionMatrix * mv4;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAct;
      uniform vec3 uCol;
      uniform float uFogD;
      uniform vec3 uFogCol;
      varying float vBlink;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float core = smoothstep(0.5, 0.02, length(d));
        float halo = core * core * 0.5;
        float a = (core + halo) * vBlink * uAct;
        if (a < 0.004) discard;
        vec3 col = uCol + vec3(0.28, 0.0, 0.58) * vBlink * 0.35;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`
  });

  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;

  let time = 0;
  const uniformsF = mat.uniforms as {
    uTime: { value: number };
    uAct: { value: number };
    uMotion: { value: number };
    uFogD: { value: number };
    uFogCol: { value: Vector3 };
  };
  return {
    points,
    update(dt, f, motionScale): void {
      time += dt;
      uniformsF.uTime.value = time;
      uniformsF.uMotion.value = Math.max(0, motionScale);
      /* 门控：el 16→6 淡入；el<-6 后再加夜辉 */
      const gate = Math.min(1, Math.max(0, (16 - f.el) / 10));
      const boost = Math.min(1, Math.max(0, (-6 - f.el) / 14)) * 0.35;
      uniformsF.uAct.value = gate * (0.65 + boost);
      uniformsF.uFogD.value = f.fogD;
      (uniformsF.uFogCol.value as Vector3).set(f.fogCol.r, f.fogCol.g, f.fogCol.b);
    },
    dispose(): void {
      geo.dispose();
      mat.dispose();
    }
  };
}
