import type * as THREE_NS from "three";
import type { Phase } from "../lib/controller.ts";
import type { GiftLevel, ThemeId } from "../lib/levels.ts";
import type { SoundId } from "../lib/audio/manifest.ts";

export type THREE = typeof THREE_NS;

/** Everything a scene may read. Derived from the controller snapshot every frame; scenes never touch the queue. */
export interface VisualState {
  theme: ThemeId;
  phase: Phase;
  level: GiftLevel;
  /** true while a transaction is running */
  active: boolean;
  /** ms since the transaction started (0 in standby) */
  txMs: number;
  timeline: { processingMs: number; mainMs: number; holdMs: number };
  /** deterministic per-event number (route choice, variations) */
  seed: number;
  intensity: number;
  idleEnabled: boolean;
}

export interface SceneCtx {
  THREE: THREE;
  renderer: THREE_NS.WebGLRenderer;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  env: THREE_NS.Texture;
  /** effect cue → sound (host plays it through the shared AudioEngine; silent if audio is inactive) */
  cue: (id: SoundId, o?: { rate?: number; gain?: number }) => void;
  quality: 0 | 1;
}

export interface SceneApi {
  /** dt in seconds (clamped), t = seconds of monotonic scene clock (frozen when idle animation is disabled) */
  update(dt: number, t: number, s: VisualState): void;
  setQuality(q: 0 | 1): void;
  dispose(): void;
}

export type SceneFactory = (ctx: SceneCtx) => SceneApi;

export type GlStatus = "ok" | "lost" | "unavailable";
