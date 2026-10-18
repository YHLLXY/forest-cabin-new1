import type { WebGLRenderer } from 'three';

export interface PerfReport {
  /** 整帧耗时（含 GPU 完成）百分位 */
  frameP50: number;
  frameP95: number;
  frameP99: number;
  /** 仅 CPU 侧提交耗时中位数（参考） */
  cpuP50: number;
  drawCalls: number;
  triangles: number;
  samples: number;
  device: string;
}

const SYNC_EVERY = 10;       // 每 10 帧做一次 1px readPixels 往返强制同步
const REPORT_EVERY_MS = 8000;

/** 整帧 + 1px readPixels 往返测量。不用 rAF 间隔。 */
export class PerfSampler {
  private gl: WebGL2RenderingContext;
  private fbo: WebGLFramebuffer;
  private buf = new Uint8Array(4);
  private t0 = 0;
  private frames = 0;
  private sync: number[] = [];
  private cpu: number[] = [];
  private calls = 0;
  private tris = 0;
  private lastReportAt = 0;
  private device = 'unknown';
  private quiet = false;

  constructor(renderer: WebGLRenderer, quiet = false) {
    this.quiet = quiet;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.gl = gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) this.device = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    this.fbo = gl.createFramebuffer()!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  begin(): void {
    this.t0 = performance.now();
  }

  end(renderer: WebGLRenderer): void {
    const tSubmitted = performance.now();
    const info = renderer.info.render;
    this.calls = info.calls;
    this.tris = info.triangles;
    this.frames++;
    this.cpu.push(tSubmitted - this.t0);

    let measure = tSubmitted - this.t0;
    if (this.frames % SYNC_EVERY === 0) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.buf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      measure = performance.now() - this.t0;   // readPixels 强制 GPU 队列完成
      this.sync.push(measure);
    }

    const now = performance.now();
    if (now - this.lastReportAt > REPORT_EVERY_MS) {
      this.lastReportAt = now;
      if (!this.quiet && this.sync.length >= 30) {
        const r = this.report();
        console.info(
          `[perf] p50=${r.frameP50.toFixed(1)}ms  p95=${r.frameP95.toFixed(1)}ms  p99=${r.frameP99.toFixed(1)}ms  dc=${r.drawCalls}  tris=${(r.triangles / 1000).toFixed(0)}k`
        );
      }
    }
  }

  report(): PerfReport {
    const s = [...this.sync].sort((a, b) => a - b);
    const c = [...this.cpu].sort((a, b) => a - b);
    return {
      frameP50: pct(s, 0.5),
      frameP95: pct(s, 0.95),
      frameP99: pct(s, 0.99),
      cpuP50: pct(c, 0.5),
      drawCalls: this.calls,
      triangles: this.tris,
      samples: s.length,
      device: this.device
    };
  }

  reset(): void {
    this.sync.length = 0;
    this.cpu.length = 0;
    this.frames = 0;
  }
}

function pct(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}
