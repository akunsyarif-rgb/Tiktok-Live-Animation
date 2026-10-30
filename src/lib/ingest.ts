import type { AtmController } from "./controller.ts";
import { sanitizeEvent } from "./events.ts";
import type { AckResult } from "./protocol.ts";

export interface IngestOptions {
  controller: Pick<AtmController, "enqueue">;
  ratePerSec?: number;
  burst?: number;
  now?: () => number;
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}

/** Validate + token-bucket rate limit in front of the controller (flood protection for any transport). */
export function createIngest(opts: IngestOptions): (raw: unknown) => AckResult {
  const rate = opts.ratePerSec ?? 30;
  const cap = opts.burst ?? 60;
  const now = opts.now ?? Date.now;
  let tokens = cap;
  let last = now();
  let limitedSince = 0;
  return (raw) => {
    const t = now();
    tokens = Math.min(cap, tokens + ((t - last) / 1000) * rate);
    last = t;
    const ev = sanitizeEvent(raw);
    if (!ev) return "invalid";
    if (tokens < 1) {
      if (!limitedSince || t - limitedSince > 5000) opts.log?.("warn", "rate limit hit: events refused (sender will retry)");
      limitedSince = t;
      return "rate-limited";
    }
    tokens -= 1;
    return opts.controller.enqueue(ev);
  };
}
