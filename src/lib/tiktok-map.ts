import type { AtmEvent } from "./events.ts";
import { safeAvatarUrl } from "./events.ts";

/**
 * Maps TikTok LIVE payloads (unofficial protocol, via tiktok-live-connector) to ATM events.
 * Payloads are treated as untrusted/unstable: every field is optional and checked.
 * Pure functions, unit-tested with sample shapes only. NOT verified against a real live room.
 */

export const DEFAULT_LARGE_GIFT_DIAMONDS = 1000;
const JOIN_BUCKET_MS = 60_000;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" || typeof v === "bigint" ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

function userOf(data: Obj): { id: string | null; name: string | null; avatar: string | null } {
  const u = obj(data.user);
  const pic = obj(u.profilePicture);
  const urls = Array.isArray(pic.urls) ? pic.urls : [];
  const avatar = safeAvatarUrl(pic.url ?? urls[0] ?? u.profilePictureUrl ?? null);
  return { id: str(u.userId) ?? str(u.id), name: str(u.uniqueId) ?? str(u.nickname), avatar };
}

/** Same viewer re-joining within the same minute maps to the same id → blocked as duplicate downstream. */
export function mapMember(data: unknown, now: number = Date.now()): AtmEvent | null {
  const d = obj(data);
  const u = userOf(d);
  if (!u.name) return null;
  const key = u.id ?? u.name;
  return {
    id: `tt:join:${key}:${Math.floor(now / JOIN_BUCKET_MS)}`.replace(/[^A-Za-z0-9:_.-]/g, "_").slice(0, 100),
    type: "VIEWER_JOIN",
    username: u.name,
    avatarUrl: u.avatar,
    timestamp: now,
    source: "tiktok",
  };
}

export interface GiftMapOptions {
  largeDiamonds?: number;
  now?: number;
}

/**
 * Returns null while a gift streak is still in progress (only the final event of a streak is paid out),
 * or when the payload is unusable.
 */
export function mapGift(data: unknown, opts: GiftMapOptions = {}): AtmEvent | null {
  const d = obj(data);
  const details = obj(d.giftDetails);
  const giftType = num(details.giftType);
  if (giftType === 1 && d.repeatEnd !== true) return null; // streak in progress
  const u = userOf(d);
  if (!u.name) return null;
  const repeat = Math.max(1, Math.floor(num(d.repeatCount) ?? 1));
  const unit = num(details.diamondCount) ?? num(d.diamondCount) ?? 0;
  const diamonds = Math.max(0, unit * repeat);
  const common = obj(d.common);
  const msgId = str(d.msgId) ?? str(common.msgId) ?? str(d.logId);
  const now = opts.now ?? Date.now();
  const giftId = str(d.giftId) ?? "x";
  // no msgId: never collapse two real gifts into one → unique per occurrence
  const fallback = `${u.id ?? u.name}:${giftId}:${repeat}:${now}:${Math.random().toString(36).slice(2, 8)}`;
  const large = opts.largeDiamonds ?? DEFAULT_LARGE_GIFT_DIAMONDS;
  return {
    id: `tt:gift:${msgId ?? fallback}`.replace(/[^A-Za-z0-9:_.-]/g, "_").slice(0, 100),
    type: diamonds >= large ? "GIFT_LARGE" : "GIFT_SMALL",
    username: u.name,
    avatarUrl: u.avatar,
    timestamp: now,
    source: "tiktok",
    gift: { name: str(details.giftName) ?? str(d.giftName) ?? `Gift ${giftId}`, count: repeat, diamonds },
  };
}
