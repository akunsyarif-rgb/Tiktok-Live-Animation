import type { AtmEvent } from "./events.ts";

/** Pre-LIVE configurable response rules for the ambient lane. Pure data, validated on every entry point. */
export interface RulesConfig {
  commentsEnabled: boolean;
  commentMaxLen: number;
  /** words/phrases that hide a comment (case-insensitive, leetspeak-normalized) */
  blocklist: string[];
  /** minimum gap between two comments of the same user */
  commentUserGapMs: number;
  likesEnabled: boolean;
  /** likes are shown as one aggregated pulse per window */
  likeWindowMs: number;
  followsEnabled: boolean;
  sharesEnabled: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  commentsEnabled: true,
  commentMaxLen: 80,
  blocklist: [],
  commentUserGapMs: 2500,
  likesEnabled: true,
  likeWindowMs: 4000,
  followsEnabled: true,
  sharesEnabled: true,
};

const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function normalizeRules(raw: unknown, base: RulesConfig = DEFAULT_RULES): RulesConfig {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(o.blocklist) ? o.blocklist : base.blocklist;
  return {
    commentsEnabled: bool(o.commentsEnabled, base.commentsEnabled),
    commentMaxLen: clampN(o.commentMaxLen, 10, 140, base.commentMaxLen),
    blocklist: list.filter((w): w is string => typeof w === "string").map((w) => w.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 100),
    commentUserGapMs: clampN(o.commentUserGapMs, 0, 60_000, base.commentUserGapMs),
    likesEnabled: bool(o.likesEnabled, base.likesEnabled),
    likeWindowMs: clampN(o.likeWindowMs, 1000, 15_000, base.likeWindowMs),
    followsEnabled: bool(o.followsEnabled, base.followsEnabled),
    sharesEnabled: bool(o.sharesEnabled, base.sharesEnabled),
  };
}

export type Decision = { action: "show"; ev: AtmEvent } | { action: "filter"; reason: string };

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s", "7": "t" };
const norm = (t: string) => t.toLowerCase().replace(/[01345@$7]/g, (c) => LEET[c] ?? c).replace(/[^a-z\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ");
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|id|io|co|me|gg|ly|xyz|link|site)\b)/i;
const MAX_TRACKED_USERS = 500;

/** Deterministic response rules (no AI): spam/empty/link filtering, truncation, per-user rate and duplicate-text limits. */
export class RulesEngine {
  cfg: RulesConfig;
  private lastAt = new Map<string, number>();
  private lastText = new Map<string, { t: string; at: number }>();
  private now: () => number;

  constructor(cfg: RulesConfig = DEFAULT_RULES, now: () => number = Date.now) {
    this.cfg = cfg;
    this.now = now;
  }

  setConfig(cfg: RulesConfig): void {
    this.cfg = cfg;
  }

  evaluate(ev: AtmEvent): Decision {
    const c = this.cfg;
    switch (ev.type) {
      case "COMMENT":
        return this.comment(ev);
      case "LIKE":
        return c.likesEnabled ? { action: "show", ev } : { action: "filter", reason: "likes disabled" };
      case "FOLLOW":
        return c.followsEnabled ? { action: "show", ev } : { action: "filter", reason: "follows disabled" };
      case "SHARE":
        return c.sharesEnabled ? { action: "show", ev } : { action: "filter", reason: "shares disabled" };
      default:
        return { action: "show", ev };
    }
  }

  private comment(ev: AtmEvent): Decision {
    const c = this.cfg;
    if (!c.commentsEnabled) return { action: "filter", reason: "comments disabled" };
    const text = (ev.text ?? "").trim();
    if (!text) return { action: "filter", reason: "empty" };
    if (LINK.test(text)) return { action: "filter", reason: "link" };
    if (/(.)\1{7,}/u.test(text)) return { action: "filter", reason: "repeated characters" };
    const n = norm(text);
    if (c.blocklist.some((w) => w && n.includes(norm(w)))) return { action: "filter", reason: "blocked word" };
    const t = this.now();
    const key = ev.username.toLowerCase();
    const prevAt = this.lastAt.get(key);
    if (prevAt !== undefined && t - prevAt < c.commentUserGapMs) return { action: "filter", reason: "rate (same user)" };
    const prevText = this.lastText.get(key);
    if (prevText && prevText.t === n && t - prevText.at < 30_000) return { action: "filter", reason: "duplicate text" };
    this.lastAt.set(key, t);
    this.lastText.set(key, { t: n, at: t });
    if (this.lastAt.size > MAX_TRACKED_USERS) {
      for (const k of this.lastAt.keys()) { this.lastAt.delete(k); this.lastText.delete(k); if (this.lastAt.size <= MAX_TRACKED_USERS / 2) break; }
    }
    const shown = text.length > c.commentMaxLen ? text.slice(0, c.commentMaxLen - 1).trimEnd() + "…" : text;
    return { action: "show", ev: { ...ev, text: shown } };
  }
}
