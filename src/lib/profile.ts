import { AUDIO_MANIFEST, type SoundId } from "./audio/manifest.ts";
import type { DispensePlan } from "./dispense.ts";
import type { GiftLevel } from "./levels.ts";

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

/**
 * How long each stage of a transaction takes and which sounds play, per gift level (ATM).
 * `welcomeMs` stretches only the hold of a join (a welcome never gets shorter than its animation).
 */
export function profileFor(level: GiftLevel, plan: DispensePlan, t: AtmTiming, welcomeMs: number): Profile {
  const join = level === 0;
  const p: Profile = {
    processingMs: level === 4 ? 2400 * t.animScale : join ? t.processingJoinMs : t.processingGiftMs,
    mainMs: level === 4 ? 6500 * t.animScale : Math.max(plan.animMs, t.dispenseMinMs) * t.animScale,
    holdMs: level === 4 ? 2500 * t.animScale : t.completeHoldMs,
    proc: [c(join ? "processing" : "gift_processing")],
    main: level === 3 ? [c("premium_dispense")] : level === 4 ? [c("premium_dispense"), c("cash_dispense")] : [c("cash_dispense")],
    success: c("success"),
  };
  // a stage never ends before its sound does (the controller would wait for the sound anyway)
  p.processingMs = Math.max(p.processingMs, soundMs(p.proc) * t.animScale);
  p.mainMs = Math.max(p.mainMs, soundMs(p.main) * t.animScale);
  if (join) {
    const total = p.processingMs + p.mainMs + p.holdMs;
    const want = welcomeMs * t.animScale;
    if (want > total) p.holdMs += want - total;
  }
  return p;
}
