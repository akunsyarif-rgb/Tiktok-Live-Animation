import type { AtmEvent } from "./events.ts";
import type { ListenerState } from "./protocol.ts";

export interface SourceHandlers {
  /** normalized event (already mapped to the app protocol) */
  emit(ev: AtmEvent): void;
  state(s: ListenerState, detail?: string): void;
  log(level: "info" | "warn" | "error", msg: string): void;
}

/**
 * A replaceable event source. The listener process owns transport, signing, acks and health;
 * a source only turns "something happened in the LIVE" into AtmEvents.
 *  - tiktok-unofficial: reverse-engineered TikTok LIVE client (no official API for this use)
 *  - replay: events from a local file (demo / rehearsal): NEVER a real LIVE, labelled as simulator
 */
export interface EventSourceAdapter {
  readonly name: string;
  readonly kind: "tiktok-unofficial" | "replay";
  /** runs until `signal` aborts; reconnects/backoff are the source's job */
  run(h: SourceHandlers, signal: AbortSignal): Promise<void>;
}

/** abortable sleep */
export const sleepAbortable = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** exponential backoff with full jitter on the upper half: 5 s → 2 min */
export function backoffMs(attempt: number, base = 5000, rnd: () => number = Math.random): number {
  const exp = Math.min(120_000, base * 2 ** Math.min(attempt, 5));
  return exp / 2 + rnd() * (exp / 2);
}
