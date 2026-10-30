export type AtmEventType = "VIEWER_JOIN" | "GIFT_SMALL" | "GIFT_LARGE";

export interface GiftInfo {
  name: string;
  count: number;
  diamonds: number;
}

export type EventSource = "simulator" | "tiktok";

export interface AtmEvent {
  id: string;
  type: AtmEventType;
  username: string;
  /** Remote URL or local path. null → local initials fallback avatar. */
  avatarUrl: string | null;
  timestamp: number;
  gift?: GiftInfo;
  /** Where the event came from. Real TikTok events are never labelled "simulator". */
  source?: EventSource;
}

export const EVENT_LABEL: Record<AtmEventType, string> = {
  VIEWER_JOIN: "Viewer Join",
  GIFT_SMALL: "Gift Small",
  GIFT_LARGE: "Gift Large",
};

export function isGift(type: AtmEventType): boolean {
  return type !== "VIEWER_JOIN";
}

let counter = 0;

/** crypto.randomUUID needs a secure context; LAN http dev on iPad is not one. */
function uniqueId(): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `evt_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`;
}

const USERNAMES = [
  "budi_santoso", "sari.dewi", "rizky_gaming", "putri_ayu", "andi.pratama",
  "dewi_lestari", "fajar_88", "nurul.hidayah", "agus_wijaya", "maya_sari",
  "doni_kusuma", "lina.marlina", "bayu_aji", "citra_kirana", "eko_prasetyo",
];
const SMALL_GIFTS = [
  { name: "Rose", diamonds: 1 },
  { name: "Finger Heart", diamonds: 5 },
  { name: "Sunglasses", diamonds: 10 },
];
const LARGE_GIFTS = [
  { name: "Lion", diamonds: 29999 },
  { name: "Universe", diamonds: 34999 },
  { name: "Diamond Flight", diamonds: 18000 },
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

export function createEvent(type: AtmEventType): AtmEvent {
  const base: AtmEvent = {
    id: uniqueId(),
    type,
    username: pick(USERNAMES),
    avatarUrl: null,
    timestamp: Date.now(),
    source: "simulator",
  };
  if (type === "GIFT_SMALL") {
    const g = pick(SMALL_GIFTS);
    base.gift = { name: g.name, count: 1 + Math.floor(Math.random() * 5), diamonds: g.diamonds };
  } else if (type === "GIFT_LARGE") {
    const g = pick(LARGE_GIFTS);
    base.gift = { name: g.name, count: 1, diamonds: g.diamonds };
  }
  return base;
}

const ID_RE = /^[A-Za-z0-9:_.\-]{1,100}$/;
const MAX_NAME = 40;

function cleanText(v: unknown, max: number): string {
  // strip control chars, collapse whitespace
  return String(v).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Only https URLs or same-origin paths; blocks javascript:, data:, http: mixed content. */
export function safeAvatarUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > 500) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return /^https:\/\/[^\s]+$/i.test(v) ? v : null;
}

/**
 * Validates and normalizes untrusted input (bus message, TikTok listener).
 * Returns a clean copy, or null when unusable. Never trust the caller's object.
 */
export function sanitizeEvent(e: unknown): AtmEvent | null {
  if (typeof e !== "object" || e === null) return null;
  const o = e as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID_RE.test(o.id)) return null;
  if (o.type !== "VIEWER_JOIN" && o.type !== "GIFT_SMALL" && o.type !== "GIFT_LARGE") return null;
  if (typeof o.username !== "string") return null;
  const username = cleanText(o.username, MAX_NAME);
  if (!username) return null;
  const ts = typeof o.timestamp === "number" && Number.isFinite(o.timestamp) ? o.timestamp : Date.now();
  const out: AtmEvent = {
    id: o.id,
    type: o.type,
    username,
    avatarUrl: safeAvatarUrl(o.avatarUrl),
    timestamp: ts,
    source: o.source === "tiktok" ? "tiktok" : "simulator",
  };
  if (o.type !== "VIEWER_JOIN") {
    const g = (typeof o.gift === "object" && o.gift !== null ? o.gift : {}) as Record<string, unknown>;
    const count = typeof g.count === "number" && Number.isFinite(g.count) ? Math.min(99999, Math.max(1, Math.floor(g.count))) : 1;
    const diamonds = typeof g.diamonds === "number" && Number.isFinite(g.diamonds) ? Math.min(1e9, Math.max(0, Math.floor(g.diamonds))) : 0;
    out.gift = { name: cleanText(g.name ?? "Gift", MAX_NAME) || "Gift", count, diamonds };
  }
  return out;
}

export function isValidEvent(e: unknown): e is AtmEvent {
  return sanitizeEvent(e) !== null;
}
