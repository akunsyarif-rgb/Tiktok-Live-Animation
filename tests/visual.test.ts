import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VISUAL, displayName, groupWelcomeText, hashSeed, levelOf, normalizeVisual, welcomeText } from "../src/lib/levels.ts";
import { planDispense } from "../src/lib/dispense.ts";
import { MARBLE_MS, REACTOR_MS, profileFor, soundMs } from "../src/lib/profile.ts";
import { AUDIO_MANIFEST } from "../src/lib/audio/manifest.ts";
import { ARCS, PEAK, REACTOR_LOOP_S, idleFrame, reactorFrame } from "../src/visual/reactor-curve.ts";
import { buildTimeTable, finaleAmount, indexAt, txRuns } from "../src/visual/marble-plan.ts";
import type { VisualState } from "../src/visual/types.ts";
import type { GiftLevel } from "../src/lib/levels.ts";
import { mkEvent } from "./helpers.ts";

const ev = (diamonds: number | undefined, type: "GIFT_SMALL" | "GIFT_LARGE" = "GIFT_SMALL") => ({ type, gift: diamonds === undefined ? undefined : { name: "x", count: 1, diamonds } });
const LEVELS: GiftLevel[] = [0, 1, 2, 3, 4];
const T = { processingJoinMs: 1400, processingGiftMs: 1900, dispenseMinMs: 2300, completeHoldMs: 1800, animScale: 1 };

test("gift level hierarchy from the existing event (diamond value, configurable thresholds)", () => {
  const v = DEFAULT_VISUAL;
  assert.equal(levelOf({ type: "VIEWER_JOIN" }, v), 0);
  assert.equal(levelOf(ev(1), v), 1);
  assert.equal(levelOf(ev(29), v), 1);
  assert.equal(levelOf(ev(30), v), 2);
  assert.equal(levelOf(ev(999), v), 2);
  assert.equal(levelOf(ev(1000, "GIFT_LARGE"), v), 3);
  assert.equal(levelOf(ev(9999, "GIFT_LARGE"), v), 3);
  assert.equal(levelOf(ev(10000, "GIFT_LARGE"), v), 4);
  // thresholds are settings, not constants
  assert.equal(levelOf(ev(50), { ...v, giftMediumDiamonds: 100 }), 1);
  assert.equal(levelOf(ev(5000, "GIFT_LARGE"), { ...v, giftSpecialDiamonds: 5000 }), 4);
  // gift without a known value falls back to the existing event type
  assert.equal(levelOf(ev(undefined), v), 1);
  assert.equal(levelOf(ev(undefined, "GIFT_LARGE"), v), 3);
});

test("visual settings are validated; thresholds forced ascending; junk ignored", () => {
  const n = normalizeVisual({ theme: "evil", welcomeMs: 1, intensity: 99, giftMediumDiamonds: 500, giftBigDiamonds: 10, giftSpecialDiamonds: 5, idleEnabled: "yes" });
  assert.equal(n.theme, "atm");
  assert.equal(n.welcomeMs, 2000);
  assert.equal(n.intensity, 1.5);
  assert.ok(n.giftMediumDiamonds < n.giftBigDiamonds && n.giftBigDiamonds < n.giftSpecialDiamonds);
  assert.equal(n.idleEnabled, true);
  assert.deepEqual(normalizeVisual(undefined), DEFAULT_VISUAL);
});

test("names: safe fallback, welcome phrases use the real username, group text keeps names", () => {
  assert.equal(displayName("  "), "guest");
  assert.equal(displayName(undefined), "guest");
  assert.ok(welcomeText("budi", 0).includes("@budi"));
  assert.notEqual(welcomeText("budi", 0), welcomeText("budi", 1));
  assert.equal(hashSeed("abc"), hashSeed("abc"));
  const g = groupWelcomeText(["a", "b", "c", "d", "e"], 3);
  assert.ok(g.includes("@a") && g.includes("@c") && g.includes("+2 more"));
});

test("ATM dispense plan per level: 1 note · 3–6 · 10 fan · bundle of 10 · double bundle", () => {
  const e = mkEvent("GIFT_SMALL");
  const n = LEVELS.map((l) => planDispense(e, l));
  assert.equal(n[0]!.notes.length, 1);
  assert.ok(n[1]!.notes.length >= 3 && n[1]!.notes.length <= 6);
  assert.equal(n[2]!.notes.length, 10);
  assert.equal(n[2]!.extraMech, true);
  assert.equal(n[3]!.kind, "bundle");
  assert.equal(n[3]!.notes.length, 10);
  assert.equal(n[4]!.kind, "double");
  assert.equal(n[4]!.total, 2_000_000);
  assert.ok(n[0]!.total < n[1]!.total && n[1]!.total < n[3]!.total && n[3]!.total < n[4]!.total);
});

