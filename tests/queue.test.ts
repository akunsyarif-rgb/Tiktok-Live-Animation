import test from "node:test";
import assert from "node:assert/strict";
import { EventQueue } from "../src/lib/queue.ts";
import type { AtmEvent, AtmEventType } from "../src/lib/events.ts";

let n = 0;
const ev = (type: AtmEventType, id = `e${++n}`): AtmEvent => ({ id, type, username: "u", avatarUrl: null, timestamp: n });

function drain(q: EventQueue): string[] {
  const out: string[] = [];
  for (let e = q.next(); e; e = q.next()) {
    out.push(e.type[0] + e.type.slice(-1) === "VN" ? "J" : e.type === "GIFT_SMALL" ? "S" : "L");
    q.finish(e.id);
  }
  return out;
}

test("duplicate ids rejected, even after processing", () => {
  const q = new EventQueue();
  const a = ev("VIEWER_JOIN", "dup");
  assert.equal(q.enqueue(a), "accepted");
  assert.equal(q.enqueue({ ...a }), "duplicate");
  const got = q.next()!;
  q.finish(got.id);
  assert.equal(q.enqueue({ ...a }), "duplicate");
  assert.equal(q.duplicates, 2);
});

test("invalid event rejected", () => {
  const q = new EventQueue();
  assert.equal(q.enqueue({ id: "" } as AtmEvent), "invalid");
});

test("never starts a second event while one is active", () => {
  const q = new EventQueue();
  q.enqueue(ev("VIEWER_JOIN"));
  q.enqueue(ev("GIFT_LARGE"));
  const first = q.next()!;
  assert.equal(q.next(), null);
  q.finish(first.id);
  assert.ok(q.next());
});

test("community: strict FIFO", () => {
  const q = new EventQueue("community");
  ["VIEWER_JOIN", "GIFT_LARGE", "VIEWER_JOIN", "GIFT_SMALL"].forEach((t) => q.enqueue(ev(t as AtmEventType)));
  assert.deepEqual(drain(q), ["J", "L", "J", "S"]);
});

test("gift-priority: gifts first, FIFO within class", () => {
  const q = new EventQueue("gift-priority");
  ["VIEWER_JOIN", "VIEWER_JOIN", "GIFT_SMALL", "GIFT_LARGE", "GIFT_SMALL"].forEach((t) => q.enqueue(ev(t as AtmEventType)));
  assert.deepEqual(drain(q), ["S", "L", "S", "J", "J"]);
});

test("hybrid: join served after 3 consecutive gifts", () => {
  const q = new EventQueue("hybrid");
  q.enqueue(ev("VIEWER_JOIN"));
  for (let i = 0; i < 5; i++) q.enqueue(ev("GIFT_SMALL"));
  assert.deepEqual(drain(q), ["S", "S", "S", "J", "S", "S"]);
});

test("recovery: abortActive frees queue; serialize/restore keeps pending + active", () => {
  const q = new EventQueue();
  q.enqueue(ev("VIEWER_JOIN", "a"));
  q.enqueue(ev("VIEWER_JOIN", "b"));
  q.next();
  const snap = q.serialize();
  assert.deepEqual(snap.pending.map((e) => e.id), ["a", "b"]);
  const q2 = new EventQueue();
  q2.restore(snap);
  assert.equal(q2.enqueue(ev("VIEWER_JOIN", "a")), "duplicate");
  assert.equal(q2.next()!.id, "a");
  assert.equal(q.abortActive()!.id, "a");
  assert.equal(q.next()!.id, "b");
});
