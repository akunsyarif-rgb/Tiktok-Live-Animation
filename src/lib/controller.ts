import type { AtmEvent } from "./events.ts";
import { sanitizeEvent } from "./events.ts";
import { planDispense, type DispensePlan } from "./dispense.ts";
import { DEFAULT_POLICY, EventQueue, type EnqueueResult, type QueueMode, type QueuePolicy, type QueueSerialized } from "./queue.ts";
import type { SoundId } from "./audio/manifest.ts";
import type { SoundPlayer } from "./audio/engine.ts";
import type { DiagLevel } from "./diag.ts";

export type Phase = "standby" | "processing" | "dispensing" | "complete";

export interface Timing {
  processingJoinMs: number;
  processingGiftMs: number;
  dispenseMinMs: number;
  completeHoldMs: number;
  gapMs: number;
  /** A transaction running longer than this is force-aborted (and counted as recovered). */
  watchdogMs: number;
  /** Multiplier for animation-driven waits. Always 1 in the app; tests shrink it. */
  animScale: number;
}

export const DEFAULT_TIMING: Timing = {
  processingJoinMs: 1400,
  processingGiftMs: 1900,
  dispenseMinMs: 2300,
  completeHoldMs: 1800,
  gapMs: 500,
  watchdogMs: 30000,
  animScale: 1,
};

/** Persisted queue older than this is discarded on restore (stale gifts are worse than lost ones). */
export const PERSIST_MAX_AGE_MS = 10 * 60 * 1000;

export interface WaitingItem {
  id: string;
  type: AtmEvent["type"];
  username: string;
}

export interface AtmSnapshot {
  phase: Phase;
  runKey: number;
  current: AtmEvent | null;
  plan: DispensePlan | null;
  mode: QueueMode;
  policy: QueuePolicy;
  waiting: WaitingItem[];
  waitingTotal: number;
  processed: number;
  duplicates: number;
  /** Transactions force-aborted by the watchdog. */
  recovered: number;
  /** Waiting joins evicted + events rejected because the queue was full. */
  dropped: number;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface ControllerOptions {
  audio: SoundPlayer;
  mode?: QueueMode;
  policy?: Partial<QueuePolicy>;
  timing?: Partial<Timing>;
  /** When set, the queue is mirrored here so a reload resumes pending events. */
  storage?: StorageLike;
  storageKey?: string;
  log?: (level: DiagLevel, msg: string) => void;
  now?: () => number;
}

type AbortReason = "watchdog" | "stop";

interface Tx {
  aborted: boolean;
  reason: AbortReason | null;
  abort: (r: AbortReason) => void;
  aborts: Promise<void>;
}

interface Persisted {
  v: 2;
  savedAt: number;
  activePhase: Phase;
  queue: QueueSerialized;
}

const MAX_WAITING_SHOWN = 8;

export class AtmController {
  private queue: EventQueue;
  private audio: SoundPlayer;
  private timing: Timing;
  private storage?: StorageLike;
  private storageKey: string;
  private log: (level: DiagLevel, msg: string) => void;
  private now: () => number;
  private listeners = new Set<() => void>();
  private started = false;
  private pumping = false;
  private tx: Tx | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private runKey = 0;
  private processed = 0;
  private recovered = 0;
  private snapshot: AtmSnapshot;

  constructor(opts: ControllerOptions) {
    this.audio = opts.audio;
    this.timing = { ...DEFAULT_TIMING, ...opts.timing };
    this.now = opts.now ?? Date.now;
    this.queue = new EventQueue(opts.mode ?? "hybrid", opts.policy, this.now);
    this.storage = opts.storage;
    this.storageKey = `atm:${opts.storageKey ?? "queue"}:v2`;
    this.log = opts.log ?? (() => undefined);
    this.snapshot = this.build("standby", null, null);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): AtmSnapshot => this.snapshot;

  /** Idempotent. Restores the persisted queue (queue recovery) and begins processing. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.restore();
    this.publish();
    void this.pump();
  }

  /** Reversible (React StrictMode). An active transaction is re-queued, not lost. */
  stop(): void {
    this.started = false;
    this.tx?.abort("stop");
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.audio.stop();
  }

  /** Input is untrusted: it is sanitized again here. */
  enqueue(e: AtmEvent): EnqueueResult {
    const clean = sanitizeEvent(e);
    if (!clean) {
      this.log("warn", "event rejected: invalid");
      return "invalid";
    }
    const evictedBefore = this.queue.evicted;
    const res = this.queue.enqueue(clean);
    if (this.queue.evicted > evictedBefore) this.log("warn", "queue full: oldest waiting join evicted");
    if (res === "duplicate") this.log("info", `duplicate ignored ${clean.id}`);
    else if (res === "dropped") this.log("warn", `queue full: ${clean.type} dropped`);
    else if (res === "accepted") this.log("info", `queued ${clean.type} @${clean.username} [${clean.source ?? "simulator"}]`);
    this.publish();
    if (res === "accepted") void this.pump();
    return res;
  }

  setMode(mode: QueueMode): void {
    this.queue.mode = mode;
    this.publish();
  }

  setPolicy(p: Partial<QueuePolicy>): void {
    this.queue.policy = { ...this.queue.policy, ...p };
    this.publish();
  }

  clearPending(): number {
    const n = this.queue.clearPending();
    this.log("info", `queue cleared (${n} waiting)`);
    this.publish();
    return n;
  }

