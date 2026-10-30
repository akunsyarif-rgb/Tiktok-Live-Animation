import test from "node:test";
import assert from "node:assert/strict";
import { EventQueue } from "../src/lib/queue.ts";
import type { AtmEventType } from "../src/lib/events.ts";
import { mkEvent } from "./helpers.ts";

const code = (t: AtmEventType) => (t === "VIEWER_JOIN" ? "J" : t === "GIFT_SMALL" ? "S" : "L");

function drain(q: EventQueue): string[] {
  const out: string[] = [];
  for (let e = q.next(); e; e = q.next()) {
    out.push(code(e.type));
    q.finish(e.id);
  }
  return out;
}

test("duplicate ids rejected, even after processing", () => {
  const q = new EventQueue();
  const a = mkEvent("VIEWER_JOIN", "dup");
  assert.equal(q.enqueue(a), "accepted");
  assert.equal(q.enqueue({ ...a }), "duplicate");
  const got = q.next()!;
  q.finish(got.id);
  assert.equal(q.enqueue({ ...a }), "duplicate");
  assert.equal(q.duplicates, 2);
});

test("invalid event rejected", () => {
  assert.equal(new EventQueue().enqueue({ id: "" } as never), "invalid");
});

test("never starts a second event while one is active", () => {
  const q = new EventQueue();
  q.enqueue(mkEvent("VIEWER_JOIN"));
  q.enqueue(mkEvent("GIFT_LARGE"));
  const first = q.next()!;
  assert.equal(q.next(), null);
  q.finish(first.id);
  assert.ok(q.next());
});

test("community: strict FIFO", () => {
  const q = new EventQueue("community");
  (["VIEWER_JOIN", "GIFT_LARGE", "VIEWER_JOIN", "GIFT_SMALL"] as const).forEach((t) => q.enqueue(mkEvent(t)));
  assert.deepEqual(drain(q), ["J", "L", "J", "S"]);
});

test("gift-priority: gifts first, FIFO within class", () => {
  const q = new EventQueue("gift-priority");
  (["VIEWER_JOIN", "VIEWER_JOIN", "GIFT_SMALL", "GIFT_LARGE", "GIFT_SMALL"] as const).forEach((t) => q.enqueue(mkEvent(t)));
  assert.deepEqual(drain(q), ["S", "L", "S", "J", "J"]);
});

test("hybrid: join served after N consecutive gifts (N configurable)", () => {
  const q = new EventQueue("hybrid");
  q.enqueue(mkEvent("VIEWER_JOIN"));
  for (let i = 0; i < 5; i++) q.enqueue(mkEvent("GIFT_SMALL"));
  assert.deepEqual(drain(q), ["S", "S", "S", "J", "S", "S"]);
  const q2 = new EventQueue("hybrid", { hybridGiftBurst: 1 });
  q2.enqueue(mkEvent("VIEWER_JOIN"));
  for (let i = 0; i < 3; i++) q2.enqueue(mkEvent("GIFT_SMALL"));
  assert.deepEqual(drain(q2), ["S", "J", "S", "S"]);
});

test("hybrid: a join that waited too long goes next even with few gifts served", () => {
  let t = 0;
  const q = new EventQueue("hybrid", { hybridGiftBurst: 99, hybridMaxJoinWaitMs: 10_000 }, () => t);
  q.enqueue(mkEvent("VIEWER_JOIN", "old"));
  t = 11_000;
  q.enqueue(mkEvent("GIFT_SMALL", "g"));
  assert.equal(q.next()!.id, "old"); // waited 11s ≥ 10s limit
});

test("hybrid: a join that has not waited long enough does NOT jump the gift", () => {
  let t = 0;
  const q = new EventQueue("hybrid", { hybridGiftBurst: 99, hybridMaxJoinWaitMs: 10_000 }, () => t);
  q.enqueue(mkEvent("VIEWER_JOIN", "j"));
  t = 5_000;
  q.enqueue(mkEvent("GIFT_SMALL", "g"));
  assert.equal(q.next()!.id, "g");
});

