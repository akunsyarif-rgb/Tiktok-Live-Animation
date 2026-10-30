import type { AtmEvent } from "./events.ts";
import { isValidEvent } from "./events.ts";
import { planDispense, type DispensePlan } from "./dispense.ts";
import { EventQueue, type EnqueueResult, type QueueMode, type QueueSerialized } from "./queue.ts";
import type { SoundId } from "./audio/manifest.ts";
import type { SoundPlayer } from "./audio/engine.ts";

export type Phase = "standby" | "processing" | "dispensing" | "complete";

export interface Timing {
  processingJoinMs: number;
  processingGiftMs: number;
  dispenseMinMs: number;
  completeHoldMs: number;
  gapMs: number;
  /** Multiplier for animation-driven waits. Always 1 in the app; tests shrink it. */
  animScale: number;
  /** A transaction running longer than this is force-aborted. */
  watchdogMs: number;
}

export const DEFAULT_TIMING: Timing = {
  processingJoinMs: 1400,
  processingGiftMs: 1900,
  dispenseMinMs: 2300,
  completeHoldMs: 1800,
  gapMs: 500,
  animScale: 1,
  watchdogMs: 30000,
};

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
  waiting: WaitingItem[];
  waitingTotal: number;
  processed: number;
  duplicates: number;
  recovered: number;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface ControllerOptions {
  audio: SoundPlayer;
  mode?: QueueMode;
  timing?: Partial<Timing>;
  /** When set, the queue is mirrored here so a reload resumes pending events. */
  storage?: StorageLike;
  storageKey?: string;
}

interface Tx {
  aborted: boolean;
  abort: () => void;
  aborts: Promise<void>;
}

const MAX_WAITING_SHOWN = 8;

export class AtmController {
  private queue: EventQueue;
  private audio: SoundPlayer;
  private timing: Timing;
  private storage?: StorageLike;
  private storageKey: string;
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
    this.queue = new EventQueue(opts.mode ?? "hybrid");
    this.storage = opts.storage;
    this.storageKey = `atm-phase0:${opts.storageKey ?? "queue"}:v1`;
    this.snapshot = this.build("standby", null, null);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): AtmSnapshot => this.snapshot;

  /** Idempotent. Restores persisted queue (queue recovery) and begins processing. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.restore();
    this.publish();
    void this.pump();
  }

  /** Reversible (React StrictMode mounts, unmounts, mounts again). */
  stop(): void {
    this.started = false;
    this.tx?.abort();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.audio.stop();
  }

  enqueue(e: AtmEvent): EnqueueResult {
    if (!isValidEvent(e)) return "invalid";
    const res = this.queue.enqueue(e);
    this.publish();
    if (res === "accepted") void this.pump();
    return res;
  }

  setMode(mode: QueueMode): void {
    this.queue.mode = mode;
    this.publish();
  }

  clearPending(): number {
    const n = this.queue.clearPending();
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

  private async runTransaction(ev: AtmEvent): Promise<void> {
    const tx = this.makeTx();
    this.tx = tx;
    const watchdog = this.later(() => {
      this.recovered += 1;
      tx.abort();
    }, this.timing.watchdogMs);

    const plan = planDispense(ev);
    const [procSound, cashSound]: [SoundId, SoundId] =
      ev.type === "VIEWER_JOIN" ? ["processing", "cash_dispense"]
      : ev.type === "GIFT_SMALL" ? ["gift_processing", "cash_dispense"]
      : ["gift_processing", "premium_dispense"];

    try {
      this.runKey += 1;
      this.publish("processing", ev, plan);
      await this.guard(Promise.all([
        this.audio.play(procSound),
        this.sleep(ev.type === "VIEWER_JOIN" ? this.timing.processingJoinMs : this.timing.processingGiftMs, tx),
      ]), tx);

      this.publish("dispensing", ev, plan);
      await this.guard(Promise.all([
        this.audio.play(cashSound),
        this.sleep(Math.max(plan.animMs, this.timing.dispenseMinMs) * this.timing.animScale, tx),
      ]), tx);

      this.publish("complete", ev, plan);
      await this.sleep(this.timing.completeHoldMs, tx);
    } catch {
      // aborted by watchdog (already counted) or stop()
    } finally {
      clearTimeout(watchdog);
      this.timers.delete(watchdog);
      if (tx.aborted) this.audio.stop();
      this.queue.abortActive();
      this.processed += 1;
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
      aborts,
      abort: () => { tx.aborted = true; resolve(); },
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
      waiting: pending.slice(0, MAX_WAITING_SHOWN).map((e) => ({ id: e.id, type: e.type, username: e.username })),
      waitingTotal: pending.length,
      processed: this.processed,
      duplicates: this.queue.duplicates,
      recovered: this.recovered,
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
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.queue.serialize()));
    } catch { /* storage unavailable or full: recovery is best-effort */ }
  }

  private restore(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as QueueSerialized;
      if (!Array.isArray(data.pending) || !Array.isArray(data.seen)) return;
      this.queue.restore({ pending: data.pending.filter(isValidEvent), seen: data.seen.filter((s) => typeof s === "string") });
    } catch { /* corrupt data is ignored */ }
  }
}
