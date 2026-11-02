import type { AtmEvent } from "./events.ts";

export interface AmbientSnapshot {
  comments: { id: string; name: string; text: string; until: number }[];
  /** comments merged away because traffic was too high */
  moreComments: number;
  like: { count: number; total: number; until: number } | null;
  toast: { id: string; text: string; kind: "follow" | "share"; until: number } | null;
  totals: { comments: number; likes: number; follows: number; shares: number };
}

export interface AmbientOptions {
  now?: () => number;
  likeWindowMs?: number;
  maxVisible?: number;
  maxPending?: number;
  /** how long a comment stays visible when traffic is low (default 7000) */
  commentMs?: number;
}

const COMMENT_MS = 7000;
const COMMENT_MIN_MS = 2500;
const LIKE_SHOW_MS = 2200;
const TOAST_MS = 3200;

interface Pending { id: string; name: string; text: string }
interface ToastReq { kind: "follow" | "share"; name: string; id: string }

/**
 * Ambient lane of the Animation Director: comments ticker, aggregated likes, follow/share toasts.
 * Never touches the ATM transaction queue, so it can never collide with a dispense animation.
 * Under load it MERGES instead of piling up: stale comments collapse to "+N", likes are one pulse per window,
 * several follows/shares become one toast.
 */
export class AmbientDirector {
  private now: () => number;
  likeWindowMs: number;
  private maxVisible: number;
  private maxPending: number;
  private commentMs: number;
  private visible: { id: string; name: string; text: string; until: number }[] = [];
  private pending: Pending[] = [];
  private merged = 0;
  private likeAcc = 0;
  private likeTotal = 0;
  private likeFlushAt = 0;
  private like: AmbientSnapshot["like"] = null;
  private toastQ: ToastReq[] = [];
  private toast: AmbientSnapshot["toast"] = null;
  private totals = { comments: 0, likes: 0, follows: 0, shares: 0 };

  constructor(o: AmbientOptions = {}) {
    this.now = o.now ?? Date.now;
    this.likeWindowMs = o.likeWindowMs ?? 4000;
    this.maxVisible = o.maxVisible ?? 3;
    this.maxPending = o.maxPending ?? 12;
    this.commentMs = o.commentMs ?? COMMENT_MS;
  }

  ingest(ev: AtmEvent): void {
    const t = this.now();
    if (ev.type === "COMMENT") {
      this.totals.comments++;
      this.pending.push({ id: ev.id, name: ev.username, text: ev.text ?? "" });
      while (this.pending.length > this.maxPending) {
        this.pending.shift();
        this.merged++;
      }
    } else if (ev.type === "LIKE") {
      const n = ev.count ?? 1;
      this.likeAcc += n;
      this.totals.likes += n;
      if (!this.likeFlushAt) this.likeFlushAt = t + this.likeWindowMs;
    } else if (ev.type === "FOLLOW" || ev.type === "SHARE") {
      const kind = ev.type === "FOLLOW" ? "follow" : "share";
      this.totals[kind === "follow" ? "follows" : "shares"]++;
      this.toastQ.push({ kind, name: ev.username, id: ev.id });
      if (this.toastQ.length > 30) this.toastQ.shift();
    }
    this.tick(t);
  }

  tick(t: number = this.now()): void {
    this.visible = this.visible.filter((c) => c.until > t);
    const showMs = Math.max(Math.min(COMMENT_MIN_MS, this.commentMs), this.commentMs - this.pending.length * 400);
    while (this.visible.length < this.maxVisible && this.pending.length) {
      const c = this.pending.shift()!;
      this.visible.push({ ...c, until: t + showMs });
    }
    if (this.merged && !this.pending.length && !this.visible.length) this.merged = 0;
    if (this.likeFlushAt && t >= this.likeFlushAt) {
      this.likeTotal += this.likeAcc;
      this.like = { count: this.likeAcc, total: this.likeTotal, until: t + LIKE_SHOW_MS };
      this.likeAcc = 0;
      this.likeFlushAt = 0;
    }
    if (this.like && this.like.until <= t) this.like = null;
    if (this.toast && this.toast.until <= t) this.toast = null;
    if (!this.toast && this.toastQ.length) {
      const first = this.toastQ[0]!;
      const same = this.toastQ.filter((q) => q.kind === first.kind);
      const group = same.length >= 3 ? same : [first];
      this.toastQ = this.toastQ.filter((q) => !group.includes(q));
      const verb = first.kind === "follow" ? "followed" : "shared the LIVE";
      const names = group.slice(0, 2).map((g) => "@" + g.name).join(", ");
      const text = group.length > 2 ? `${names} +${group.length - 2} ${verb}` : group.length === 2 ? `${names} ${verb}` : `${names} ${verb}`;
      this.toast = { id: first.id, text, kind: first.kind, until: t + TOAST_MS };
    }
  }

  /** Next time `tick` must run to keep the display correct (null = nothing scheduled). */
  nextWake(): number | null {
    const t = [...this.visible.map((c) => c.until), this.like?.until, this.toast?.until, this.likeFlushAt || undefined].filter((x): x is number => typeof x === "number" && x > 0);
    return t.length ? Math.min(...t) : null;
  }

  get busy(): boolean {
    return this.visible.length > 0 || this.pending.length > 0 || this.like !== null || this.toast !== null || this.toastQ.length > 0 || this.likeFlushAt > 0;
  }

  snapshot(): AmbientSnapshot {
    return { comments: this.visible.map((c) => ({ ...c })), moreComments: this.merged + this.pending.length, like: this.like && { ...this.like }, toast: this.toast && { ...this.toast }, totals: { ...this.totals } };
  }
}