test("overflow: oldest waiting joins evicted, gifts kept", () => {
  const q = new EventQueue("hybrid", { maxPending: 5, hardMaxPending: 50 });
  for (let i = 0; i < 5; i++) q.enqueue(mkEvent("VIEWER_JOIN", `j${i}`));
  assert.equal(q.enqueue(mkEvent("GIFT_LARGE", "g")), "accepted");
  assert.equal(q.length, 5);
  assert.equal(q.evicted, 1);
  assert.ok(q.getPending().some((e) => e.id === "g"));
  assert.ok(!q.getPending().some((e) => e.id === "j0"), "oldest join evicted");
});

test("overflow: queue full of gifts rejects a join but keeps accepting gifts up to hard cap", () => {
  const q = new EventQueue("hybrid", { maxPending: 3, hardMaxPending: 5 });
  for (let i = 0; i < 3; i++) q.enqueue(mkEvent("GIFT_SMALL", `g${i}`));
  assert.equal(q.enqueue(mkEvent("VIEWER_JOIN", "j")), "dropped");
  assert.equal(q.enqueue(mkEvent("GIFT_SMALL", "g3")), "accepted");
  assert.equal(q.enqueue(mkEvent("GIFT_SMALL", "g4")), "accepted");
  assert.equal(q.enqueue(mkEvent("GIFT_SMALL", "g5")), "dropped");
});

test("recovery: abortActive frees queue; requeueActive keeps the event; serialize/restore", () => {
  const q = new EventQueue();
  q.enqueue(mkEvent("VIEWER_JOIN", "a"));
  q.enqueue(mkEvent("VIEWER_JOIN", "b"));
  q.next();
  const snap = q.serialize();
  assert.equal(snap.active?.id, "a");
  assert.deepEqual(snap.pending.map((e) => e.id), ["b"]);
  q.requeueActive();
  assert.deepEqual(q.getPending().map((e) => e.id), ["a", "b"]);
  assert.equal(q.next()!.id, "a");
  assert.equal(q.abortActive()!.id, "a");
  assert.equal(q.next()!.id, "b");
  const q2 = new EventQueue();
  q2.restore({ pending: [mkEvent("VIEWER_JOIN", "x")], active: null, seen: ["x", "a"] });
  assert.equal(q2.enqueue(mkEvent("VIEWER_JOIN", "a")), "duplicate");
});

test("stress: 20000 mixed events, queue bounded, no id processed twice, gifts never evicted below hard cap", () => {
  const q = new EventQueue("hybrid", { maxPending: 100, hardMaxPending: 500 });
  const processed = new Set<string>();
  let giftsAccepted = 0;
  let giftsProcessed = 0;
  for (let i = 0; i < 20000; i++) {
    const type: AtmEventType = i % 50 === 0 ? "GIFT_SMALL" : "VIEWER_JOIN";
    const e = mkEvent(type, `s${i}`);
    if (q.enqueue(e) === "accepted" && type !== "VIEWER_JOIN") giftsAccepted++;
    q.enqueue({ ...e }); // duplicate resend
    assert.ok(q.length <= 500);
    if (i % 7 === 0) { // consumer is slower than producer
      const n = q.next();
      if (n) {
        assert.ok(!processed.has(n.id), "processed twice: " + n.id);
        processed.add(n.id);
        if (n.type !== "VIEWER_JOIN") giftsProcessed++;
        q.finish(n.id);
      }
    }
  }
  for (let n = q.next(); n; n = q.next()) {
    assert.ok(!processed.has(n.id));
    processed.add(n.id);
    if (n.type !== "VIEWER_JOIN") giftsProcessed++;
    q.finish(n.id);
  }
  assert.equal(giftsProcessed, giftsAccepted, "no accepted gift lost");
  assert.ok(q.evicted > 0, "joins were evicted under overload");
  assert.ok(q.duplicates >= 20000 - 1);
});
