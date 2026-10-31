import test from "node:test";
import assert from "node:assert/strict";
import { parseMessage, parseSettings } from "../src/lib/protocol.ts";
import { safeAvatarUrl, sanitizeEvent } from "../src/lib/events.ts";
import { mkEvent } from "./helpers.ts";

test("parseMessage accepts a valid event and normalizes it", () => {
  const m = parseMessage({ v: 1, t: "event", from: "tiktok", event: mkEvent("GIFT_SMALL", "ok1") });
  assert.equal(m?.t, "event");
});

test("parseMessage rejects wrong version, unknown type, non-objects, oversize", () => {
  assert.equal(parseMessage({ v: 2, t: "clear" }), null);
  assert.equal(parseMessage({ v: 1, t: "boom" }), null);
  assert.equal(parseMessage("string"), null);
  assert.equal(parseMessage(null), null);
});

test("oversize payloads (>16k chars) are refused", () => {
  const huge = { v: 1, t: "listener", status: { state: "idle", target: "x", detail: "d".repeat(30_000), sent: 0, undelivered: 0, lastEventAt: null, attempts: 0 } };
  assert.equal(parseMessage(huge), null);
});

test("event with bad id / type / empty name is refused", () => {
  assert.equal(sanitizeEvent({ ...mkEvent("VIEWER_JOIN"), id: "a b" }), null);
  assert.equal(sanitizeEvent({ ...mkEvent("VIEWER_JOIN"), id: "x".repeat(101) }), null);
  assert.equal(sanitizeEvent({ ...mkEvent("VIEWER_JOIN"), type: "HACK" }), null);
  assert.equal(sanitizeEvent({ ...mkEvent("VIEWER_JOIN"), username: "   " })?.username, "guest", "empty name → safe fallback, event is NOT dropped");
  assert.equal(sanitizeEvent({ ...mkEvent("VIEWER_JOIN"), username: 42 }), null);
});

test("gift fields are clamped; remote events cannot claim to be non-simulator unless 'tiktok'", () => {
  const e = sanitizeEvent({ ...mkEvent("GIFT_LARGE", "g"), gift: { name: "Z".repeat(500), count: 1e12, diamonds: -5 }, source: "hacker" })!;
  assert.ok(e.gift!.name.length <= 40);
  assert.equal(e.gift!.count, 99999);
  assert.equal(e.gift!.diamonds, 0);
  assert.equal(e.source, "simulator");
});

test("avatar URL: only https or same-origin path", () => {
  assert.equal(safeAvatarUrl("javascript:alert(1)"), null);
  assert.equal(safeAvatarUrl("data:image/png;base64,AAAA"), null);
  assert.equal(safeAvatarUrl("http://x/y.png"), null);
  assert.equal(safeAvatarUrl("//evil.example/x.png"), null);
  assert.equal(safeAvatarUrl("https://p16.example.com/a.jpg"), "https://p16.example.com/a.jpg");
  assert.equal(safeAvatarUrl("/avatars/a.png"), "/avatars/a.png");
});

test("settings are clamped to safe ranges", () => {
  const s = parseSettings({ mode: "hybrid", hybridGiftBurst: 9999, hybridMaxJoinWaitMs: 1, volume: 7, muted: true })!;
  assert.equal(s.hybridGiftBurst, 20);
  assert.equal(s.hybridMaxJoinWaitMs, 3000);
  assert.equal(s.volume, 1);
  assert.equal(parseSettings({ mode: "evil", hybridGiftBurst: 1, hybridMaxJoinWaitMs: 5000, volume: 1 }), null);
});
