import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, RulesEngine, normalizeRules } from "../src/lib/rules.ts";
import { AmbientDirector } from "../src/lib/director.ts";
import { evaluateReadiness, type ReadinessInput } from "../src/lib/readiness.ts";
import { generateSigningKeys, importPrivate, importPublic, signMessage, verifyMessage, stableStringify, MAX_SKEW_MS } from "../src/lib/sign.ts";
import { sanitizeEvent } from "../src/lib/events.ts";
import { parseMessage } from "../src/lib/protocol.ts";
import { likeCountOf, mapComment, mapFollow, mapLikeBatch, mapShare } from "../src/lib/tiktok-map.ts";
import { AtmController } from "../src/lib/controller.ts";
import type { SoundPlayer } from "../src/lib/audio/engine.ts";
import { mkEvent, sleep, until } from "./helpers.ts";

const comment = (id: string, user: string, text: string) => mkEvent("COMMENT", id, { username: user, text, gift: undefined });
const silent: SoundPlayer = { play: async () => {}, stop: () => {} };
const QUICK = { processingJoinMs: 2, processingGiftMs: 2, dispenseMinMs: 2, completeHoldMs: 2, gapMs: 0, animScale: 0.001 };

// ---------------- new event kinds are validated ----------------
test("comment/like/follow/share events are sanitized (text stripped of bidi/control chars, counts clamped)", () => {
  const c = sanitizeEvent(comment("c1", "ani", "hi‮ there\u0000​!"))!;
  assert.equal(c.type, "COMMENT");
  assert.equal(c.text, "hi there!");
  assert.equal(sanitizeEvent({ ...mkEvent("LIKE", "l1"), count: 9e12 })!.count, 1_000_000);
  assert.equal(sanitizeEvent({ ...mkEvent("LIKE", "l2"), count: -5 })!.count, 1);
  assert.ok(sanitizeEvent(mkEvent("FOLLOW", "f1")) && sanitizeEvent(mkEvent("SHARE", "s1")));
  assert.equal(sanitizeEvent({ ...mkEvent("VIEWER_JOIN", "x"), type: "HACK" }), null);
});

// ---------------- rules engine ----------------
test("rules: spam, empty, links, repeated chars, blocklist (leetspeak), per-user rate, duplicate text", () => {
  let t = 1000;
  const r = new RulesEngine({ ...DEFAULT_RULES, blocklist: ["anjing"] }, () => t);
  const act = (id: string, u: string, text: string) => r.evaluate(comment(id, u, text));
  assert.equal(act("1", "a", "   ").action, "filter");
  assert.equal(act("2", "a", "cek www.judi.com").action, "filter");
  assert.equal(act("3", "a", "https://x.y").action, "filter");
  assert.equal(act("4", "a", "aaaaaaaaaaaa").action, "filter");
  assert.equal(act("5", "a", "dasar 4nj1ng").action, "filter", "leetspeak normalized");
  const ok = act("6", "budi", "halo semua");
  assert.equal(ok.action, "show");
  t += 500;
  assert.deepEqual(act("7", "budi", "halo lagi"), { action: "filter", reason: "rate (same user)" });
  t += 3000;
  assert.equal(act("8", "budi", "halo semua").action, "filter", "same text again");
  t += 31_000;
  assert.equal(act("9", "budi", "halo semua").action, "show", "allowed after the window");
});

test("rules: long comments are truncated, never rejected; disabled kinds are filtered; config is validated", () => {
  const r = new RulesEngine({ ...DEFAULT_RULES, commentMaxLen: 20 });
  const d = r.evaluate(comment("t1", "x", "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor"));
  assert.ok(d.action === "show" && d.ev.text!.length <= 20 && d.ev.text!.endsWith("…"));
  r.setConfig(normalizeRules({ likesEnabled: false, followsEnabled: false, commentsEnabled: false }));
  for (const e of [mkEvent("LIKE", "l"), mkEvent("FOLLOW", "f"), comment("c", "u", "hi")]) assert.equal(r.evaluate(e).action, "filter");
  const n = normalizeRules({ commentMaxLen: 99999, likeWindowMs: 1, blocklist: ["  Bad  ", 5, "x".repeat(99)] });
  assert.equal(n.commentMaxLen, 140);
  assert.equal(n.likeWindowMs, 1000);
  assert.deepEqual(n.blocklist.map((w) => w.length <= 40), [true, true]);
});

// ---------------- ambient director ----------------
test("ambient: comments show max 3, extra wait; flood merges into '+N' instead of piling up", () => {
  let t = 0;
  const d = new AmbientDirector({ now: () => t, maxVisible: 3, maxPending: 5 });
  for (let i = 0; i < 20; i++) d.ingest(comment(`c${i}`, `u${i}`, `msg ${i}`));
  const s = d.snapshot();
  assert.equal(s.comments.length, 3);
  assert.ok(s.moreComments > 0 && s.moreComments <= 20, `moreComments=${s.moreComments}`);
  for (let i = 0; i < 10; i++) { t += 20_000; d.tick(t); } // the backlog drains on its own
  assert.equal(d.snapshot().comments.length, 0);
  assert.equal(d.busy, false);
  assert.equal(d.snapshot().totals.comments, 20, "totals count every accepted comment");
});

