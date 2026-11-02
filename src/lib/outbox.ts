import { sanitizeEvent, type AtmEvent } from "./events.ts";
import type { AckResult, Msg } from "./protocol.ts";

export interface OutboxOptions {
  send: (m: Msg) => boolean;
  from: string;
  log?: (level: "info" | "warn" | "error", msg: string) => void;
  now?: () => number;
  /** Minimum gap between sends (Supabase free tier allows ~10 msg/s per client). */
  paceMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  /** After this age an unacknowledged event is given up. */
  maxAgeMs?: (e: AtmEvent) => number;
}

interface Entry {
  ev: AtmEvent;
  firstAt: number;
  nextAt: number;
  tries: number;
}

/**
 * At-least-once delivery on top of a lossy broadcast link: resend until the overlay acks.
 * The overlay's duplicate protection makes resends safe, so the net effect is exactly-once display.
 */
export class Outbox {
  delivered = 0;
  undelivered = 0;
  private entries = new Map<string, Entry>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;
  private o: Required<Omit<OutboxOptions, "log">> & { log: NonNullable<OutboxOptions["log"]> };

  constructor(opts: OutboxOptions) {
    this.o = {
      paceMs: 120,
      retryBaseMs: 2500,
      retryMaxMs: 10_000,
      now: Date.now,
      maxAgeMs: (e) => (e.type === "VIEWER_JOIN" ? 20_000 : 120_000),
      log: () => undefined,
      ...opts,
    };
  }

  get pending(): number {
    return this.entries.size;
  }

  submit(raw: AtmEvent): void {
    // Send the canonical form: the receiver verifies the signature over the sanitized event, so the sender must sign that same form.
    const ev = sanitizeEvent(raw);
    if (!ev) {
      this.o.log("warn", "event not sent: invalid");
      return;
    }
    if (this.entries.has(ev.id)) return;
    const now = this.o.now();
    this.entries.set(ev.id, { ev, firstAt: now, nextAt: now, tries: 0 });
    this.schedule(0);
  }

  ack(id: string, result: AckResult): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    if (result === "accepted" || result === "duplicate" || result === "filtered") this.delivered += 1;
    else {
      this.undelivered += 1;
      this.o.log("warn", `overlay refused ${id}: ${result}`);
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.timer || this.entries.size === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, ms);
  }

  private tick(): void {
    const now = this.o.now();
    let nextWake = Infinity;
    for (const [id, e] of this.entries) {
      if (now - e.firstAt > this.o.maxAgeMs(e.ev)) {
        this.entries.delete(id);
        this.undelivered += 1;
        this.o.log("error", `undelivered after ${Math.round((now - e.firstAt) / 1000)}s: ${e.ev.type} ${id}`);
        continue;
      }
      if (e.nextAt <= now) {
        if (now - this.lastSentAt < this.o.paceMs) {
          nextWake = Math.min(nextWake, this.lastSentAt + this.o.paceMs);
          continue;
        }
        const ok = this.o.send({ v: 1, t: "event", from: this.o.from, event: e.ev });
        this.lastSentAt = now;
        e.tries += 1;
        const backoff = Math.min(this.o.retryMaxMs, this.o.retryBaseMs * 2 ** Math.min(e.tries - 1, 3));
        e.nextAt = now + (ok ? backoff : Math.min(1000, backoff));
        if (e.tries > 1) this.o.log("warn", `resend #${e.tries} ${id}`);
      }
      nextWake = Math.min(nextWake, e.nextAt);
    }
    if (Number.isFinite(nextWake)) this.schedule(Math.max(20, nextWake - this.o.now()));
  }
}
