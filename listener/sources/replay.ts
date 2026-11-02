import { readFileSync } from "node:fs";
import type { AtmEvent } from "../../src/lib/events.ts";
import { sanitizeEvent } from "../../src/lib/events.ts";
import type { EventSourceAdapter, SourceHandlers } from "../../src/lib/source.ts";
import { sleepAbortable } from "../../src/lib/source.ts";

/**
 * REHEARSAL source: replays a JSONL file (one {"delayMs":n,"event":{...}} per line, ids are re-generated per loop).
 * It is NOT a LIVE and is reported as such ("REPLAY"): use it to rehearse the overlay without a stream.
 */
export function replaySource(file: string, loop = true): EventSourceAdapter {
  return {
    name: `replay:${file}`,
    kind: "replay",
    async run(h: SourceHandlers, signal: AbortSignal): Promise<void> {
      const rows = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as { delayMs?: number; event: unknown });
      h.state("connected", "REPLAY file (not a real LIVE)");
      let round = 0;
      do {
        round += 1;
        for (const r of rows) {
          await sleepAbortable(Math.max(0, Math.min(60_000, r.delayMs ?? 1000)), signal);
          if (signal.aborted) return;
          const ev = sanitizeEvent({ ...(r.event as object), id: `replay:${Date.now().toString(36)}:${round}:${Math.random().toString(36).slice(2, 7)}`, source: "simulator", timestamp: Date.now() });
          if (ev) h.emit(ev as AtmEvent);
        }
      } while (loop && !signal.aborted);
    },
  };
}
