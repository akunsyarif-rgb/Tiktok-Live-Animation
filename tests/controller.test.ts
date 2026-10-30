import test from "node:test";
import assert from "node:assert/strict";
import { AtmController, PERSIST_MAX_AGE_MS, type Phase } from "../src/lib/controller.ts";
import type { SoundPlayer } from "../src/lib/audio/engine.ts";
import type { SoundId } from "../src/lib/audio/manifest.ts";
import { mkEvent, until, sleep } from "./helpers.ts";

const FAST = { processingJoinMs: 20, processingGiftMs: 25, dispenseMinMs: 30, completeHoldMs: 15, gapMs: 5, animScale: 0.01 };

/** Fake player: records start order and detects overlap. */
function fakeAudio(opts: { ms?: number; hang?: boolean; reject?: boolean } = {}) {
  const log: string[] = [];
  let playing = 0;
  let maxConcurrent = 0;
  const player: SoundPlayer = {
    play: async (id: SoundId) => {
      log.push(id);
      if (opts.reject) throw new Error("audio exploded");
      playing++;
      maxConcurrent = Math.max(maxConcurrent, playing);
      if (opts.hang) await new Promise(() => {});
      await sleep(opts.ms ?? 10);
      playing--;
    },
    stop: () => {},
  };
  return { player, log, maxConcurrent: () => maxConcurrent };
}

function trace(c: AtmController) {
  const seq: string[] = [];
  let last = "";
  c.subscribe(() => {
    const s = c.getSnapshot();
    const key = `${s.current?.id ?? "-"}:${s.phase}`;
    if (key !== last) { last = key; seq.push(key); }
  });
  return seq;
}

const memStore = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("viewer join: processing → dispensing(1 note) → complete → standby; sounds in order incl. success beep", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  const seq = trace(c);
  c.start();
  c.enqueue(mkEvent("VIEWER_JOIN", "j1"));
  await until(() => c.getSnapshot().processed === 1);
  assert.deepEqual(seq.filter((s) => s.startsWith("j1")), ["j1:processing", "j1:dispensing", "j1:complete"]);
  assert.deepEqual(a.log, ["processing", "cash_dispense", "success"]);
  c.stop();
});

test("gift small → several notes, gift sounds", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  let notes = 0;
  c.subscribe(() => { const p = c.getSnapshot().plan; if (p) notes = Math.max(notes, p.notes.length); });
  c.start();
  c.enqueue(mkEvent("GIFT_SMALL"));
  await until(() => c.getSnapshot().processed === 1);
  assert.ok(notes >= 3, `notes=${notes}`);
  assert.deepEqual(a.log, ["gift_processing", "cash_dispense", "success"]);
  c.stop();
});

test("gift large → bundle of exactly 10 notes + premium sound", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  let plan: { kind: string; n: number } | null = null;
  c.subscribe(() => { const p = c.getSnapshot().plan; if (p) plan = { kind: p.kind, n: p.notes.length }; });
  c.start();
  c.enqueue(mkEvent("GIFT_LARGE"));
  await until(() => c.getSnapshot().processed === 1);
  assert.deepEqual(plan, { kind: "bundle", n: 10 });
  assert.deepEqual(a.log, ["gift_processing", "premium_dispense", "success"]);
  c.stop();
});

test("audio failure (play rejects) does not stop the visual transaction", async () => {
  const a = fakeAudio({ reject: true });
  const logs: string[] = [];
  const c = new AtmController({ audio: a.player, timing: FAST, log: (_l, m) => logs.push(m) });
  const seq = trace(c);
  c.start();
  c.enqueue(mkEvent("GIFT_LARGE", "g1"));
  c.enqueue(mkEvent("VIEWER_JOIN", "j1"));
  await until(() => c.getSnapshot().processed === 2);
  assert.deepEqual(seq.filter((s) => s.startsWith("g1")), ["g1:processing", "g1:dispensing", "g1:complete"]);
  assert.ok(logs.some((l) => l.includes("audio") && l.includes("failed")));
  assert.equal(c.getSnapshot().recovered, 0, "audio failure must not trigger the watchdog");
  c.stop();
});

