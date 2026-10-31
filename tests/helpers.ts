import type { AtmEvent, AtmEventType } from "../src/lib/events.ts";

let n = 0;
export const mkEvent = (type: AtmEventType, id = `t${++n}`, extra: Partial<AtmEvent> = {}): AtmEvent => ({
  id, type, username: `viewer${n}`, avatarUrl: null, timestamp: Date.now(), source: "simulator",
  gift: type === "VIEWER_JOIN" ? undefined : { name: "Rose", count: 2, diamonds: type === "GIFT_LARGE" ? 2000 : 5 },
  ...extra,
});

export const until = async (cond: () => boolean, ms = 4000, label = "condition") => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
