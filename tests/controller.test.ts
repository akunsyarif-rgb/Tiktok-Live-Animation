import test from "node:test";
import assert from "node:assert/strict";
import { AtmController, type Phase } from "../src/lib/controller.ts";
import type { SoundPlayer } from "../src/lib/audio/engine.ts";
import type { SoundId } from "../src/lib/audio/manifest.ts";
import type { AtmEvent, AtmEventType } from "../src/lib/events.ts";

const FAST = { processingJoinMs: 20, processingGiftMs: 25, dispenseMinMs: 30, completeHoldMs: 15, gapMs: 5, animScale: 0.01 };
let n = 0;
const ev = (type: AtmEventType, id = `c${++n}`): AtmEvent => ({
  id, type, username: "viewer" + n, avatarUrl: null, timestamp: n,
  gift: type === "VIEWER_JOIN" ? undefined : { name: "Rose", count: 2, diamonds: 1 },
});

/** Fake player: records start/end so overlap can be detected; each sound takes `ms`. */
function fakeAudio(ms = 10, hang = false) {
  const log: string[] = [];
  let playing = 0;
  let maxConcurrent = 0;
  const player: SoundPlayer = {
    play: async (id: SoundId) => {
      playing++;
      maxConcurrent = Math.max(maxConcurrent, playing);
      log.push(id);
      if (!hang) await new Promise((r) => setTimeout(r, ms));
      else await new Promise(() => {});
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

const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
};

test("viewer join: processing → dispensing(1 note) → complete → standby, sounds in order", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  const seq = trace(c);
  c.start();
  const e = ev("VIEWER_JOIN", "j1");
  c.enqueue(e);
  await until(() => c.getSnapshot().processed === 1);
  assert.deepEqual(seq.filter((s) => s.startsWith("j1")), ["j1:processing", "j1:dispensing", "j1:complete"]);
  assert.deepEqual(a.log, ["processing", "cash_dispense"]);
  c.stop();
});

test("gift small → multiple notes, gift sounds", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  let notes = 0;
  c.subscribe(() => { const p = c.getSnapshot().plan; if (p) notes = Math.max(notes, p.notes.length); });
  c.start();
  c.enqueue(ev("GIFT_SMALL"));
  await until(() => c.getSnapshot().processed === 1);
  assert.ok(notes >= 3, `notes=${notes}`);
  assert.deepEqual(a.log, ["gift_processing", "cash_dispense"]);
  c.stop();
});

test("gift large → bundle + premium sound", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  let kind = "";
  c.subscribe(() => { const p = c.getSnapshot().plan; if (p) kind = p.kind; });
  c.start();
  c.enqueue(ev("GIFT_LARGE"));
  await until(() => c.getSnapshot().processed === 1);
  assert.equal(kind, "bundle");
  assert.deepEqual(a.log, ["gift_processing", "premium_dispense"]);
  c.stop();
});

test("multiple queued: strictly sequential, no overlap, none lost, gift jumps ahead of waiting joins", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST, mode: "gift-priority" });
  const seq = trace(c);
  c.start();
  const ids = ["j1", "j2", "j3", "g1"];
  c.enqueue(ev("VIEWER_JOIN", "j1"));
  c.enqueue(ev("VIEWER_JOIN", "j2"));
  c.enqueue(ev("VIEWER_JOIN", "j3"));
  c.enqueue(ev("GIFT_SMALL", "g1"));
  await until(() => c.getSnapshot().processed === 4);
  const order = [...new Set(seq.filter((s) => !s.startsWith("-")).map((s) => s.split(":")[0]))];
  // j1 already active when the rest arrived; g1 must precede j2/j3
  assert.deepEqual(order, ["j1", "g1", "j2", "j3"]);
  // never two transactions interleaved
  const phases = seq.filter((s) => !s.startsWith("-"));
  for (let i = 1; i < phases.length; i++) {
    const [pid, pph] = phases[i - 1]!.split(":") as [string, Phase];
    const [cid] = phases[i]!.split(":");
    if (pid !== cid) assert.equal(pph, "complete", "new tx only starts after previous completed");
  }
  assert.equal(a.maxConcurrent(), 1);
  assert.equal(ids.length, c.getSnapshot().processed);
  c.stop();
});

test("duplicate event processed once", async () => {
  const a = fakeAudio();
  const c = new AtmController({ audio: a.player, timing: FAST });
  c.start();
  const e = ev("VIEWER_JOIN", "dupe");
  assert.equal(c.enqueue(e), "accepted");
  assert.equal(c.enqueue({ ...e }), "duplicate");
  await until(() => c.getSnapshot().processed >= 1);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(c.enqueue({ ...e }), "duplicate");
  assert.equal(c.getSnapshot().processed, 1);
  assert.equal(c.getSnapshot().duplicates, 2);
  c.stop();
});

test("recovery: hung audio is aborted by watchdog and queue continues", async () => {
  const hung = fakeAudio(0, true);
  const c = new AtmController({ audio: hung.player, timing: { ...FAST, watchdogMs: 60 } });
  c.start();
  c.enqueue(ev("VIEWER_JOIN", "h1"));
  c.enqueue(ev("VIEWER_JOIN", "h2"));
  await until(() => c.getSnapshot().processed === 2, 2000);
  assert.equal(c.getSnapshot().recovered, 2);
  c.stop();
});

test("queue recovery from storage after reload", async () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const c1 = new AtmController({ audio: fakeAudio(500).player, timing: FAST, storage });
  c1.start();
  c1.enqueue(ev("VIEWER_JOIN", "r1"));
  c1.enqueue(ev("GIFT_SMALL", "r2"));
  await new Promise((r) => setTimeout(r, 10));
  c1.stop(); // simulated page reload mid-transaction
  const a2 = fakeAudio();
  const c2 = new AtmController({ audio: a2.player, timing: FAST, storage });
  c2.start();
  await until(() => c2.getSnapshot().processed === 2);
  assert.equal(c2.enqueue(ev("VIEWER_JOIN", "r1")), "duplicate");
  c2.stop();
});