test("ambient: likes become ONE aggregated pulse per window; follows/shares aggregate into one toast", () => {
  let t = 0;
  const d = new AmbientDirector({ now: () => t, likeWindowMs: 4000 });
  for (let i = 0; i < 50; i++) d.ingest({ ...mkEvent("LIKE", `l${i}`), count: 2 });
  assert.equal(d.snapshot().like, null, "nothing shown before the window closes");
  t += 4000;
  d.tick(t);
  assert.deepEqual([d.snapshot().like?.count, d.snapshot().like?.total], [100, 100]);
  for (const n of ["a", "b", "c", "d"]) d.ingest(mkEvent("FOLLOW", `f${n}`, { username: n }));
  assert.equal(d.snapshot().toast!.text, "@a followed");
  t += 4000;
  d.tick(t); // the three that waited are shown as ONE toast
  assert.equal(d.snapshot().toast!.text, "@b, @c +1 followed");
  assert.equal(d.snapshot().totals.follows, 4);
  assert.ok(d.nextWake() !== null);
});

// ---------------- controller: ambient lane never blocks or reorders the ATM queue ----------------
test("controller: comments/likes/follows/shares are processed automatically, deduped, filtered, and never touch the dispenser queue", async () => {
  const c = new AtmController({ visual: { groupWelcomeAt: 50 }, audio: silent, timing: QUICK });
  c.start();
  c.enqueue(mkEvent("GIFT_LARGE", "g1", { gift: { name: "Lion", count: 1, diamonds: 2000 } }));
  assert.equal(c.enqueue(comment("c1", "ani", "keren bgt")), "accepted");
  assert.equal(c.enqueue(comment("c1", "ani", "keren bgt")), "duplicate");
  assert.equal(c.enqueue(comment("c2", "bob", "https://spam.com")), "filtered");
  assert.equal(c.enqueue({ ...mkEvent("LIKE", "l1"), count: 12 }), "accepted");
  assert.equal(c.enqueue(mkEvent("FOLLOW", "f1", { username: "citra" })), "accepted");
  const s = c.getSnapshot();
  assert.equal(s.ambient.comments[0]?.text, "keren bgt");
  assert.equal(s.waitingTotal, 0, "ambient events are not in the transaction queue");
  assert.deepEqual([s.pipeline.received, s.pipeline.filtered, s.pipeline.ambient], [6, 1, 3]);
  assert.equal(s.ambient.toast?.text, "@citra followed");
  await until(() => c.getSnapshot().processed === 1);
  assert.equal(c.getSnapshot().processed, 1, "the gift completed normally while ambient events were showing");
  c.stop();
});

test("controller: ambient items expire on their own timer and the lane returns to empty (idle)", async () => {
  const c = new AtmController({ audio: silent, timing: QUICK, ambient: { commentMs: 150 } });
  c.start();
  c.enqueue(comment("e1", "ani", "hai"));
  assert.equal(c.getSnapshot().ambient.comments.length, 1);
  await sleep(500); // the controller's own timer expires the comment and publishes
  assert.equal(c.getSnapshot().ambient.comments.length, 0);
  c.stop();
});

test("controller: rules can be changed live (blocklist) and apply to the next comment", () => {
  const c = new AtmController({ audio: silent, timing: QUICK });
  assert.equal(c.enqueue(comment("r1", "u1", "kata terlarang")), "accepted");
  c.setRules({ blocklist: ["terlarang"] });
  assert.equal(c.enqueue(comment("r2", "u2", "kata terlarang lagi")), "filtered");
});

test("burst: 1000 mixed events at once: bounded, nothing crashes, every main-lane event still processed exactly once", async () => {
  const c = new AtmController({ visual: { groupWelcomeAt: 4 }, audio: silent, timing: QUICK });
  c.start();
  let joins = 0;
  for (let i = 0; i < 1000; i++) {
    const k = i % 5;
    if (k === 0 && joins < 40) { c.enqueue(mkEvent("VIEWER_JOIN", `bj${i}`, { username: `v${i}` })); joins++; }
    else if (k === 1) c.enqueue(comment(`bc${i}`, `u${i % 30}`, `m${i}`));
    else if (k === 2) c.enqueue({ ...mkEvent("LIKE", `bl${i}`), count: 3 });
    else if (k === 3) c.enqueue(mkEvent("FOLLOW", `bf${i}`, { username: `f${i}` }));
    else c.enqueue(mkEvent("SHARE", `bs${i}`, { username: `s${i}` }));
  }
  const s = c.getSnapshot();
  assert.ok(s.ambient.comments.length <= 3 && s.waitingTotal <= 100);
  await until(() => c.getSnapshot().processed === joins, 15000);
  assert.equal(c.getSnapshot().processed, joins);
  c.stop();
});

