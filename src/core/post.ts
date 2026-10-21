import {
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * 链路顺序（需求书要求）：
 * HDR 线性渲染 → bloom（线性域）→ ACES tone map + sRGB（OutputPass）
 * → 显示空间特效：色散 → 暗角 → 颗粒（颗粒在 tone map 之后，暗部才被保留）
 */
const DisplayFXShader = {
  uniforms: {
    tDiffuse: { value: null as ShaderMaterial | null },
    uTime: { value: 0 },
    uSeed: { value: 17.0 },
    uGrain: { value: 0.04 },
    uVignette: { value: 0.30 },
    uDispersion: { value: 0.0002 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uSeed, uGrain, uVignette, uDispersion;
    varying vec2 vUv;

    float hash12(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // 轻微径向色散
      vec2 ca = c * r2 * uDispersion * 8.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - ca).b;

      // 暗角（显示空间）
      float vig = 1.0 - uVignette * smoothstep(0.16, 0.60, r2);
      col *= vig;

      // 胶片颗粒：中低亮度更明显，halton 无关帧噪声
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float g = hash12(vUv * vec2(1913.0, 1067.0) + vec2(uTime * 137.7 + uSeed, uTime * 91.3 - uSeed)) - 0.5;
      col += g * uGrain * mix(1.35, 0.55, luma);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private fx: ShaderPass;
  private frozen = false;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, msaa: number) {
    const size = new Vector2();
    renderer.getSize(size);
    const w = Math.max(2, Math.floor(size.x));
    const h = Math.max(2, Math.floor(size.y));

    const rt = new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      samples: msaa,
      depthBuffer: true
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(w, h), 0.42, 0.78, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fx = new ShaderPass(DisplayFXShader);
    this.fx.renderToScreen = true;
    this.composer.addPass(this.fx);
  }

  setSize(w: number, h: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  /** 静帧模式：颗粒噪声固定，保证截图可复现 */
  setFrozen(v: boolean): void {
    this.frozen = v;
  }

  /** 画面滑杆（倍率）→ 显示空间特效 */
  setDisplayFX(grainMul: number, vigMul: number): void {
    this.fx.uniforms.uGrain.value = Math.min(0.12, 0.04 * grainMul);
    this.fx.uniforms.uVignette.value = Math.min(0.62, 0.30 * vigMul);
  }

  render(dt: number, elapsed: number): void {
    this.fx.uniforms.uTime.value = this.frozen ? 0 : elapsed;
    this.composer.render(dt);
  }
}
