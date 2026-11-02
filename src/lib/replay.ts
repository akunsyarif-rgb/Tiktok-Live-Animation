/**
 * Replay protection for control-plane messages (settings, clear): a signed message is only accepted if its
 * timestamp is strictly newer than the last accepted one of that type. A captured `clear`/`settings` therefore cannot be
 * re-sent, even inside the ±10 min signature window. Events are protected by their idempotent id instead.
 */
export type ControlType = "settings" | "clear";

export class ReplayGuard {
  private last: Record<ControlType, number>;

  constructor(initial?: Partial<Record<ControlType, number>>) {
    this.last = { settings: initial?.settings ?? 0, clear: initial?.clear ?? 0 };
  }

  /** true = fresh (and remembered), false = replay / out of order */
  accept(type: ControlType, ts: number): boolean {
    if (!Number.isFinite(ts) || ts <= this.last[type]) return false;
    this.last[type] = ts;
    return true;
  }

  snapshot(): Record<ControlType, number> {
    return { ...this.last };
  }
}
