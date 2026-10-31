import type { AtmEvent } from "./events.ts";
import { sanitizeEvent } from "./events.ts";
import type { QueueMode } from "./queue.ts";
import type { AtmSnapshot } from "./controller.ts";
import type { AudioSnapshot } from "./audio/engine.ts";

export const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_CHARS = 16_000;

export type ThemeId = "atm" | "reactor" | "marble";

export interface Settings {
  theme: ThemeId;
  mode: QueueMode;
  hybridGiftBurst: number;
  hybridMaxJoinWaitMs: number;
  volume: number;
  muted: boolean;
}

export type AckResult = "accepted" | "duplicate" | "invalid" | "dropped" | "rate-limited";

export type ListenerState = "idle" | "connecting" | "connected" | "reconnecting" | "offline" | "error";

export interface ListenerStatus {
  state: ListenerState;
  /** Target TikTok username (public info). */
  target: string;
  detail: string;
  sent: number;
  undelivered: number;
  lastEventAt: number | null;
  attempts: number;
}

export interface OverlayStatus {
  atm: AtmSnapshot;
  audio: AudioSnapshot;
  autoAudio: boolean;
}

export type Msg =
  | { v: 1; t: "event"; from: string; event: AtmEvent }
  | { v: 1; t: "ack"; id: string; result: AckResult }
  | { v: 1; t: "settings"; settings: Settings }
  | { v: 1; t: "clear" }
  | { v: 1; t: "ping"; from: string }
  | { v: 1; t: "status"; status: OverlayStatus }
  | { v: 1; t: "listener"; status: ListenerStatus };

const MODES = ["community", "gift-priority", "hybrid"];
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function parseSettings(s: unknown): Settings | null {
  if (typeof s !== "object" || s === null) return null;
  const o = s as Record<string, unknown>;
  if (typeof o.mode !== "string" || !MODES.includes(o.mode)) return null;
  if (!num(o.volume) || !num(o.hybridGiftBurst) || !num(o.hybridMaxJoinWaitMs)) return null;
  const theme = o.theme === "reactor" || o.theme === "marble" ? o.theme : "atm";
  return {
    theme,
    mode: o.mode as QueueMode,
    hybridGiftBurst: clamp(Math.round(o.hybridGiftBurst), 1, 20),
    hybridMaxJoinWaitMs: clamp(Math.round(o.hybridMaxJoinWaitMs), 3000, 300_000),
    volume: clamp(o.volume, 0, 1),
    muted: o.muted === true,
  };
}

function parseStatus(s: unknown): OverlayStatus | null {
  if (typeof s !== "object" || s === null) return null;
  const o = s as { atm?: Record<string, unknown>; audio?: Record<string, unknown>; autoAudio?: unknown };
  const a = o.atm, au = o.audio;
  if (!a || !au) return null;
  if (typeof a.phase !== "string" || !Array.isArray(a.waiting) || !num(a.waitingTotal) || !num(a.processed)) return null;
  if (typeof au.state !== "string" || !num(au.volume)) return null;
  return { atm: a as unknown as AtmSnapshot, audio: au as unknown as AudioSnapshot, autoAudio: o.autoAudio === true };
}

function parseListener(s: unknown): ListenerStatus | null {
  if (typeof s !== "object" || s === null) return null;
  const o = s as Record<string, unknown>;
  const states = ["idle", "connecting", "connected", "reconnecting", "offline", "error"];
  if (typeof o.state !== "string" || !states.includes(o.state)) return null;
  return {
    state: o.state as ListenerState,
    target: typeof o.target === "string" ? o.target.slice(0, 40) : "",
    detail: typeof o.detail === "string" ? o.detail.slice(0, 160) : "",
    sent: num(o.sent) ? o.sent : 0,
    undelivered: num(o.undelivered) ? o.undelivered : 0,
    lastEventAt: num(o.lastEventAt) ? o.lastEventAt : null,
    attempts: num(o.attempts) ? o.attempts : 0,
  };
}

/** Validates untrusted input from any transport. Returns null for anything unexpected. */
export function parseMessage(raw: unknown): Msg | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== PROTOCOL_VERSION) return null;
  try {
    if (JSON.stringify(raw).length > MAX_MESSAGE_CHARS) return null;
  } catch {
    return null;
  }
  switch (o.t) {
    case "event": {
      const event = sanitizeEvent(o.event);
      return event ? { v: 1, t: "event", from: typeof o.from === "string" ? o.from.slice(0, 40) : "?", event } : null;
    }
    case "ack": {
      const results = ["accepted", "duplicate", "invalid", "dropped", "rate-limited"];
      return typeof o.id === "string" && typeof o.result === "string" && results.includes(o.result)
        ? { v: 1, t: "ack", id: o.id.slice(0, 100), result: o.result as AckResult }
        : null;
    }
    case "settings": {
      const settings = parseSettings(o.settings);
      return settings ? { v: 1, t: "settings", settings } : null;
    }
    case "clear":
      return { v: 1, t: "clear" };
    case "ping":
      return { v: 1, t: "ping", from: typeof o.from === "string" ? o.from.slice(0, 40) : "?" };
    case "status": {
      const status = parseStatus(o.status);
      return status ? { v: 1, t: "status", status } : null;
    }
    case "listener": {
      const status = parseListener(o.status);
      return status ? { v: 1, t: "listener", status } : null;
    }
    default:
      return null;
  }
}
