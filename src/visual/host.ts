import * as THREE from "three";
import type { SoundId } from "../lib/audio/manifest.ts";
import { visualStats } from "./debug.ts";
import { makeEnvironment } from "./materials.ts";
import type { GlStatus, SceneApi, SceneCtx, SceneFactory, VisualState } from "./types.ts";

export const STAGE_W = 540;
export const STAGE_H = 960;

export interface HostOptions {
  container: HTMLElement;
  factory: SceneFactory;
  /** read the current visual state (called once per rendered frame) */
  getState: () => VisualState;
  cue: (id: SoundId, o?: { rate?: number; gain?: number }) => void;
  fpsCap?: number;
  maxDpr?: number;
  onStatus?: (s: GlStatus) => void;
  /** theme name for the debug monitor */
  label: string;
}

/**
 * One WebGL canvas + one requestAnimationFrame loop. Owns renderer, environment, resize, adaptive quality,
 * visibility handling and context-loss recovery. Scene code only builds objects and animates them from state.
 * Throws from the constructor when WebGL cannot be created (caller shows the DOM fallback).
 */
export class ThreeHost {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, STAGE_W / STAGE_H, 0.1, 100);
  private env: THREE.Texture;
  private api: SceneApi | null = null;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private acc = 0;
  private frozenClock = 0;
  private quality: 0 | 1 = 1;
  private dprScale = 1;
  private slow = 0;
  private fpsFrames = 0;
  private fpsT0 = 0;
  private frameMsSum = 0;
  private disposed = false;
  private ro: ResizeObserver | null = null;
  private status: GlStatus = "ok";
  private lostCount = 0;
  private lostAt: number[] = [];
  /** getExtension() returns null on a lost context, so the handle is kept from creation (test hook only) */
  private loseExt: WEBGL_lose_context | null = null;

  constructor(private o: HostOptions) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
    canvas.setAttribute("aria-hidden", "true");
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance", premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    o.container.appendChild(canvas);
    this.camera.position.set(0, 0.2, 20.2);
    this.camera.lookAt(0, 0.2, 0);
    this.env = makeEnvironment(this.renderer);
    this.scene.environment = this.env;
    this.build();
    canvas.addEventListener("webglcontextlost", this.onLost as EventListener, false);
    canvas.addEventListener("webglcontextrestored", this.onRestored, false);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.container);
    this.resize();
    const gl = this.renderer.getContext();
    this.loseExt = gl.getExtension("WEBGL_lose_context");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    visualStats.set({ webgl: "ok", renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 60) : "n/a", quality: this.quality });
    this.raf = requestAnimationFrame(this.frame);
  }

  private build(): void {
    this.api?.dispose();
    this.disposeSceneChildren();
    const ctx: SceneCtx = { THREE, renderer: this.renderer, scene: this.scene, camera: this.camera, env: this.env, cue: this.o.cue, quality: this.quality };
    this.api = this.o.factory(ctx);
  }

  private disposeSceneChildren(): void {
    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        Object.values(x).forEach((v) => (v as { isTexture?: boolean; dispose?: () => void } | null)?.isTexture && v !== this.env && (v as THREE.Texture).dispose());
        x.dispose();
      });
    });
    this.scene.clear();
    this.scene.environment = this.env;
  }

  private setStatus(s: GlStatus): void {
    this.status = s;
    visualStats.set({ webgl: s });
    this.o.onStatus?.(s);
  }

  private onLost = (e: Event): void => {
    e.preventDefault(); // allows restoration
    this.setStatus("lost");
    const now = Date.now();
    this.lostAt = [...this.lostAt.filter((t) => now - t < 60_000), now];
    this.lostCount += 1;
    // repeated losses → give up so the caller can show the DOM fallback instead of thrashing
    if (this.lostAt.length >= 3) this.o.onStatus?.("unavailable");
  };

  private onRestored = (): void => {
    if (this.disposed) return;
    this.env = makeEnvironment(this.renderer);
    this.scene.environment = this.env;
    this.build();
    this.resize();
    this.setStatus("ok");
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (!this.raf && !this.disposed) {
      // resume cleanly: no catch-up burst; animation is derived from wall-clock state so it snaps to the right moment
      this.last = performance.now();
      this.acc = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private resize(): void {
    const r = this.o.container.getBoundingClientRect();
    if (r.width < 2) return;
    const stageScale = r.width / STAGE_W; // CSS-transform scale of the 540x960 stage
    const dpr = Math.min(this.o.maxDpr ?? 1.5, Math.max(1, window.devicePixelRatio || 1));
    const ratio = Math.min(2, Math.max(0.6, dpr * stageScale * this.dprScale));
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(STAGE_W, STAGE_H, false);
    visualStats.set({ dpr: Math.round(ratio * 100) / 100 });
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.status !== "ok") return;
    const st = this.o.getState();
    const idleFrozen = !st.idleEnabled && !st.active;
    const cap = idleFrozen ? 4 : this.o.fpsCap ?? 30;
    const interval = 1000 / cap;
    this.acc += now - this.last;
    this.last = now;
    if (this.acc < interval - 2) return;
    const dtMs = Math.min(100, this.acc);
    this.acc = this.acc % interval;
    const dt = idleFrozen ? 0 : dtMs / 1000; // frozen idle: nothing may advance (scene accumulators use dt)
    if (!idleFrozen) this.clock += dt;
    // frozen idle animation: freeze the idle clock but keep transactions moving
    const t = idleFrozen ? this.frozenClock : (this.frozenClock = this.clock);
    this.api?.update(dt, t, st);
    this.renderer.render(this.scene, this.camera);
    this.adapt(dtMs, interval, now);
  };

  /** Adaptive quality: sustained slow frames → lower resolution first, then lower effects. Sticky for the session. */
  private adapt(dtMs: number, interval: number, now: number): void {
    this.fpsFrames++;
    this.frameMsSum += dtMs;
    if (now - this.fpsT0 >= 500) {
      const info = this.renderer.info;
      visualStats.set({
        fps: Math.round((this.fpsFrames * 1000) / (now - this.fpsT0)),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      });
      const avg = this.frameMsSum / this.fpsFrames;
      this.slow = avg > interval * 1.55 ? this.slow + 1 : Math.max(0, this.slow - 1);
      if (this.slow >= 6) {
        this.slow = 0;
        if (this.dprScale > 0.7) {
          this.dprScale = 0.7;
          this.resize();
        } else if (this.quality === 1) {
          this.quality = 0;
          this.api?.setQuality(0);
          visualStats.set({ quality: 0 });
        }
      }
      this.fpsFrames = 0;
      this.frameMsSum = 0;
      this.fpsT0 = now;
    }
  }

  /** Test hook: force a context loss/restore round trip. */
  loseContextForTest(): void {
    this.loseExt?.loseContext();
  }
  restoreContextForTest(): void {
    this.loseExt?.restoreContext();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.onLost as EventListener);
    canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.api?.dispose();
    this.api = null;
    this.disposeSceneChildren();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // free the GPU context immediately (iOS keeps few)
    canvas.remove();
    visualStats.set({ webgl: "n/a", fps: 0, drawCalls: 0 });
  }
}
