export type AtmEventType = "VIEWER_JOIN" | "GIFT_SMALL" | "GIFT_LARGE";

export interface GiftInfo {
  name: string;
  count: number;
  diamonds: number;
}

export interface AtmEvent {
  id: string;
  type: AtmEventType;
  username: string;
  /** Remote URL or local path. null → local initials fallback avatar. */
  avatarUrl: string | null;
  timestamp: number;
  gift?: GiftInfo;
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

export function isValidEvent(e: unknown): e is AtmEvent {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.id === "string" && o.id.length > 0 &&
    (o.type === "VIEWER_JOIN" || o.type === "GIFT_SMALL" || o.type === "GIFT_LARGE") &&
    typeof o.username === "string" &&
    typeof o.timestamp === "number"
  );
}
