import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import type { ClimateFrame } from './climate';
import type { Vector3 } from 'three';

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uSunDir, uMoonDir, uTop, uHor, uGlowCol, uCloudTint, uFogCol;
  uniform float uGlowS, uStar, uMoonA, uTime, uCloud;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 4; k++) {
      v += a * noise2(p);
      p = p * 2.13 + 17.7;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vWorld);
    float y = d.y;
    float sd = max(dot(d, uSunDir), 0.0);

    // 天色渐变：贴地平线亮，天顶深
    vec3 col = mix(uHor, uTop, exp(-max(y, 0.0) * 3.1));
    if (y < 0.0) {
      // 地平线以下：压暗一档的雾色，与被雾吞没的地形边缘衔接，山环缝隙露出的部分不会像发光横幅
      col = mix(uFogCol * 0.55, uHor, 0.30 * exp(y * 7.0));
    }

    // 太阳大范围散射 + 贴地平亮带
    float band = exp(-abs(y) * 4.4);
    col += uGlowCol * uGlowS * pow(sd, 14.0) * (0.35 + 0.65 * band);
    col += uGlowCol * uGlowS * 0.22 * exp(-abs(y) * 8.5) * pow(sd, 3.0);

    // 日轮（落山后隐没）
    float disc = smoothstep(0.99975, 0.99989, sd);
    col += uGlowCol * disc * max(uGlowS, 0.9) * smoothstep(-0.045, 0.02, uSunDir.y);

    // 星星（天完全黑下来才出现，避免亮天空上出彩色噪点）
    float starMask = uStar * smoothstep(0.06, 0.3, y) * step(0.35, uStar);
    float h = hash31(floor(d * 260.0));
    float star = step(0.9967, h);
    float tw = 0.70 + 0.30 * sin(uTime * (2.0 + h * 5.0) + h * 63.0);
    col += vec3(0.82, 0.88, 1.0) * star * tw * starMask * 0.72;

    // 月亮：盘 + 月晕 + 暗斑
    float md = max(dot(d, uMoonDir), 0.0);
    float mDisc = smoothstep(0.99942, 0.99980, md);
    float mDot = fbm(d.xz * 42.0 + d.y * 17.0) * 0.55 + 0.45;
    vec3 moonSurf = vec3(0.82, 0.86, 0.95) * (0.72 + 0.38 * mDot);
    col += moonSurf * mDisc * uMoonA;
    col += vec3(0.58, 0.66, 0.90) * pow(md, 170.0) * 0.30 * uMoonA;

    // 云：天球平面投影 + fbm，云缘朝太阳方向透光
    if (y > 0.006) {
      vec2 cp = d.xz / (y * 2.3 + 0.16);
      float n = fbm(cp * 0.80 + vec2(uTime * 0.011, uTime * 0.0043));
      float cov = smoothstep(0.60 - uCloud * 0.30, 0.95 - uCloud * 0.26, n);
      float lit = dot(d, uSunDir) * 0.5 + 0.5;
      float edge = smoothstep(0.30, 0.72, n) * (1.0 - smoothstep(0.72, 0.95, n));
      vec3 cloudCol = uCloudTint * mix(0.52, 1.06, lit + edge * 0.35);
      col = mix(col, cloudCol, cov * exp(-y * 1.9) * 0.9);
    }

    // 抖动去色带
    col += (hash12(gl_FragCoord.xy + fract(uTime)) - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Sky {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private v = { x: 0, y: 0, z: 0 };

  constructor() {
    this.mat = new ShaderMaterial({
      uniforms: {
        uSunDir: { value: [0, 1, 0] },
        uMoonDir: { value: [0, -1, 0] },
        uTop: { value: [0.1, 0.15, 0.3] },
        uHor: { value: [1.0, 0.6, 0.3] },
        uGlowCol: { value: [1.0, 0.5, 0.2] },
        uCloudTint: { value: [1, 0.8, 0.6] },
        uFogCol: { value: [0.7, 0.55, 0.45] },
        uGlowS: { value: 1.25 },
        uStar: { value: 0 },
        uMoonA: { value: 0 },
        uTime: { value: 0 },
        uCloud: { value: 0.4 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false
    });
    this.mesh = new Mesh(new SphereGeometry(430, 48, 24), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  update(f: ClimateFrame, sunDir: Vector3, moonDir: Vector3, elapsed: number): void {
    const u = this.mat.uniforms;
    const sun = Array.isArray(u.uSunDir.value) ? u.uSunDir.value : null;
    if (sun) {
      sun[0] = sunDir.x; sun[1] = sunDir.y; sun[2] = sunDir.z;
    }
    const moon = Array.isArray(u.uMoonDir.value) ? u.uMoonDir.value : null;
    if (moon) {
      moon[0] = moonDir.x; moon[1] = moonDir.y; moon[2] = moonDir.z;
    }
    const c = this.v;
    const setCol = (name: string, ref: { r: number; g: number; b: number }): void => {
      const arr = u[name].value as number[] | null;
      if (Array.isArray(arr)) {
        arr[0] = ref.r; arr[1] = ref.g; arr[2] = ref.b;
      }
    };
    void c;
    setCol('uTop', f.skyTop);
    setCol('uHor', f.skyHor);
    setCol('uGlowCol', f.glow);
    setCol('uCloudTint', f.cloudTint);
    setCol('uFogCol', f.fogCol);
    u.uGlowS.value = f.glowS;
    u.uStar.value = f.star;
    u.uMoonA.value = f.moonDisc;
    u.uCloud.value = f.cloud;
    u.uTime.value = elapsed;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