test("multiple queued: sequential, no overlap, none lost, gift jumps ahead of waiting joins", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST, mode: "gift-priority" });
  const seq = trace(c);
  c.start();
  c.enqueue(mkEvent("VIEWER_JOIN", "j1"));
  c.enqueue(mkEvent("VIEWER_JOIN", "j2"));
  c.enqueue(mkEvent("VIEWER_JOIN", "j3"));
  c.enqueue(mkEvent("GIFT_SMALL", "g1"));
  await until(() => c.getSnapshot().processed === 4);
  const phases = seq.filter((s) => !s.startsWith("-"));
  assert.deepEqual([...new Set(phases.map((s) => s.split(":")[0]))], ["j1", "g1", "j2", "j3"]);
  for (let i = 1; i < phases.length; i++) {
    const [pid, pph] = phases[i - 1]!.split(":") as [string, Phase];
    const [cid] = phases[i]!.split(":");
    if (pid !== cid) assert.equal(pph, "complete", "new tx only starts after previous completed");
  }
  assert.equal(a.maxConcurrent(), 1);
  c.stop();
});

test("burst of 60 events: all processed exactly once, in order of policy, no overlap", async () => {
  const a = fakeAudio({ ms: 1 });
  const c = new AtmController({ audio: a.player, timing: { ...FAST, processingJoinMs: 1, processingGiftMs: 1, dispenseMinMs: 1, completeHoldMs: 1, gapMs: 0 }, mode: "community" });
  const started: string[] = [];
  let last = "";
  c.subscribe(() => { const s = c.getSnapshot(); if (s.phase === "processing" && s.current && s.current.id !== last) { last = s.current.id; started.push(last); } });
  c.start();
  const ids: string[] = [];
  for (let i = 0; i < 60; i++) {
    const e = mkEvent(i % 5 === 0 ? "GIFT_SMALL" : "VIEWER_JOIN", `b${i}`);
    ids.push(e.id);
    c.enqueue(e);
  }
  await until(() => c.getSnapshot().processed === 60, 15000, "60 processed");
  assert.deepEqual(started, ids);
  assert.equal(a.maxConcurrent(), 1);
  c.stop();
});

test("gift arriving mid-animation waits; active transaction is never interrupted", async () => {
  const a = fakeAudio({ ms: 40 });
  const c = new AtmController({ audio: a.player, timing: FAST, mode: "gift-priority" });
  const seq = trace(c);
  c.start();
  c.enqueue(mkEvent("VIEWER_JOIN", "j1"));
  await until(() => c.getSnapshot().phase === "dispensing");
  c.enqueue(mkEvent("GIFT_LARGE", "g1"));
  await until(() => c.getSnapshot().processed === 2);
  const order = seq.filter((s) => !s.startsWith("-"));
  const j1done = order.indexOf("j1:complete");
  const g1start = order.indexOf("g1:processing");
  assert.ok(j1done !== -1 && g1start > j1done);
  c.stop();
});

test("duplicate event processed once, also after completion", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  c.start();
  const e = mkEvent("VIEWER_JOIN", "dupe");
  assert.equal(c.enqueue(e), "accepted");
  assert.equal(c.enqueue({ ...e }), "duplicate");
  await until(() => c.getSnapshot().processed >= 1);
  await sleep(100);
  assert.equal(c.enqueue({ ...e }), "duplicate");
  assert.equal(c.getSnapshot().processed, 1);
  assert.equal(c.getSnapshot().duplicates, 2);
  c.stop();
});

test("untrusted input is sanitized in the controller (bad avatar scheme, control chars, giant name)", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  c.start();
  const bad = mkEvent("VIEWER_JOIN", "evil", { username: "x\u0000y".repeat(100), avatarUrl: "javascript:alert(1)" });
  assert.equal(c.enqueue(bad), "accepted");
  await until(() => c.getSnapshot().current?.id === "evil");
  const cur = c.getSnapshot().current!;
  assert.equal(cur.avatarUrl, null);
  assert.ok(cur.username.length <= 40 && !cur.username.includes("\u0000"));
  assert.equal(c.enqueue({ id: "../../etc", type: "VIEWER_JOIN", username: "a", avatarUrl: null, timestamp: 1 }), "invalid");
  c.stop();
});

test("watchdog: hung audio is aborted once, queue continues, no transaction starts twice", async () => {
  const hung = fakeAudio({ hang: true });
  const c = new AtmController({ audio: hung.player, timing: { ...FAST, watchdogMs: 60 } });
  const starts: string[] = [];
  let last = "";
  c.subscribe(() => { const s = c.getSnapshot(); if (s.phase === "processing" && s.current && s.current.id !== last) { last = s.current.id; starts.push(last); } });
  c.start();
  c.enqueue(mkEvent("VIEWER_JOIN", "h1"));
  c.enqueue(mkEvent("VIEWER_JOIN", "h2"));
  await until(() => c.getSnapshot().processed === 2, 3000);
  assert.equal(c.getSnapshot().recovered, 2);
  assert.deepEqual(starts, ["h1", "h2"], "each event started exactly once");
  c.stop();
});

