import type { AtmEvent } from "./events.ts";
import type { QueueMode } from "./queue.ts";
import type { AtmSnapshot } from "./controller.ts";
import type { AudioSnapshot } from "./audio/engine.ts";

export interface OverlayStatus {
  atm: AtmSnapshot;
  audio: AudioSnapshot;
}

export type BusMessage =
  | { t: "event"; event: AtmEvent }
  | { t: "mode"; mode: QueueMode }
  | { t: "volume"; volume: number }
  | { t: "clear" }
  | { t: "ping" }
  | { t: "status"; status: OverlayStatus };

export interface Bus {
  post(msg: BusMessage): void;
  close(): void;
}

const CHANNEL = "atm-phase0";

/**
 * Same-origin, same-browser link between /control and /overlay.
 * Returns null when BroadcastChannel is unavailable (the control page then runs the ATM locally).
 */
export function openBus(onMessage: (m: BusMessage) => void): Bus | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<BusMessage>) => onMessage(e.data);
  return {
    post: (msg) => ch.postMessage(msg),
    close: () => ch.close(),
  };
}