test("profile: a join never shows a gift-sized show; durations grow with level in every theme", () => {
  for (const theme of ["atm", "reactor", "marble"] as const) {
    const totals = LEVELS.map((l) => {
      const p = profileFor(theme, l, planDispense(mkEvent("GIFT_SMALL"), l), T, 0);
      return p.processingMs + p.mainMs + p.holdMs;
    });
    for (let i = 1; i < 5; i++) assert.ok(totals[i]! >= totals[i - 1]!, `${theme} L${i} (${totals[i]}) >= L${i - 1} (${totals[i - 1]})`);
    assert.ok(totals[0]! < totals[3]!, `${theme}: join is shorter than a big gift`);
    // ATM keeps its original one-note join (≈5.5 s) on purpose; the new themes must be clearly lighter
    if (theme !== "atm") assert.ok(totals[0]! < totals[3]! * 0.6, `${theme}: join is clearly smaller than a big gift`);
  }
});

test("profile: welcome duration setting stretches only the join hold", () => {
  const plan = planDispense(mkEvent("VIEWER_JOIN"), 0);
  const a = profileFor("reactor", 0, plan, T, 4000);
  const b = profileFor("reactor", 0, plan, T, 9000);
  assert.equal(a.processingMs + a.mainMs + a.holdMs, 4000);
  assert.equal(b.processingMs + b.mainMs + b.holdMs, 9000);
  const g = profileFor("reactor", 3, planDispense(mkEvent("GIFT_LARGE"), 3), T, 9000);
  assert.equal(g.processingMs, REACTOR_MS[3][0]);
});

test("every sound in every profile exists in the manifest and fits its stage (reactor/marble tables are not silently stretched)", () => {
  for (const [name, table] of [["reactor", REACTOR_MS], ["marble", MARBLE_MS]] as const) {
    for (const l of LEVELS) {
      const p = profileFor(name, l, planDispense(mkEvent("GIFT_SMALL"), l), T, 0);
      [...p.proc, ...p.main, ...(p.success ? [p.success] : [])].forEach((q) => assert.ok(AUDIO_MANIFEST[q.id], `${name} L${l}: ${q.id} in manifest`));
      assert.ok(soundMs(p.proc) <= table[l][0] + 1, `${name} L${l} processing sound ${soundMs(p.proc)} <= stage ${table[l][0]}`);
      assert.ok(soundMs(p.main) <= table[l][1] + 1, `${name} L${l} main sound ${soundMs(p.main)} <= stage ${table[l][1]}`);
    }
  }
});

// ---------- Energy Reactor curve (pure) ----------
const st = (level: GiftLevel, txMs: number, over: Partial<VisualState> = {}): VisualState => {
  const [a, b, h] = REACTOR_MS[level];
  return { theme: "reactor", phase: "processing", level, active: txMs >= 0, txMs: Math.max(0, txMs), timeline: { processingMs: a, mainMs: b, holdMs: h }, seed: 1, intensity: 1, idleEnabled: true, ...over };
};
const idleState = (): VisualState => ({ ...st(0, 0), active: false, txMs: 0, phase: "standby" });

test("reactor idle loop is seamless: f(t) == f(t + 24 s) for every channel", () => {
  for (let t = 0; t < REACTOR_LOOP_S; t += 0.37) {
    const a = idleFrame(t), b = idleFrame(t + REACTOR_LOOP_S);
    assert.ok(Math.abs(a.charge - b.charge) < 1e-9 && Math.abs(a.pulse - b.pulse) < 1e-9 && a.lamp === b.lamp, `t=${t}`);
  }
  // not monotonous: the idle core actually moves and has distinct pulse moments
  const charges = Array.from({ length: 60 }, (_, i) => idleFrame(i * 0.4).charge);
  assert.ok(Math.max(...charges) - Math.min(...charges) > 0.05);
  assert.ok(Array.from({ length: 240 }, (_, i) => idleFrame(i * 0.1).pulse).some((p) => p > 0.9));
});

test("reactor curve is deterministic and stays idle-level when inactive", () => {
  assert.deepEqual(reactorFrame(st(2, 1500), 5), reactorFrame(st(2, 1500), 5));
  const f = reactorFrame(idleState(), 7);
  assert.equal(f.release, 0);
  assert.equal(f.shocks.length, 0);
  assert.equal(f.drive, 0);
});