  // ---- internals ----

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.started) {
        const ev = this.queue.next();
        if (!ev) break;
        await this.runTransaction(ev);
      }
    } finally {
      this.pumping = false;
    }
    // an event may have arrived between the last next() and the flag reset
    if (this.started && this.queue.length > 0) void this.pump();
  }

  private async safePlay(id: SoundId): Promise<void> {
    try {
      await this.audio.play(id);
    } catch (err) {
      // audio problems must never stop the visual transaction
      this.log("warn", `audio ${id} failed: ${(err as Error)?.message ?? "error"}`);
    }
  }

  private async runTransaction(ev: AtmEvent): Promise<void> {
    const tx = this.makeTx();
    this.tx = tx;
    const watchdog = this.later(() => {
      this.recovered += 1;
      this.log("error", `watchdog: transaction ${ev.id} exceeded ${this.timing.watchdogMs}ms, aborted`);
      tx.abort("watchdog");
    }, this.timing.watchdogMs);

    const plan = planDispense(ev);
    const [procSound, cashSound]: [SoundId, SoundId] =
      ev.type === "VIEWER_JOIN" ? ["processing", "cash_dispense"]
      : ev.type === "GIFT_SMALL" ? ["gift_processing", "cash_dispense"]
      : ["gift_processing", "premium_dispense"];

    let completed = false;
    try {
      this.runKey += 1;
      this.log("info", `start ${ev.type} @${ev.username}`);
      this.publish("processing", ev, plan);
      await this.guard(Promise.all([
        this.safePlay(procSound),
        this.sleep(ev.type === "VIEWER_JOIN" ? this.timing.processingJoinMs : this.timing.processingGiftMs, tx),
      ]), tx);

      this.publish("dispensing", ev, plan);
      await this.guard(Promise.all([
        this.safePlay(cashSound),
        this.sleep(Math.max(plan.animMs, this.timing.dispenseMinMs) * this.timing.animScale, tx),
      ]), tx);

      this.publish("complete", ev, plan);
      await this.guard(Promise.all([this.safePlay("success"), this.sleep(this.timing.completeHoldMs, tx)]), tx);
      completed = true;
    } catch {
      // aborted by watchdog (counted + logged) or stop() (event re-queued below)
    } finally {
      clearTimeout(watchdog);
      this.timers.delete(watchdog);
      if (tx.aborted) this.audio.stop();
      if (tx.reason === "stop") {
        this.queue.requeueActive();
      } else {
        this.queue.abortActive();
        this.processed += 1;
        if (completed) this.log("info", `done ${ev.type} @${ev.username}`);
      }
      this.tx = null;
      this.publish("standby", null, null);
    }
    if (this.started) await this.sleep(this.timing.gapMs, this.makeTx());
  }

  private makeTx(): Tx {
    let resolve!: () => void;
    const aborts = new Promise<void>((r) => { resolve = r; });
    const tx: Tx = {
      aborted: false,
      reason: null,
      aborts,
      abort: (r) => { if (!tx.aborted) { tx.aborted = true; tx.reason = r; resolve(); } },
    };
    return tx;
  }

  private async guard(p: Promise<unknown>, tx: Tx): Promise<void> {
    await Promise.race([p, tx.aborts]);
    if (tx.aborted) throw new Error("transaction aborted");
  }

  private sleep(ms: number, tx: Tx): Promise<void> {
    return new Promise((resolve) => {
      const t = this.later(resolve, ms);
      void tx.aborts.then(() => { clearTimeout(t); this.timers.delete(t); resolve(); });
    });
  }

  private later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  private build(phase: Phase, current: AtmEvent | null, plan: DispensePlan | null): AtmSnapshot {
    const pending = this.queue.getPending();
    return {
      phase,
      runKey: this.runKey,
      current,
      plan,
      mode: this.queue.mode,
      policy: this.queue.policy,
      waiting: pending.slice(0, MAX_WAITING_SHOWN).map((e) => ({ id: e.id, type: e.type, username: e.username })),
      waitingTotal: pending.length,
      processed: this.processed,
      duplicates: this.queue.duplicates,
      recovered: this.recovered,
      dropped: this.queue.evicted + this.queue.rejected,
    };
  }

  private publish(phase?: Phase, current?: AtmEvent | null, plan?: DispensePlan | null): void {
    const prev = this.snapshot;
    this.snapshot = this.build(
      phase ?? prev.phase,
      current === undefined ? prev.current : current,
      plan === undefined ? prev.plan : plan,
    );
    this.persist();
    this.listeners.forEach((l) => l());
  }

  private persist(): void {
    if (!this.storage) return;
    const data: Persisted = { v: 2, savedAt: this.now(), activePhase: this.snapshot.phase, queue: this.queue.serialize() };
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(data));
    } catch { /* storage unavailable or full: recovery is best-effort */ }
  }

  private restore(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Persisted>;
      if (data.v !== 2 || typeof data.savedAt !== "number" || !data.queue) return;
      if (this.now() - data.savedAt > PERSIST_MAX_AGE_MS) {
        this.log("info", "persisted queue too old, discarded");
        return;
      }
      const clean = (list: unknown): AtmEvent[] =>
        (Array.isArray(list) ? list : []).map(sanitizeEvent).filter((e): e is AtmEvent => e !== null);
      const pending = clean(data.queue.pending);
      const active = clean(data.queue.active ? [data.queue.active] : [])[0];
      // a transaction already showing "take your cash" was delivered: do not run it twice
      if (active && data.activePhase !== "complete") pending.unshift(active);
      const seen = Array.isArray(data.queue.seen) ? data.queue.seen.filter((s): s is string => typeof s === "string") : [];
      this.queue.restore({ pending, active: null, seen });
      this.log("info", `restored ${pending.length} pending event(s) after reload`);
    } catch { /* corrupt data is ignored */ }
  }
}

export { DEFAULT_POLICY };
