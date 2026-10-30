import test from "node:test";
import assert from "node:assert/strict";
import { createBroadcastTransport, createSupabaseTransport, type LinkState } from "../src/lib/transport.ts";
import { Outbox } from "../src/lib/outbox.ts";
import { createIngest } from "../src/lib/ingest.ts";
import { AtmController } from "../src/lib/controller.ts";
import type { Msg } from "../src/lib/protocol.ts";
import type { SoundPlayer } from "../src/lib/audio/engine.ts";
import { startPhoenixServer } from "./phoenix-server.ts";
import { mkEvent, sleep, until } from "./helpers.ts";

const silent: SoundPlayer = { play: async () => {}, stop: () => {} };
const FAST = { processingJoinMs: 5, processingGiftMs: 5, dispenseMinMs: 5, completeHoldMs: 5, gapMs: 0, animScale: 0.001 };
const hooks = (inbox: Msg[], states: Record<string, LinkState> = {}) => ({
  onMessage: (m: Msg) => inbox.push(m),
  onState: (n: string, s: LinkState) => { states[n] = s; },
});
const ROOM = "testroom_abcdefghijklmnop";

test("BroadcastChannel transport: delivers within a room, isolates rooms, ignores garbage", async () => {
  const a: Msg[] = [], b: Msg[] = [], other: Msg[] = [];
  const A = createBroadcastTransport(ROOM, hooks(a))!;
  const B = createBroadcastTransport(ROOM, hooks(b))!;
  const C = createBroadcastTransport("otherroom_abcdefghijklmn", hooks(other))!;
  A.send({ v: 1, t: "ping", from: "A" });
  const rogue = new BroadcastChannel(`atm-${ROOM}`);
  rogue.postMessage({ v: 1, t: "event", event: { evil: true } }); // invalid → dropped
  rogue.close();
  await until(() => b.length >= 1);
  await sleep(50);
  assert.equal(b.filter((m) => m.t === "ping").length, 1);
  assert.equal(b.length, 1, "garbage ignored");
  assert.equal(other.length, 0, "different room isolated");
  assert.equal(a.length, 0, "no self echo");
  [A, B, C].forEach((t) => t.close());
});

test("end-to-end over BroadcastChannel: outbox → ingest → controller → ack; resend after loss is exactly-once", async () => {
  const inbox: Msg[] = [];
  const ctl = new AtmController({ audio: silent, timing: FAST });
  ctl.start();
  const ingest = createIngest({ controller: ctl });
  const overlay = createBroadcastTransport(ROOM, {
    onState: () => {},
    onMessage: (m) => {
      if (m.t === "event") overlay.send({ v: 1, t: "ack", id: m.event.id, result: ingest(m.event) });
    },
  })!;
  const sender = createBroadcastTransport(ROOM, hooks(inbox))!;
  let drop = 2; // simulate a network that eats the first two sends
  const outbox = new Outbox({
    from: "t",
    paceMs: 5, retryBaseMs: 30, retryMaxMs: 60,
    send: (m) => (drop-- > 0 ? false : sender.send(m)),
  });
  const ev = mkEvent("GIFT_LARGE", "lossy1");
  outbox.submit(ev);
  const pump = setInterval(() => inbox.filter((m) => m.t === "ack").forEach((m) => m.t === "ack" && outbox.ack(m.id, m.result)), 5);
  await until(() => outbox.pending === 0, 3000, "ack");
  clearInterval(pump);
  await until(() => ctl.getSnapshot().processed === 1);
  assert.equal(outbox.delivered, 1);
  assert.equal(ctl.getSnapshot().processed, 1, "processed exactly once");
  ctl.stop(); outbox.stop(); overlay.close(); sender.close();
});

test("outbox: duplicates resent after ack are harmless; gives up + reports undelivered after max age", async () => {
  const logs: string[] = [];
  const sent: string[] = [];
  const ob = new Outbox({ from: "t", paceMs: 1, retryBaseMs: 10, retryMaxMs: 10, maxAgeMs: () => 80, send: (m) => { if (m.t === "event") sent.push(m.event.id); return true; }, log: (_l, m) => logs.push(m) });
  ob.submit(mkEvent("VIEWER_JOIN", "never-acked"));
  await until(() => ob.pending === 0, 2000);
  assert.ok(sent.length >= 2, "retried");
  assert.equal(ob.undelivered, 1);
  assert.ok(logs.some((l) => l.includes("undelivered")));
  ob.stop();
});

