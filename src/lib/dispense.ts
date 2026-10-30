import type { AtmEvent } from "./events.ts";

export type Denomination = 2000 | 5000 | 10000 | 20000 | 50000 | 100000;

export interface DispensePlan {
  kind: "single" | "multi" | "bundle";
  notes: Denomination[];
  total: number;
  /** Time the dispense animation needs from phase start, ms. */
  animMs: number;
}

export const NOTE_STAGGER_MS = 300;
export const NOTE_START_MS = 400;
export const NOTE_TRAVEL_MS = 1100;
export const BUNDLE_START_MS = 500;
export const BUNDLE_TRAVEL_MS = 1500;

export function formatRupiah(n: number): string {
  return "Rp " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function planDispense(e: AtmEvent): DispensePlan {
  if (e.type === "VIEWER_JOIN") {
    return { kind: "single", notes: [10000], total: 10000, animMs: NOTE_START_MS + NOTE_TRAVEL_MS };
  }
  if (e.type === "GIFT_SMALL") {
    const count = Math.min(6, Math.max(3, 2 + (e.gift?.count ?? 1)));
    const notes: Denomination[] = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? 20000 : 50000));
    const total = notes.reduce<number>((s, n) => s + n, 0);
    return {
      kind: "multi",
      notes,
      total,
      animMs: NOTE_START_MS + (count - 1) * NOTE_STAGGER_MS + NOTE_TRAVEL_MS,
    };
  }
  const notes: Denomination[] = Array.from({ length: 10 }, () => 100000);
  return { kind: "bundle", notes, total: 1_000_000, animMs: BUNDLE_START_MS + BUNDLE_TRAVEL_MS };
}
