import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VISUAL, displayName, groupWelcomeText, hashSeed, levelOf, normalizeVisual, welcomeText } from "../src/lib/levels.ts";
import { planDispense } from "../src/lib/dispense.ts";
import { profileFor } from "../src/lib/profile.ts";
import type { GiftLevel } from "../src/lib/levels.ts";
import { mkEvent } from "./helpers.ts";

const ev = (diamonds: number | undefined, type: "GIFT_SMALL" | "GIFT_LARGE" = "GIFT_SMALL") => ({ type, gift: diamonds === undefined ? undefined : { name: "x", count: 1, diamonds } });
const LEVELS: GiftLevel[] = [0, 1, 2, 3, 4];
const T = { processingJoinMs: 1400, processingGiftMs: 1900, dispenseMinMs: 2300, completeHoldMs: 1800, animScale: 1 };

test("gift level hierarchy from the existing event (diamond value, configurable thresholds)", () => {
  const v = DEFAULT_VISUAL;
  assert.equal(levelOf({ type: "VIEWER_JOIN" }, v), 0);
  assert.deepEqual([1, 29, 30, 999, 1000, 9999, 10000].map((d) => levelOf(ev(d, d >= 1000 ? "GIFT_LARGE" : "GIFT_SMALL"), v)), [1, 1, 2, 2, 3, 3, 4]);
  assert.equal(levelOf(ev(50), { ...v, giftMediumDiamonds: 100 }), 1);
  assert.equal(levelOf(ev(undefined), v), 1);
  assert.equal(levelOf(ev(undefined, "GIFT_LARGE"), v), 3);
});

test("visual settings validated; thresholds ascending; junk ignored; theme/intensity no longer exist", () => {
  const n = normalizeVisual({ theme: "reactor", welcomeMs: 1, giftMediumDiamonds: 500, giftBigDiamonds: 10, giftSpecialDiamonds: 5, idleEnabled: "yes", backdrop: "x" });
  assert.equal(n.welcomeMs, 2000);
  assert.ok(n.giftMediumDiamonds < n.giftBigDiamonds && n.giftBigDiamonds < n.giftSpecialDiamonds);
  assert.equal(n.idleEnabled, true);
  assert.equal(n.backdrop, "transparent");
  assert.ok(!("theme" in n));
  assert.equal(normalizeVisual({ backdrop: "night" }).backdrop, "night");
});

test("names: safe fallback; welcome phrases use the real username; group text keeps names", () => {
  assert.equal(displayName("  "), "guest");
  assert.ok(welcomeText("budi", 0).includes("@budi"));
  assert.notEqual(welcomeText("budi", 0), welcomeText("budi", 1));
  assert.equal(hashSeed("abc"), hashSeed("abc"));
  const g = groupWelcomeText(["a", "b", "c", "d", "e"], 3);
  assert.ok(g.includes("@a") && g.includes("@c") && g.includes("+2 more"));
});

test("ATM dispense plan per level: 1 note · 3–6 · 10 fan · bundle of 10 · double bundle", () => {
  const n = LEVELS.map((l) => planDispense(mkEvent("GIFT_SMALL"), l));
  assert.equal(n[0]!.notes.length, 1);
  assert.ok(n[1]!.notes.length >= 3 && n[1]!.notes.length <= 6);
  assert.equal(n[2]!.notes.length, 10);
  assert.equal(n[3]!.kind, "bundle");
  assert.equal(n[4]!.kind, "double");
  assert.ok(n[0]!.total < n[1]!.total && n[1]!.total < n[3]!.total && n[3]!.total < n[4]!.total);
});

test("profile: durations never shrink with level; welcome setting stretches only the join hold", () => {
  const tot = LEVELS.map((l) => { const p = profileFor(l, planDispense(mkEvent("GIFT_SMALL"), l), T, 0); return p.processingMs + p.mainMs + p.holdMs; });
  for (let i = 1; i < 5; i++) assert.ok(tot[i]! >= tot[i - 1]!);
  const join = planDispense(mkEvent("VIEWER_JOIN"), 0);
  const a = profileFor(0, join, T, 9000);
  assert.equal(a.processingMs + a.mainMs + a.holdMs, 9000);
  const g = profileFor(3, planDispense(mkEvent("GIFT_LARGE"), 3), T, 9000);
  assert.ok(g.processingMs + g.mainMs + g.holdMs < 9000);
});