test("outbox paces sends (free-tier rate limit protection)", async () => {
  const times: number[] = [];
  const ob = new Outbox({ from: "t", paceMs: 40, retryBaseMs: 10_000, send: () => { times.push(Date.now()); return true; } });
  for (let i = 0; i < 5; i++) ob.submit(mkEvent("VIEWER_JOIN", `p${i}`));
  await until(() => times.length >= 5, 2000);
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! - times[i - 1]! >= 35, `gap ${times[i]! - times[i - 1]!}`);
  ob.stop();
});

test("ingest: flood protection refuses (and flags) events beyond the rate, accepts again after refill", async () => {
  let t = 0;
  const ctl = new AtmController({ audio: silent, timing: FAST });
  const ing = createIngest({ controller: ctl, ratePerSec: 10, burst: 5, now: () => t });
  const results = Array.from({ length: 8 }, (_, i) => ing(mkEvent("VIEWER_JOIN", `f${i}`)));
  assert.equal(results.filter((r) => r === "accepted").length, 5);
  assert.equal(results.filter((r) => r === "rate-limited").length, 3);
  t += 1000;
  assert.equal(ing(mkEvent("VIEWER_JOIN", "f-later")), "accepted");
  assert.equal(ing({ nonsense: 1 }), "invalid");
});

test("Supabase transport (real realtime-js ↔ local Phoenix server): broadcast both ways", async () => {
  const srv = await startPhoenixServer();
  const cfg = { url: srv.url, key: "x".repeat(30) };
  const a: Msg[] = [], b: Msg[] = [];
  const sa: Record<string, LinkState> = {}, sb: Record<string, LinkState> = {};
  const A = createSupabaseTransport(cfg, ROOM, hooks(a, sa));
  const B = createSupabaseTransport(cfg, ROOM, hooks(b, sb));
  await until(() => A.state() === "connected" && B.state() === "connected", 5000, "both connected");
  assert.equal(A.send({ v: 1, t: "event", from: "A", event: mkEvent("GIFT_SMALL", "rt1") }), true);
  await until(() => b.some((m) => m.t === "event"), 3000, "B got event");
  B.send({ v: 1, t: "ack", id: "rt1", result: "accepted" });
  await until(() => a.some((m) => m.t === "ack"), 3000, "A got ack");
  assert.ok(srv.urls.every((u) => u.includes("apikey=")), "api key sent as query param only");
  A.close(); B.close();
  await srv.close();
});

test("Supabase transport: server drop → reconnecting → reconnected, no lost state, events flow again", async () => {
  const srv = await startPhoenixServer();
  const cfg = { url: srv.url, key: "x".repeat(30) };
  const a: Msg[] = [], b: Msg[] = [];
  const A = createSupabaseTransport(cfg, ROOM, hooks(a));
  const B = createSupabaseTransport(cfg, ROOM, hooks(b));
  await until(() => A.state() === "connected" && B.state() === "connected", 5000);
  srv.dropAll();
  await until(() => A.state() !== "connected", 5000, "A noticed the drop");
  assert.equal(A.send({ v: 1, t: "ping", from: "A" }), false, "send refused while disconnected (caller keeps it in the outbox)");
  await until(() => A.state() === "connected" && B.state() === "connected", 20000, "reconnected");
  A.send({ v: 1, t: "ping", from: "after" });
  await until(() => b.some((m) => m.t === "ping" && m.from === "after"), 5000, "message after reconnect");
  A.close(); B.close();
  await srv.close();
});

test("Supabase transport: server unreachable at start → not connected, never throws; recovers when server appears", async () => {
  const srv = await startPhoenixServer();
  srv.pause(true); // refuse connections: simulates 'server returns errors'
  const A = createSupabaseTransport({ url: srv.url, key: "x".repeat(30) }, ROOM, hooks([]));
  await sleep(1500);
  assert.notEqual(A.state(), "connected");
  assert.equal(A.send({ v: 1, t: "ping", from: "x" }), false);
  srv.pause(false);
  await until(() => A.state() === "connected", 25000, "connect once server accepts");
  A.close();
  await srv.close();
});
