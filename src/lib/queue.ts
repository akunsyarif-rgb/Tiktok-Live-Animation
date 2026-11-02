import type { AtmEvent } from "./events.ts";

export type QueueMode = "community" | "gift-priority" | "hybrid";
export type EnqueueResult = "accepted" | "duplicate" | "invalid" | "dropped" | "filtered";

export interface QueuePolicy {
  /** Hybrid: a waiting join is served after this many consecutive gifts. */
  hybridGiftBurst: number;
  /** Hybrid: a join that waited this long goes next, regardless of gifts. */
  hybridMaxJoinWaitMs: number;
  /** Soft cap. Beyond it the oldest waiting joins are evicted (gifts are kept). */
  maxPending: number;
  /** Absolute cap. Beyond it even gifts are rejected (memory protection). */
  hardMaxPending: number;
}

export const DEFAULT_POLICY: QueuePolicy = {
  hybridGiftBurst: 3,
  hybridMaxJoinWaitMs: 30_000,
  maxPending: 100,
  hardMaxPending: 500,
};

const MAX_SEEN = 5000;

export interface QueueSerialized {
  pending: AtmEvent[];
  active: AtmEvent | null;
  /** joins folded into the active group welcome */
  activeExtras?: AtmEvent[];
  seen: string[];
}

function isGiftEvent(e: AtmEvent): boolean {
  return e.type !== "VIEWER_JOIN";
}

/**
 * Pure, framework-free event queue.
 *
 * Ordering policy (documented in README):
 * - community:     strict first-come-first-served.
 * - gift-priority: waiting gifts always before waiting joins (joins can starve while gifts keep coming).
 * - hybrid:        gifts first, but a waiting join is guaranteed a turn after `hybridGiftBurst`
 *                  consecutive gifts OR once it waited `hybridMaxJoinWaitMs`, whichever comes first.
 *
 * One active event at a time (next() returns null while one is active). Duplicate ids are rejected,
 * including ids already processed.
 */
export class EventQueue {
  mode: QueueMode;
  policy: QueuePolicy;
  duplicates = 0;
  evicted = 0;
  rejected = 0;
  private pending: AtmEvent[] = [];
  private queuedAt = new Map<string, number>();
  private active: AtmEvent | null = null;
  private activeExtras: AtmEvent[] = [];
  private seen = new Set<string>();
  private giftStreak = 0;
  private now: () => number;

  constructor(mode: QueueMode = "hybrid", policy: Partial<QueuePolicy> = {}, now: () => number = Date.now) {
    this.mode = mode;
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.now = now;
  }

  enqueue(e: AtmEvent): EnqueueResult {
    if (!e || typeof e.id !== "string" || e.id === "" || !e.type) return "invalid";
    if (this.seen.has(e.id)) {
      this.duplicates += 1;
      return "duplicate";
    }
    this.remember(e.id);
    const gift = isGiftEvent(e);
    if (this.pending.length >= this.policy.hardMaxPending) {
      this.rejected += 1;
      return "dropped";
    }
    if (this.pending.length >= this.policy.maxPending) {
      const oldestJoin = this.pending.findIndex((p) => !isGiftEvent(p));
      if (oldestJoin !== -1) {
        this.removeAt(oldestJoin);
        this.evicted += 1;
      } else if (!gift) {
        this.rejected += 1; // queue is all gifts: do not evict gifts for a join
        return "dropped";
      }
    }
    this.pending.push(e);
    this.queuedAt.set(e.id, this.now());
    return "accepted";
  }

  /** Idempotency for events that never enter the queue (ambient lane): false when the id was seen before. */
  claim(id: string): boolean {
    if (this.seen.has(id)) {
      this.duplicates += 1;
      return false;
    }
    this.remember(id);
    return true;
  }

  next(): AtmEvent | null {
    if (this.active || this.pending.length === 0) return null;
    const idx = this.pickIndex();
    const ev = this.removeAt(idx);
    if (!ev) return null;
    this.giftStreak = isGiftEvent(ev) ? this.giftStreak + 1 : 0;
    this.active = ev;
    this.activeExtras = [];
    return ev;
  }

  /** Number of waiting viewer joins. */
  get joinsWaiting(): number {
    return this.pending.reduce((n, e) => n + (isGiftEvent(e) ? 0 : 1), 0);
  }

  /**
   * Group welcome: fold up to `max` waiting joins (oldest first) into the active join so they are welcomed together.
   * They stay "in flight" (persisted, re-queued on stop) until finish(); none is lost or processed twice.
   */
  takeJoins(max: number): AtmEvent[] {
    if (!this.active || isGiftEvent(this.active)) return [];
    const taken: AtmEvent[] = [];
    for (let i = 0; i < this.pending.length && taken.length < max; ) {
      if (isGiftEvent(this.pending[i]!)) i++;
      else taken.push(this.removeAt(i)!);
    }
    this.activeExtras.push(...taken);
    return taken;
  }

  finish(id: string): boolean {
    if (!this.active || this.active.id !== id) return false;
    this.active = null;
    this.activeExtras = [];
    return true;
  }

  /** Recovery: drop a stuck active event so the queue can continue. */
  abortActive(): AtmEvent | null {
    const a = this.active;
    this.active = null;
    this.activeExtras = [];
    return a;
  }

  /** Controlled stop: put the active event back at the front so it is not lost. */
  requeueActive(): void {
    if (!this.active) return;
    const back = [this.active, ...this.activeExtras];
    this.pending.unshift(...back);
    back.forEach((e) => this.queuedAt.set(e.id, this.now()));
    this.giftStreak = 0;
    this.active = null;
    this.activeExtras = [];
  }

  clearPending(): number {
    const n = this.pending.length;
    this.pending = [];
    this.queuedAt.clear();
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
    return { pending: [...this.pending], active: this.active, activeExtras: [...this.activeExtras], seen: [...this.seen] };
  }

  restore(data: QueueSerialized): void {
    this.seen = new Set(data.seen);
    this.pending = [...data.pending];
    this.queuedAt.clear();
    const t = this.now();
    this.pending.forEach((e) => this.queuedAt.set(e.id, t));
    this.active = null;
    this.activeExtras = [];
  }

  private removeAt(i: number): AtmEvent | undefined {
    const [ev] = this.pending.splice(i, 1);
    if (ev) this.queuedAt.delete(ev.id);
    return ev;
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
    if (this.mode === "hybrid") {
      const j = this.pending.findIndex((e) => !isGiftEvent(e));
      if (j !== -1) {
        const waited = this.now() - (this.queuedAt.get(this.pending[j]!.id) ?? this.now());
        if (this.giftStreak >= this.policy.hybridGiftBurst || waited >= this.policy.hybridMaxJoinWaitMs) return j;
      }
    }
    return g;
  }
}
