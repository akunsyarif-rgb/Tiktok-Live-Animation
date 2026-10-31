import type { GiftLevel } from "../lib/levels.ts";
import type { VisualState } from "./types.ts";

/** Length of the seamless idle loop (s). Every idle oscillator completes an integer number of cycles in it. */
export const REACTOR_LOOP_S = 24;

export const PEAK: Record<GiftLevel, number> = { 0: 0.42, 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.3 };
/** how many of the 5 rings are "driven" (bright + fast) */
export const RINGS_DRIVEN: Record<GiftLevel, number> = { 0: 2, 1: 2, 2: 3, 3: 4, 4: 5 };
export const ARCS: Record<GiftLevel, number> = { 0: 0, 1: 2, 2: 4, 3: 6, 4: 9 };
export const SHOCK: Record<GiftLevel, number> = { 0: 0.3, 1: 0.5, 2: 0.8, 3: 1.15, 4: 1.5 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const TAU = Math.PI * 2;

export interface ReactorFrame {
  /** 0..1.3 core energy */
  charge: number;
  /** 0..1 release flash/energy (decays) */
  release: number;
  /** 0..1 slow idle pulse travelling outward */
  pulse: number;
  /** shockwave rings: progress 0..1 and strength */
  shocks: { p: number; s: number }[];
  /** 0..1 how many arcs are alive (multiply by ARCS[level]) */
  arcEnv: number;
  /** extra spin multiplier for the mechanics */
  spin: number;
  /** 0..1 how "driven" the rings are */
  drive: number;
  /** 0..1 white-hot overcharge (level 4) */
  hot: number;
  /** 0..1 warning lamp */
  lamp: number;
}

/** Idle-only part: periodic with period REACTOR_LOOP_S → f(t) === f(t + 24). */
export function idleFrame(t: number): { charge: number; pulse: number; lamp: number } {
  const w = TAU / REACTOR_LOOP_S;
  const breathe = 0.5 + 0.5 * Math.sin(w * 4 * t); // 6 s
  const sec = 0.5 + 0.5 * Math.sin(w * 7 * t + 1.1); // 24/7 s: irregular feel, still seamless
  const charge = 0.16 + 0.07 * breathe + 0.025 * sec;
  // an outward pulse at t=3 and t=15 (each 1.4 s long)
  const local = ((t % REACTOR_LOOP_S) + REACTOR_LOOP_S) % REACTOR_LOOP_S;
  const p = (a: number) => (local >= a && local < a + 1.4 ? Math.sin(Math.PI * ((local - a) / 1.4)) : 0);
  const pulse = Math.max(p(3), p(15));
  const lamp = local % 8 < 0.4 ? 1 : 0; // warning lamp blink once per 8 s
  return { charge, pulse, lamp };
}

/**
 * Pure function of (state, scene clock). No randomness, no accumulated state → deterministic and seekable.
 * Stages: processing = charge-up, dispensing = release, complete = settle back to idle.
 */
export function reactorFrame(s: VisualState, t: number): ReactorFrame {
  const idle = idleFrame(t);
  const out: ReactorFrame = { charge: idle.charge, release: 0, pulse: idle.pulse, shocks: [], arcEnv: 0, spin: 1, drive: 0, hot: 0, lamp: idle.lamp };
  if (!s.active) return out;
  const { processingMs: p, mainMs: m, holdMs: h } = s.timeline;
  const lvl = s.level;
  const peak = PEAK[lvl] * (0.85 + 0.15 * s.intensity);
  const tx = s.txMs;
  if (tx < p) {
    const x = clamp01(tx / p);
    const k = lvl >= 3 ? Math.pow(smooth(x), 1.7) : smooth(x);
    out.charge = idle.charge + (peak - idle.charge) * k;
    out.drive = k;
    out.spin = 1 + 2.2 * k * (lvl + 1) / 3;
    out.arcEnv = lvl >= 3 ? Math.max(0, (x - 0.5) * 2) * 0.6 : 0;
    out.hot = lvl === 4 ? Math.max(0, x - 0.6) / 0.4 * 0.5 : 0;
  } else if (tx < p + m) {
    const r = clamp01((tx - p) / m);
    const fall = smooth(r * 2.5);
    out.charge = peak * (1 - 0.8 * fall) + idle.charge * 0.8 * fall;
    out.release = Math.exp(-r * 4.2);
    out.drive = 1 - smooth(r * 1.2) * 0.4;
    out.spin = 1 + 2.4 * (1 - smooth(r)) * (lvl + 1) / 3;
    out.arcEnv = Math.sin(Math.PI * clamp01(r * 1.15)) ;
    out.hot = lvl === 4 ? 1 - smooth(r * 1.4) * 0.8 : 0;
    const base = SHOCK[lvl];
    out.shocks.push({ p: clamp01(r / 0.55), s: base });
    if (lvl === 4) out.shocks.push({ p: clamp01((r - 0.42) / 0.55), s: base * 1.25 });
  } else {
    const q = smooth(clamp01((tx - p - m) / h));
    const from = peak * 0.2 + idle.charge * 0.8;
    out.charge = from + (idle.charge - from) * q;
    out.release = 0.1 * (1 - q);
    out.drive = 0.6 * (1 - q);
    out.spin = 1 + 0.8 * (1 - q);
    out.hot = lvl === 4 ? 0.2 * (1 - q) : 0;
  }
  return out;
}
