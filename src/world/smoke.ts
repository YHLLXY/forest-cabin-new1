/**
 * 炊烟 — 烟囱炊烟粒子系统（3b）
 *
 * 设计：
 * - 48 粒全 GPU 循环：vertex shader 用 fract(uTime/周期 + aOff) 算命期，
 *   CPU 每帧只写 4 个 uniform，零动态 buffer 写入，单 draw call
 * - 运动回路 = 升腾 2.4~3.3m(减速) + 西风 (-x,-z 0.35) 漂移 + 命期正弦摆（确定性可复现）
 *   粒子散布收紧成柱，尺寸放大叠出连贯烟柱
 * - 浓度滑杆（×0~3）：≤1 线性乘 alpha（0=无烟），>1 压缩淡出窗并抬上限（浓烟）
 * - 色：灰底 mix 雾色 35%，随太阳高度角夜暗昼亮；FogExp2 手动衰减（THREE 同式）
 * - dt=0（shot/冻结）时内积时间停走，截图可复现
 * - 盲区：frustumCulled=false——粒子真身在 shader 内生成，包围球不可用
 */
import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import type { ClimateFrame } from './climate';

const COUNT = 96;
const CYCLE = 9.0; // 单粒烟生→灭秒数
const TAU = Math.PI * 2;

export interface SmokeRig {
  points: Points;
  update(dt: number, f: ClimateFrame, mul: number): void;
  dispose(): void;
}

export function createSmoke(origin: Vector3, dpr: number): SmokeRig {
  let seed = 7757; // LCG 确定性撒点（与树林同思路）
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const offs = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    offs[i] = rnd();
    seeds[i] = rnd();
  }

  /* position 填 0——真实位置全部由 uOrigin + shader 内轨迹生成 */
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 3), 3));
  geo.setAttribute('aOff', new BufferAttribute(offs, 1));
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));

  const uniforms = {
    uTime: { value: 0 },
    uOrigin: { value: origin.clone() },
    uMul: { value: 1 },
    uAlpha: { value: 0.5 },
    uTint: { value: new Color(0.8, 0.78, 0.76) },
    uFogD: { value: 0.004 },
    uFogCol: { value: new Color(0.72, 0.55, 0.42) },
    uDpr: { value: dpr }
  } as const;

  const mat = new ShaderMaterial({
    uniforms: { ...uniforms },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aOff;
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uOrigin;
      uniform float uDpr;
      varying float vLife;
      varying float vSeed;
      varying float vZ;
      void main() {
        float life = fract(uTime / ${CYCLE.toFixed(2)} + aOff);
        vLife = life;
        vSeed = aSeed;
        // 喷口张开角：粒子绕 y 轴散开，避免一根“糖葫芦”
        float ang = aSeed * ${TAU.toFixed(4)} * (0.55 + aSeed * 0.45);
        float ca = cos(ang);
        float sa = sin(ang);
        float rise = (2.4 + aSeed * 0.9) * pow(life, 0.8); // 升腾减速
        float driftR = (0.5 + aSeed * 0.5) * pow(life, 1.5) * 3.2; // 横向扩散（收紧方差）
        vec3 sway = vec3(
          sin(life * 10.7 + aSeed * 41.0) * 0.18,
          sin(life * 6.6 + aSeed * 17.0) * 0.10,
          cos(life * 9.1 + aSeed * 23.0) * 0.18
        ) * life;
        // 西风：漂向 -x 越过林梢，离屋而去
        vec3 pos = uOrigin
          + vec3(-driftR * 1.45, rise, -driftR * 0.35)
          + vec3(-driftR * (ca - 0.5) * 0.7, 0.0, -driftR * (sa - 0.5) * 0.7)
          + sway;
        vec4 mv4 = modelViewMatrix * vec4(pos, 1.0);
        vec3 mv = mv4.xyz;
        vZ = -mv.z;
        float size = (3.0 + life * 3.6 + aSeed * 0.6) * uDpr * 46.0 / max(1.0, -mv.z);
        gl_PointSize = clamp(size, 2.0, 260.0);
        gl_Position = projectionMatrix * mv4;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMul;
      uniform float uAlpha;
      uniform vec3 uTint;
      uniform float uFogD;
      uniform vec3 uFogCol;
      varying float vLife;
      varying float vZ;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float soft = smoothstep(0.5, 0.1, length(d));
        float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.6, 1.0, vLife));
        float dens = uMul <= 1.0 ? uMul : 1.0 + (uMul - 1.0) * 0.22;
        float a = soft * fade * uAlpha * min(dens, 1.35);
        if (a < 0.003) discard;
        float fogFactor = 1.0 - exp(-uFogD * uFogD * vZ * vZ);
        vec3 col = mix(uTint, uFogCol, 0.35);
        col = mix(col, uFogCol, fogFactor * 0.9);
        gl_FragColor = vec4(col, a * (1.0 - fogFactor * 0.35));
      }`
  });

  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;

  let time = 0;
  return {
    points,
    update(dt, f, mul): void {
      time += dt;
      const u = mat.uniforms as {
        uTime: { value: number };
        uMul: { value: number };
        uAlpha: { value: number };
        uTint: { value: Color };
        uFogD: { value: number };
        uFogCol: { value: Color };
      };
      u.uTime.value = time;
      u.uMul.value = Math.max(0, mul);
      /* 夜暗昼亮：el -20°(夜)→6°(昼) 线性；夜间烟仍可见（月光/火光下的浅灰） */
      const dayK = Math.min(1, Math.max(0, (f.el + 20) / 26));
      u.uAlpha.value = 0.36 + 0.14 * dayK;
      /* 线性空间 authored：0.32≈sRGB 0.62（白天烟灰），0.17≈sRGB 0.45（夜里偏暗） */
      const gray = 0.17 + 0.15 * dayK;
      u.uTint.value.setRGB(gray, gray * 0.98, gray * 0.95);
      u.uFogD.value = f.fogD;
      u.uFogCol.value.copy(f.fogCol);
    },
    dispose(): void {
      geo.dispose();
      mat.dispose();
    }
  };
}
