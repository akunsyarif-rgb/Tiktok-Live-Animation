import type { AtmEvent } from "./events.ts";

export type QueueMode = "community" | "gift-priority" | "hybrid";
export type EnqueueResult = "accepted" | "duplicate" | "invalid";

/** In hybrid mode a waiting viewer join is served after this many consecutive gifts. */
export const HYBRID_GIFT_BURST = 3;
const MAX_SEEN = 2000;

export interface QueueSerialized {
  pending: AtmEvent[];
  seen: string[];
}

function isGiftEvent(e: AtmEvent): boolean {
  return e.type !== "VIEWER_JOIN";
}

/**
 * Pure, framework-free event queue.
 * - one active event at a time (next() returns null while one is active)
 * - duplicate ids rejected, including ids already processed
 * - ordering depends on mode (see pickIndex)
 */
export class EventQueue {
  mode: QueueMode;
  duplicates = 0;
  private pending: AtmEvent[] = [];
  private active: AtmEvent | null = null;
  private seen = new Set<string>();
  private giftStreak = 0;

  constructor(mode: QueueMode = "hybrid") {
    this.mode = mode;
  }

  enqueue(e: AtmEvent): EnqueueResult {
    if (!e || typeof e.id !== "string" || e.id === "" || !e.type) return "invalid";
    if (this.seen.has(e.id)) {
      this.duplicates += 1;
      return "duplicate";
    }
    this.remember(e.id);
    this.pending.push(e);
    return "accepted";
  }

  next(): AtmEvent | null {
    if (this.active || this.pending.length === 0) return null;
    const idx = this.pickIndex();
    const [ev] = this.pending.splice(idx, 1);
    if (!ev) return null;
    this.giftStreak = isGiftEvent(ev) ? this.giftStreak + 1 : 0;
    this.active = ev;
    return ev;
  }

  finish(id: string): boolean {
    if (!this.active || this.active.id !== id) return false;
    this.active = null;
    return true;
  }

  /** Recovery: drop a stuck active event so the queue can continue. */
  abortActive(): AtmEvent | null {
    const a = this.active;
    this.active = null;
    return a;
  }

  clearPending(): number {
    const n = this.pending.length;
    this.pending = [];
    return n;
  }

  getActive(): AtmEvent | null {
    return this.active;
  }

  getPending(): readonly AtmEvent[] {
    return this.pending;
  }

  get length(): number {
    return this.pending.length;
  }

  serialize(): QueueSerialized {
    // active event is stored first so a reload re-runs it instead of losing it
    const pending = this.active ? [this.active, ...this.pending] : [...this.pending];
    return { pending, seen: [...this.seen] };
  }

  restore(data: QueueSerialized): void {
    this.seen = new Set(data.seen);
    this.pending = [...data.pending];
    this.active = null;
  }

  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  private pickIndex(): number {
    if (this.mode === "community") return 0;
    const g = this.pending.findIndex(isGiftEvent);
    if (g === -1) return 0;
    if (this.mode === "hybrid" && this.giftStreak >= HYBRID_GIFT_BURST) {
      const j = this.pending.findIndex((e) => !isGiftEvent(e));
      if (j !== -1) return j;
    }
    return g;
  }
}
