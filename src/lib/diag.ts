export type DiagLevel = "info" | "warn" | "error";
export interface DiagEntry {
  t: number;
  level: DiagLevel;
  msg: string;
}

const MAX = 300;

/** Secrets must never reach the log: JWTs, Supabase keys, long tokens, room codes. */
export function redact(s: string): string {
  return s
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[jwt]")
    .replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, "[sb-key]")
    .replace(/(apikey|api_key|token|authorization|secret|password)(["'\s:=]+)[^\s"',&]+/gi, "$1$2[redacted]")
    .replace(/\broom=([A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, "room=$1…");
}

/** Short ring-buffer log shown in /control and /overlay?debug=1. Redacted at write time. */
export class DiagLog {
  private entries: DiagEntry[] = [];
  private listeners = new Set<() => void>();
  private snap: readonly DiagEntry[] = [];

  add = (level: DiagLevel, msg: string): void => {
    this.entries.push({ t: Date.now(), level, msg: redact(msg).slice(0, 300) });
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX);
    this.snap = [...this.entries];
    this.listeners.forEach((l) => l());
  };
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): readonly DiagEntry[] => this.snap;

  toText(extra = ""): string {
    const lines = this.snap.map((e) => `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.msg}`);
    return redact([extra, ...lines].filter(Boolean).join("\n"));
  }
}
