import { AUDIO_MANIFEST, type SoundId } from "./audio/manifest.ts";
import type { DispensePlan } from "./dispense.ts";
import type { GiftLevel, ThemeId } from "./levels.ts";

export interface SoundCue {
  id: SoundId;
  /** playback rate (also changes pitch); default 1 */
  rate?: number;
}

export interface Profile {
  processingMs: number;
  mainMs: number;
  holdMs: number;
  proc: SoundCue[];
  main: SoundCue[];
  /** end-of-transaction confirmation */
  success: SoundCue | null;
}

export interface AtmTiming {
  processingJoinMs: number;
  processingGiftMs: number;
  dispenseMinMs: number;
  completeHoldMs: number;
  animScale: number;
}

const c = (id: SoundId, rate?: number): SoundCue => (rate ? { id, rate } : { id });

/** Total nominal playing time (ms) of a cue list (sequential playback). */
export function soundMs(cues: SoundCue[]): number {
  return cues.reduce((sum, q) => sum + AUDIO_MANIFEST[q.id].nominalMs / (q.rate ?? 1), 0);
}

/** Reactor / marble stage lengths (ms), index = level. Sound lengths must fit inside (unit-tested). */
export const REACTOR_MS: Record<GiftLevel, [number, number, number]> = {
  0: [1000, 1600, 1400],
  1: [1500, 2200, 1500],
  2: [2200, 3200, 1800],
  3: [3200, 4200, 2200],
  4: [4200, 6200, 3000],
};
export const MARBLE_MS: Record<GiftLevel, [number, number, number]> = {
  0: [900, 3600, 1200],
  1: [1000, 4600, 1300],
  2: [1200, 6200, 1500],
  3: [1500, 8200, 2000],
  4: [2000, 11000, 3000],
};

/**
 * One place that says how long each stage of a transaction takes and which sounds play, per theme + level.
 * ATM numbers reproduce the original behaviour exactly (so the working ATM is not disturbed).
 * `welcomeMs` stretches only the hold of a join (a welcome never gets shorter than its animation).
 */
export function profileFor(theme: ThemeId, level: GiftLevel, plan: DispensePlan, t: AtmTiming, welcomeMs: number): Profile {
  const s = theme === "atm" ? 1 : t.animScale;
  let p: Profile;
  if (theme === "atm") {
    const join = level === 0;
    const proc = join ? t.processingJoinMs : t.processingGiftMs;
    const main = level === 4 ? 6500 * t.animScale : Math.max(plan.animMs, t.dispenseMinMs) * t.animScale;
    const hold = level === 4 ? 2500 * t.animScale : t.completeHoldMs;
    p = {
      processingMs: level === 4 ? 2400 * t.animScale : proc,
      mainMs: main,
      holdMs: hold,
      proc: [c(join ? "processing" : "gift_processing")],
      main: level === 3 ? [c("premium_dispense")] : level === 4 ? [c("premium_dispense"), c("cash_dispense")] : [c("cash_dispense")],
      success: c("success"),
    };
  } else if (theme === "reactor") {
    const [a, b, h] = REACTOR_MS[level];
    p = {
      processingMs: a * s, mainMs: b * s, holdMs: h * s,
      proc: level === 0 ? [c("rx_pulse")] : [c("rx_charge", level === 1 ? 2.2 : level === 2 ? 1.5 : level === 3 ? 1.0 : 0.85)],
      main: level === 0 ? [] : [c(level === 4 ? "rx_special" : "rx_release", level === 1 ? 1.6 : level === 2 ? 1.2 : 1)],
      success: null,
    };
  } else {
    const [a, b, h] = MARBLE_MS[level];
    p = {
      processingMs: a * s, mainMs: b * s, holdMs: h * s,
      proc: [c("mb_launch")],
      main: level === 4 ? [c("mb_finale")] : [],
      success: null,
    };
  }
  // a stage never ends before its sound does (the controller would wait for the sound anyway)
  p.processingMs = Math.max(p.processingMs, soundMs(p.proc) * t.animScale);
  p.mainMs = Math.max(p.mainMs, soundMs(p.main) * t.animScale);
  if (level === 0) {
    const total = p.processingMs + p.mainMs + p.holdMs;
    const want = welcomeMs * t.animScale;
    if (want > total) p.holdMs += want - total;
  }
  return p;
}
