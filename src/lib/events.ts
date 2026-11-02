export type AtmEventType = "VIEWER_JOIN" | "GIFT_SMALL" | "GIFT_LARGE" | "COMMENT" | "FOLLOW" | "LIKE" | "SHARE";
const EVENT_TYPES: readonly string[] = ["VIEWER_JOIN", "GIFT_SMALL", "GIFT_LARGE", "COMMENT", "FOLLOW", "LIKE", "SHARE"];
/** Main lane = animated ATM transactions (queue). Everything else is the ambient lane (comments, likes, follows, shares). */
export const isMainLane = (t: AtmEventType): boolean => t === "VIEWER_JOIN" || t === "GIFT_SMALL" || t === "GIFT_LARGE";

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
  /** COMMENT: the (already length-limited) text */
  text?: string;
  /** LIKE: number of likes this event stands for (listener batches them) */
  count?: number;
  /** Where the event came from. Real TikTok events are never labelled "simulator". */
  source?: EventSource;
}

export const EVENT_LABEL: Record<AtmEventType, string> = {
  VIEWER_JOIN: "Viewer Join",
  GIFT_SMALL: "Gift Small",
  GIFT_LARGE: "Gift Large",
  COMMENT: "Comment",
  FOLLOW: "Follow",
  LIKE: "Likes",
  SHARE: "Share",
};

export function isGift(type: AtmEventType): boolean {
  return type === "GIFT_SMALL" || type === "GIFT_LARGE";
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
const GIFTS = {
  small: [{ name: "Rose", unit: 1 }, { name: "Finger Heart", unit: 5 }],
  medium: [{ name: "Sunglasses", unit: 99 }, { name: "Heart Balloon", unit: 150 }],
  big: [{ name: "Lion", unit: 1500 }, { name: "Diamond Flight", unit: 4000 }],
  special: [{ name: "Universe", unit: 34999 }, { name: "Galaxy", unit: 20000 }],
};

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

export type SimKind = "join" | "small" | "medium" | "big" | "special" | "comment" | "follow" | "like" | "share";
const COMMENTS = ["halo kak!", "mantap bgt 🔥", "ATM-nya keren", "salam dari Surabaya", "gift dong kak", "lagi hujan nih di sini", "keren animasinya"];

/** Simulator event. `gift.diamonds` is the TOTAL value (unit × count), same meaning as the TikTok listener. */
export function createSimEvent(kind: SimKind): AtmEvent {
  const base: AtmEvent = {
    id: uniqueId(),
    type: kind === "join" ? "VIEWER_JOIN" : kind === "comment" ? "COMMENT" : kind === "follow" ? "FOLLOW" : kind === "like" ? "LIKE" : kind === "share" ? "SHARE" : kind === "small" || kind === "medium" ? "GIFT_SMALL" : "GIFT_LARGE",
    username: pick(USERNAMES),
    avatarUrl: null,
    timestamp: Date.now(),
    source: "simulator",
  };
  if (kind === "comment") base.text = pick(COMMENTS);
  else if (kind === "like") base.count = 5 + Math.floor(Math.random() * 40);
  else if (kind === "small" || kind === "medium" || kind === "big" || kind === "special") {
    const g = pick(GIFTS[kind]);
    const count = kind === "small" ? 1 + Math.floor(Math.random() * 5) : 1;
    base.gift = { name: g.name, count, diamonds: g.unit * count };
  }
  return base;
}

export function createEvent(type: AtmEventType): AtmEvent {
  return createSimEvent(type === "VIEWER_JOIN" ? "join" : type === "GIFT_SMALL" ? "small" : "big");
}

const ID_RE = /^[A-Za-z0-9:_.\-]{1,100}$/;
const MAX_NAME = 40;

function cleanText(v: unknown, max: number): string {
  // strip control chars, collapse whitespace
  return String(v).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
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
  if (typeof o.type !== "string" || !EVENT_TYPES.includes(o.type)) return null;
  if (typeof o.username !== "string") return null;
  // anonymous / empty names still get welcomed: safe fallback instead of dropping the event
  const username = cleanText(o.username, MAX_NAME) || "guest";
  const ts = typeof o.timestamp === "number" && Number.isFinite(o.timestamp) ? o.timestamp : Date.now();
  const out: AtmEvent = {
    id: o.id,
    type: o.type as AtmEventType,
    username,
    avatarUrl: safeAvatarUrl(o.avatarUrl),
    timestamp: ts,
    source: o.source === "tiktok" ? "tiktok" : "simulator",
  };
  if (o.type === "COMMENT") out.text = cleanText(o.text ?? "", 200);
  if (o.type === "LIKE") out.count = typeof o.count === "number" && Number.isFinite(o.count) ? Math.min(1_000_000, Math.max(1, Math.floor(o.count))) : 1;
  if (o.type === "GIFT_SMALL" || o.type === "GIFT_LARGE") {
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
