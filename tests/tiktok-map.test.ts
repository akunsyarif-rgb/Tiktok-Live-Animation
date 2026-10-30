import test from "node:test";
import assert from "node:assert/strict";
import { mapGift, mapMember } from "../src/lib/tiktok-map.ts";
import { sanitizeEvent } from "../src/lib/events.ts";

// Sample payload SHAPES (from the library docs). Real payloads are PENDING EXTERNAL VALIDATION.
const user = { userId: "123", uniqueId: "budi_s", nickname: "Budi", profilePicture: { url: "https://p16.example.com/a.jpg" } };

test("member → VIEWER_JOIN tagged source tiktok; same viewer within a minute → same id", () => {
  const a = mapMember({ user }, 1_020_000)!;
  const b = mapMember({ user }, 1_050_000)!;
  const c = mapMember({ user }, 1_020_000 + 61_000)!;
  assert.equal(a.type, "VIEWER_JOIN");
  assert.equal(a.source, "tiktok");
  assert.equal(a.username, "budi_s");
  assert.equal(a.avatarUrl, "https://p16.example.com/a.jpg");
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.ok(sanitizeEvent(a));
});

test("member without user info is ignored; non-https avatar dropped", () => {
  assert.equal(mapMember({}, 1), null);
  assert.equal(mapMember(null, 1), null);
  assert.equal(mapMember({ user: { ...user, profilePicture: { url: "http://x/y.png" } } }, 1)!.avatarUrl, null);
});

test("gift: diamond value decides small vs large (threshold configurable)", () => {
  const small = mapGift({ user, msgId: "m1", giftId: 5655, repeatCount: 1, repeatEnd: true, giftDetails: { giftType: 1, giftName: "Rose", diamondCount: 1 } })!;
  assert.equal(small.type, "GIFT_SMALL");
  assert.equal(small.gift!.name, "Rose");
  const large = mapGift({ user, msgId: "m2", giftId: 1, repeatCount: 1, giftDetails: { giftType: 2, giftName: "Lion", diamondCount: 29999 } })!;
  assert.equal(large.type, "GIFT_LARGE");
  const stacked = mapGift({ user, msgId: "m3", repeatCount: 100, repeatEnd: true, giftDetails: { giftType: 1, giftName: "Rose", diamondCount: 10 } })!;
  assert.equal(stacked.type, "GIFT_LARGE"); // 100 × 10 = 1000 diamonds
  assert.equal(mapGift({ user, msgId: "m4", repeatCount: 1, giftDetails: { diamondCount: 500 } }, { largeDiamonds: 400 })!.type, "GIFT_LARGE");
});

test("gift streak in progress is NOT paid; only the final streak event is", () => {
  const base = { user, giftId: 1, giftDetails: { giftType: 1, giftName: "Rose", diamondCount: 1 } };
  assert.equal(mapGift({ ...base, msgId: "s1", repeatCount: 3, repeatEnd: false }), null);
  assert.ok(mapGift({ ...base, msgId: "s2", repeatCount: 5, repeatEnd: true }));
});

test("gift id: stable from msgId; unique fallback when absent (two real gifts never collapse)", () => {
  const p = { user, giftId: 9, repeatCount: 1, giftDetails: { giftType: 2, giftName: "X", diamondCount: 1 } };
  assert.equal(mapGift({ ...p, msgId: "same" })!.id, mapGift({ ...p, msgId: "same" })!.id);
  assert.notEqual(mapGift(p, { now: 5 })!.id, mapGift(p, { now: 5 })!.id);
});

test("hostile / malformed payloads never throw", () => {
  for (const bad of [undefined, 1, "x", [], { user: 5 }, { user: { uniqueId: {} } }, { giftDetails: "x", user }]) {
    assert.doesNotThrow(() => { mapGift(bad); mapMember(bad); });
  }
});
