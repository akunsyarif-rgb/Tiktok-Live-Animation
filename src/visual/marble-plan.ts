import type { GiftLevel } from "../lib/levels.ts";

export const MARBLE_LOOP_S = 24;
export type Route = "short" | "main" | "special";
export type MarbleKind = "steel" | "brass" | "glass" | "gold";

export interface RunSpec {
  /** stable id inside one transaction / idle cycle */
  key: string;
  /** launch time: ms after transaction start (tx runs) or seconds into the idle loop (idle runs) */
  at: number;
  route: Route;
  kind: MarbleKind;
}

const KINDS: MarbleKind[] = ["steel", "brass", "glass"];

/** Idle: two marbles per 24 s loop, launched at fixed loop times (seamless). Seconds into the loop. */
export const IDLE_LAUNCHES: { at: number; kind: MarbleKind }[] = [
  { at: 2, kind: "steel" },
  { at: 13.5, kind: "brass" },
];

/** Marbles launched for a transaction. Deterministic in (level, seed, timeline). */
export function txRuns(level: GiftLevel, seed: number, processingMs: number, mainMs: number): RunSpec[] {
  const p = processingMs;
  const out: RunSpec[] = [];
  const kindAt = (i: number) => KINDS[(seed + i) % 3]!;
  if (level === 0) out.push({ key: "j0", at: p * 0.55, route: "short", kind: "steel" });
  else if (level === 1) out.push({ key: "s0", at: p * 0.7, route: "main", kind: "brass" });
  else if (level === 2) for (let i = 0; i < 4; i++) out.push({ key: `m${i}`, at: p * 0.5 + i * 650, route: "main", kind: kindAt(i) });
  else if (level === 3) for (let i = 0; i < 10; i++) out.push({ key: `b${i}`, at: p * 0.4 + i * 520, route: "main", kind: kindAt(i) });
  else {
    out.push({ key: "x-gold", at: p * 0.3, route: "special", kind: "gold" });
    for (let i = 0; i < 12; i++) out.push({ key: `x${i}`, at: p * 0.5 + i * 480, route: "main", kind: kindAt(i) });
    out.push({ key: "x-fin", at: p + mainMs * 0.7, route: "main", kind: "gold" });
  }
  return out;
}

/** 0 → 1 during the finale of a special transaction (last ~30 % of the main stage). */
export function finaleAmount(level: GiftLevel, txMs: number, processingMs: number, mainMs: number): number {
  if (level !== 4) return 0;
  const a = processingMs + mainMs * 0.68;
  return Math.min(1, Math.max(0, (txMs - a) / (mainMs * 0.3)));
}

// ---- deterministic motion along a path (no physics engine) ----

export interface TimeTable {
  /** cumulative time (s) at each sample */
  t: Float64Array;
  total: number;
}

/**
 * Energy-conservation timing: speed from height drop with friction loss, floored so flat ramps keep rolling.
 * ys[i] = height of sample i, ds[i] = distance between sample i and i+1 (length ys.length-1).
 */
export function buildTimeTable(ys: ArrayLike<number>, ds: ArrayLike<number>, g = 3.2, friction = 0.22, v0 = 0.8, vmin = 0.55): TimeTable {
  const n = ys.length;
  const t = new Float64Array(n);
  const speed = (i: number) => Math.max(vmin, Math.sqrt(v0 * v0 + 2 * g * (1 - friction) * Math.max(0, ys[0]! - ys[i]!)));
  for (let i = 1; i < n; i++) {
    const v = (speed(i - 1) + speed(i)) / 2;
    t[i] = t[i - 1]! + ds[i - 1]! / v;
  }
  return { t, total: t[n - 1]! };
}

/** Fractional sample index at time `s` seconds after launch (clamped to [0, n-1]). Binary search + interpolation. */
export function indexAt(tt: TimeTable, s: number): number {
  const n = tt.t.length;
  if (s <= 0) return 0;
  if (s >= tt.total) return n - 1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tt.t[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const span = tt.t[hi]! - tt.t[lo]!;
  return lo + (span > 0 ? (s - tt.t[lo]!) / span : 0);
}
