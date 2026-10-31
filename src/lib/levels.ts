import type { AtmEvent } from "./events.ts";

export type ThemeId = "atm" | "reactor" | "marble";
export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "atm", label: "ATM Machine" },
  { id: "reactor", label: "Energy Reactor" },
  { id: "marble", label: "Kinetic Marble Machine" },
];
export const isThemeId = (v: unknown): v is ThemeId => v === "atm" || v === "reactor" || v === "marble";

/** 0 join · 1 small · 2 medium · 3 big · 4 special */
export type GiftLevel = 0 | 1 | 2 | 3 | 4;
export const LEVEL_LABEL: Record<GiftLevel, string> = { 0: "Viewer Join", 1: "Small Gift", 2: "Medium Gift", 3: "Big Gift", 4: "Special Gift" };

export interface VisualSettings {
  theme: ThemeId;
  /** idle / attract animation on or off (off = static pose, no idle motion, no render loop while waiting) */
  idleEnabled: boolean;
  /** minimum total time a welcome (viewer join) stays on screen */
  welcomeMs: number;
  /** gift value (diamonds) at which a gift becomes Medium / Big / Special */
  giftMediumDiamonds: number;
  giftBigDiamonds: number;
  giftSpecialDiamonds: number;
  /** 0.5 – 1.5 scales particle counts, glow and motion amplitude (not timing) */
  intensity: number;
  showRecent: boolean;
  /** a second Special within this window is shown as Big (keeps the grand effect rare) */
  specialCooldownMs: number;
  /** when this many joins are waiting they are welcomed together as one group */
  groupWelcomeAt: number;
}

export const DEFAULT_VISUAL: VisualSettings = {
  theme: "atm",
  idleEnabled: true,
  welcomeMs: 4000,
  giftMediumDiamonds: 30,
  giftBigDiamonds: 1000,
  giftSpecialDiamonds: 10000,
  intensity: 1,
  showRecent: true,
  specialCooldownMs: 60_000,
  groupWelcomeAt: 4,
};

const clampN = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Validates untrusted visual settings; every field optional → defaults. Thresholds are forced ascending. */
export function normalizeVisual(raw: unknown, base: VisualSettings = DEFAULT_VISUAL): VisualSettings {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const medium = Math.round(clampN(o.giftMediumDiamonds, 1, 1e7, base.giftMediumDiamonds));
  const big = Math.round(clampN(o.giftBigDiamonds, medium + 1, 1e8, Math.max(base.giftBigDiamonds, medium + 1)));
  const special = Math.round(clampN(o.giftSpecialDiamonds, big + 1, 1e9, Math.max(base.giftSpecialDiamonds, big + 1)));
  return {
    theme: isThemeId(o.theme) ? o.theme : base.theme,
    idleEnabled: typeof o.idleEnabled === "boolean" ? o.idleEnabled : base.idleEnabled,
    welcomeMs: Math.round(clampN(o.welcomeMs, 2000, 12000, base.welcomeMs)),
    giftMediumDiamonds: medium,
    giftBigDiamonds: big,
    giftSpecialDiamonds: special,
    intensity: clampN(o.intensity, 0.5, 1.5, base.intensity),
    showRecent: typeof o.showRecent === "boolean" ? o.showRecent : base.showRecent,
    specialCooldownMs: Math.round(clampN(o.specialCooldownMs, 0, 3_600_000, base.specialCooldownMs)),
    groupWelcomeAt: Math.round(clampN(o.groupWelcomeAt, 2, 50, base.groupWelcomeAt)),
  };
}

/**
 * Level from the EXISTING event (no new backend event type):
 * - join → 0
 * - gift with a known value (gift.diamonds > 0) → by configurable thresholds
 * - gift without value → by type (GIFT_SMALL → 1, GIFT_LARGE → 3)
 */
export function levelOf(e: Pick<AtmEvent, "type" | "gift">, v: Pick<VisualSettings, "giftMediumDiamonds" | "giftBigDiamonds" | "giftSpecialDiamonds">): GiftLevel {
  if (e.type === "VIEWER_JOIN") return 0;
  const d = e.gift?.diamonds ?? 0;
  if (d > 0) return d >= v.giftSpecialDiamonds ? 4 : d >= v.giftBigDiamonds ? 3 : d >= v.giftMediumDiamonds ? 2 : 1;
  return e.type === "GIFT_LARGE" ? 3 : 1;
}

/** Small deterministic hash → stable per-event variation (welcome phrase, marble route…). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WELCOME = ["Welcome, @{n}", "Glad you’re here, @{n}", "A new visitor has arrived: @{n}"];
/** Safe fallback for empty names. */
export function displayName(name: string | undefined | null): string {
  const n = (name ?? "").trim();
  return n ? n : "guest";
}
export function welcomeText(name: string, seed: number): string {
  return WELCOME[seed % WELCOME.length]!.replace("{n}", displayName(name));
}
export function groupWelcomeText(names: string[], maxShown = 3): string {
  const shown = names.slice(0, maxShown).map((n) => "@" + displayName(n));
  const more = names.length - shown.length;
  return `Welcome, ${shown.join(", ")}${more > 0 ? ` +${more} more` : ""}`;
}