// ---------------- TikTok mapping of the new kinds ----------------
test("tiktok-map: chat → COMMENT, follow/share collapse per viewer, like batches, hostile payloads never throw", () => {
  const user = { userId: "7", uniqueId: "budi_s" };
  const c = mapComment({ user, comment: "  halo\u0000 kak  ", msgId: "m9" }, 5)!;
  assert.deepEqual([c.type, c.text, c.source, c.id], ["COMMENT", "halo kak", "tiktok", "tt:chat:m9"]);
  assert.equal(mapComment({ user, comment: "   " }), null);
  assert.equal(mapFollow({ user }, 1_200_000)!.id, mapFollow({ user }, 1_300_000)!.id);
  assert.notEqual(mapShare({ user }, 0)!.id, mapShare({ user }, 70_000)!.id);
  assert.equal(likeCountOf({ likeCount: 7 }), 7);
  assert.equal(mapLikeBatch(0), null);
  assert.equal(mapLikeBatch(40)!.count, 40);
  for (const bad of [undefined, 1, "x", [], { user: 5 }]) assert.doesNotThrow(() => { mapComment(bad); mapFollow(bad); mapShare(bad); likeCountOf(bad); });
});

// ---------------- message signing ----------------
test("signing: valid signature verifies; tampering, wrong key, stale time and unsigned are all refused", async () => {
  const keys = await generateSigningKeys();
  const other = await generateSigningKeys();
  const priv = await importPrivate(keys.privateKey), pub = await importPublic(keys.publicKey), pubOther = await importPublic(other.publicKey);
  const msg = { v: 1, t: "event", from: "tiktok", event: mkEvent("GIFT_LARGE", "sg1") };
  const signed = await signMessage(msg, priv, 1_000_000);
  assert.equal(await verifyMessage(signed, pub, 1_000_500), "ok");
  assert.equal(await verifyMessage({ ...signed, event: { ...msg.event, username: "evil" } }, pub, 1_000_500), "bad-signature");
  assert.equal(await verifyMessage(signed, pubOther, 1_000_500), "bad-signature");
  assert.equal(await verifyMessage(signed, pub, 1_000_000 + MAX_SKEW_MS + 1), "stale");
  assert.equal(await verifyMessage(msg, pub), "unsigned");
  assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  // signature survives the wire parser
  const wire = parseMessage(JSON.parse(JSON.stringify(signed)))!;
  assert.equal(await verifyMessage(wire as never, pub, 1_000_500), "ok");
});

// ---------------- readiness ----------------
const base: ReadinessInput = { overlayConnected: true, remoteConfigured: true, remoteState: "connected", listenerSeen: true, listenerState: "connected", listenerLastEventAt: 9000, now: 10000, undelivered: 0, secured: true, rejected: 0, watchdogRecoveries: 0 };

test("readiness: every layer judged on its own evidence; simulator-only can never read READY", () => {
  assert.equal(evaluateReadiness(base).overall, "READY");
  const sim = evaluateReadiness({ ...base, listenerSeen: false, listenerState: null });
  assert.notEqual(sim.overall, "READY");
  assert.equal(sim.checks.find((c) => c.id === "source")!.level, "fail");
  assert.equal(evaluateReadiness({ ...base, overlayConnected: false }).overall, "NOT READY");
  assert.equal(evaluateReadiness({ ...base, remoteConfigured: false, remoteState: "disabled" }).overall, "NOT READY");
  assert.equal(evaluateReadiness({ ...base, listenerState: "offline" }).overall, "DEGRADED");
  assert.equal(evaluateReadiness({ ...base, secured: false }).overall, "DEGRADED");
  assert.equal(evaluateReadiness({ ...base, undelivered: 2 }).overall, "DEGRADED");
  assert.equal(evaluateReadiness({ ...base, rejected: 3 }).checks.find((c) => c.id === "security")!.level, "warn");
});

// ---------------- reconnect policy of event sources ----------------
import { backoffMs, sleepAbortable } from "../src/lib/source.ts";
test("source backoff: exponential, capped at 2 min, jittered upper half, never below half the step", () => {
  const lo = (a: number) => backoffMs(a, 5000, () => 0), hi = (a: number) => backoffMs(a, 5000, () => 1);
  assert.equal(lo(1), 5000);
  assert.equal(hi(1), 10_000);
  assert.ok(lo(2) > hi(0) - 1 && lo(3) >= 2 * lo(2) - 1, "grows");
  assert.equal(hi(10), 120_000);
  assert.ok(lo(10) >= 60_000);
  assert.notEqual(backoffMs(3, 5000, () => 0.2), backoffMs(3, 5000, () => 0.8), "jitter spreads reconnect storms");
});
test("sleepAbortable returns immediately when aborted", async () => {
  const ac = new AbortController();
  const t0 = Date.now();
  setTimeout(() => ac.abort(), 20);
  await sleepAbortable(5000, ac.signal);
  assert.ok(Date.now() - t0 < 500);
});