test("queue recovery after reload: pending + interrupted event resume; duplicates still blocked", async () => {
  const store = memStore();
  const c1 = new AtmController({ audio: fakeAudio({ ms: 500 }).player, timing: FAST, storage: store });
  c1.start();
  c1.enqueue(mkEvent("VIEWER_JOIN", "r1"));
  c1.enqueue(mkEvent("GIFT_SMALL", "r2"));
  await sleep(10); // r1 is mid-processing
  // simulated hard reload: no stop(), the page just disappears
  const a2 = fakeAudio();
  const c2 = new AtmController({ audio: a2.player, timing: FAST, storage: store });
  c2.start();
  await until(() => c2.getSnapshot().processed === 2);
  assert.equal(c2.enqueue(mkEvent("VIEWER_JOIN", "r1")), "duplicate");
  c1.stop();
  c2.stop();
});

test("reload while 'take your cash' is showing does NOT run that transaction twice", async () => {
  const store = memStore();
  const c1 = new AtmController({ audio: fakeAudio({ ms: 5 }).player, timing: { ...FAST, completeHoldMs: 400 }, storage: store });
  c1.start();
  c1.enqueue(mkEvent("VIEWER_JOIN", "done1"));
  c1.enqueue(mkEvent("VIEWER_JOIN", "next1"));
  await until(() => c1.getSnapshot().phase === "complete");
  const a2 = fakeAudio();
  const seq: string[] = [];
  const c2 = new AtmController({ audio: a2.player, timing: FAST, storage: store });
  c2.subscribe(() => { const s = c2.getSnapshot(); if (s.phase === "processing" && s.current) seq.push(s.current.id); });
  c2.start();
  await until(() => c2.getSnapshot().processed === 1);
  await sleep(100);
  assert.deepEqual([...new Set(seq)], ["next1"]);
  c1.stop();
  c2.stop();
});

test("stale persisted queue is discarded", async () => {
  const store = memStore();
  let t = 1_000_000;
  const c1 = new AtmController({ audio: fakeAudio({ ms: 500 }).player, timing: FAST, storage: store, now: () => t });
  c1.start();
  c1.enqueue(mkEvent("GIFT_LARGE", "old1"));
  t += PERSIST_MAX_AGE_MS + 1000;
  const c2 = new AtmController({ audio: fakeAudio().player, timing: FAST, storage: store, now: () => t });
  c2.start();
  await sleep(100);
  assert.equal(c2.getSnapshot().processed, 0);
  c1.stop();
  c2.stop();
});

test("stop() (e.g. React unmount) re-queues the active event instead of losing it", async () => {
  const store = memStore();
  const c = new AtmController({ audio: fakeAudio({ ms: 200 }).player, timing: FAST, storage: store });
  c.start();
  c.enqueue(mkEvent("VIEWER_JOIN", "s1"));
  await until(() => c.getSnapshot().phase === "processing");
  c.stop();
  await sleep(20);
  assert.equal(c.getSnapshot().processed, 0);
  assert.equal(c.getSnapshot().waitingTotal, 1);
  c.start(); // StrictMode remount
  await until(() => c.getSnapshot().processed === 1);
  c.stop();
});

test("overload: joins evicted, every gift still gets its transaction, counters visible", async () => {
  const c = new AtmController({ audio: fakeAudio({ ms: 2 }).player, timing: { ...FAST, processingJoinMs: 2, processingGiftMs: 2, dispenseMinMs: 2, completeHoldMs: 2, gapMs: 0 }, policy: { maxPending: 10 } });
  const started = new Set<string>();
  c.subscribe(() => { const s = c.getSnapshot(); if (s.current) started.add(s.current.id); });
  c.start();
  for (let i = 0; i < 40; i++) c.enqueue(mkEvent("VIEWER_JOIN", `oj${i}`));
  for (let i = 0; i < 3; i++) c.enqueue(mkEvent("GIFT_LARGE", `og${i}`));
  assert.ok(c.getSnapshot().waitingTotal <= 10);
  assert.ok(c.getSnapshot().dropped >= 29, "evictions counted");
  await until(() => c.getSnapshot().waitingTotal === 0 && c.getSnapshot().phase === "standby" && c.getSnapshot().processed >= 4, 10000);
  for (let i = 0; i < 3; i++) assert.ok(started.has(`og${i}`), `gift og${i} processed`);
  c.stop();
});