test("reactor: charge → release → settle; higher levels peak higher; special has a double shockwave; returns to idle", () => {
  const peaks = LEVELS.map((l) => {
    const [a, b, h] = REACTOR_MS[l];
    let max = 0;
    for (let ms = 0; ms <= a + b + h; ms += 25) max = Math.max(max, reactorFrame(st(l, ms), 3).charge);
    return max;
  });
  for (let i = 1; i < 5; i++) assert.ok(peaks[i]! > peaks[i - 1]!, `peak L${i} ${peaks[i]} > L${i - 1} ${peaks[i - 1]}`);
  assert.ok(peaks[4]! > 1.15 && peaks[0]! < 0.5);
  assert.equal(reactorFrame(st(3, REACTOR_MS[3][0] + 500), 1).shocks.length, 1);
  assert.equal(reactorFrame(st(4, REACTOR_MS[4][0] + REACTOR_MS[4][1] * 0.8), 1).shocks.length, 2);
  for (const l of LEVELS) {
    const total = REACTOR_MS[l][0] + REACTOR_MS[l][1] + REACTOR_MS[l][2];
    const end = reactorFrame(st(l, total), 3);
    assert.ok(Math.abs(end.charge - idleFrame(3).charge) < 0.02, `L${l} settles to idle`);
    assert.ok(end.release < 0.02 && end.hot < 0.02);
  }
  assert.ok(ARCS[0] === 0 && ARCS[4] > ARCS[2] && PEAK[4] > PEAK[3]);
});

test("reactor curve has no jumps at stage boundaries (smooth hand-over from idle and between stages)", () => {
  for (const l of LEVELS) {
    const [a, b] = REACTOR_MS[l];
    let prev = reactorFrame(st(l, 0), 3).charge;
    assert.ok(Math.abs(prev - idleFrame(3).charge) < 0.02, "starts at idle level");
    for (let ms = 10; ms <= a + b + REACTOR_MS[l][2]; ms += 10) {
      const c = reactorFrame(st(l, ms), 3).charge;
      assert.ok(Math.abs(c - prev) < 0.06, `L${l} jump ${Math.abs(c - prev).toFixed(3)} at ${ms} ms`);
      prev = c;
    }
  }
});

// ---------- Marble plan (pure) ----------
test("marble launches per level: 1 short · 1 special ball · 4 · 10 chain · gold + 12 + finale ball; deterministic", () => {
  const counts = LEVELS.map((l) => txRuns(l, 5, MARBLE_MS[l][0], MARBLE_MS[l][1]).length);
  assert.deepEqual(counts, [1, 1, 4, 10, 14]);
  assert.equal(txRuns(0, 5, 900, 3600)[0]!.route, "short");
  assert.ok(txRuns(4, 5, 2000, 11000).some((r) => r.route === "special" && r.kind === "gold"));
  assert.deepEqual(txRuns(3, 77, 1500, 8200), txRuns(3, 77, 1500, 8200));
  for (const l of LEVELS) {
    const r = txRuns(l, 3, MARBLE_MS[l][0], MARBLE_MS[l][1]);
    const sorted = [...r].sort((x, y) => x.at - y.at);
    assert.deepEqual(r.map((x) => x.key), sorted.map((x) => x.key), "launch order is chronological");
    assert.ok(new Set(r.map((x) => x.key)).size === r.length, "unique keys");
  }
});

test("marble finale: only special, rises 0→1 in the last third of the main stage", () => {
  assert.equal(finaleAmount(3, 9999, 1500, 8200), 0);
  assert.equal(finaleAmount(4, 100, 2000, 11000), 0);
  assert.equal(finaleAmount(4, 2000 + 11000 * 0.68, 2000, 11000), 0);
  assert.equal(finaleAmount(4, 2000 + 11000, 2000, 11000), 1);
  const mid = finaleAmount(4, 2000 + 11000 * 0.83, 2000, 11000);
  assert.ok(mid > 0.3 && mid < 0.7);
});

test("marble motion table: monotone time, deterministic position lookup, steeper = faster", () => {
  const n = 200;
  const ys = Array.from({ length: n }, (_, i) => 3 - (i / n) * 6);
  const ds = Array.from({ length: n - 1 }, () => 0.15);
  const tt = buildTimeTable(ys, ds);
  for (let i = 1; i < n; i++) assert.ok(tt.t[i]! > tt.t[i - 1]!);
  assert.equal(indexAt(tt, -1), 0);
  assert.equal(indexAt(tt, tt.total + 5), n - 1);
  const mid = indexAt(tt, tt.total / 2);
  assert.ok(mid > 0 && mid < n - 1);
  assert.equal(indexAt(tt, 1.234), indexAt(tt, 1.234));
  // later samples are covered faster than early ones (acceleration)
  assert.ok(tt.t[50]! - tt.t[0]! > tt.t[199]! - tt.t[149]!);
  const flat = buildTimeTable(Array(n).fill(0), ds);
  assert.ok(Number.isFinite(flat.total) && flat.total > 0, "flat ramp still rolls (speed floor)");
});
