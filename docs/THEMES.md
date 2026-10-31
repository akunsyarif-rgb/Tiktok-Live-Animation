# Themes: ATM Machine · Energy Reactor · Kinetic Marble Machine

One event engine, one queue, one protocol. The theme is only *how the current transaction is drawn*.

```
TikTok listener / simulator ──► protocol (unchanged) ──► ingest ──► ONE EventQueue ──► ONE AtmController
                                                                                         │ snapshot: phase, level, current,
                                                                                         │ group names, recent, timeline, visual settings
                                       ┌─────────────────────────────────────────────────┴───────────────┐
                                       ▼                         ▼                                       ▼
                                  ATM (DOM/SVG)           Energy Reactor (three.js)            Marble Machine (three.js)
                                  idle: LEDs, self-test   idle: breathing core, rings          idle: gears turn, marbles roll
```

## Using it
`/control` → **Theme & visuals**. The choice is stored in the controller's settings, sent to the overlay (same protocol message `settings`, new optional `visual` field → older senders still work), and remembered in the overlay's `localStorage` (a reload keeps the theme). `?theme=reactor|marble|atm` on the overlay URL forces a theme (testing).

| Setting | Meaning |
|---|---|
| Theme | ATM Machine / Energy Reactor / Kinetic Marble Machine. Switching never drops events: the running transaction finishes as planned, the next one uses the new theme |
| Idle / attract animation | on = always-moving scene; off = static pose (the 3D loop drops to ~4 fps, no idle motion) |
| Welcome (s) | minimum time a viewer-join welcome stays visible (2–12 s). Never shorter than the animation itself |
| Gift thresholds | diamonds at which a gift becomes **Medium / Big / Special** (Small = below Medium). Defaults 30 / 1000 / 10000 |
| Intensity | 50–150 %: particles, glow, arcs, motion amplitude (not timing) |
| Recent visitors | show the last visitors in the theme (HUD list / ATM idle screen) |
| Volume / Mute | in *Audio*; applies to all themes and the overlay |

## Levels (no new backend event type)
Level is derived from the **existing** event: join → 0; gift with `gift.diamonds > 0` → by thresholds; gift without a value → by type (`GIFT_SMALL` 1, `GIFT_LARGE` 3). `diamonds` is the **total** value (unit × count), same as the TikTok listener sends.

| Level | ATM | Reactor | Marble |
|---|---|---|---|
| 0 Join | name on screen, LED confirm, 1 virtual note | small spark, core answers once, name in HUD | 1 marble on the short track, bell, name in HUD |
| 1 Small | 3–6 notes | small energy wave into the core | 1 special (brass) marble on the full track |
| 2 Medium | 10 notes fan, LEDs run fast | extra rings driven, higher energy, arcs | 4 marbles in sequence, more mechanisms |
| 3 Big | strapped bundle of 10 | full charge → release shockwave | 10-marble chain reaction, all mechanisms |
| 4 Special | 2 bundles, "SPECIAL TRANSACTION" screen, dispenser sounds | all 5 rings, white-hot overcharge, double shockwave | back (gold) special track + marbles + finale (bells, sparks, gears at full speed) |

Rarity: a second **Special** within 60 s is shown as **Big** (setting `specialCooldownMs`, default 60 s), so the grand effect cannot spam.

## Welcome
- Real username from the event; empty name → `guest` (never dropped). Phrases rotate deterministically: "Welcome, @name" · "Glad you’re here, @name" · "A new visitor has arrived: @name".
- Names enter *Recent visitors* the moment the event is accepted (even while queued). A gift never erases a name: gifters are added too.
- **Grouped welcome:** when ≥ 4 joins are waiting (setting `groupWelcomeAt`), up to 8 are welcomed together ("Welcome, @a, @b, @c +5 more"). Every name is kept: they are folded into one transaction, persisted, restored after reload, counted once each. Gifts are never folded.
- Joins are small by design: reactor/marble joins run ~4 s total vs ~7–15 s for gifts.

## Idle / attract (separate from the queue)
Each renderer runs its own loop; the queue only supplies the *current transaction*. When a transaction starts, the scene blends from idle values to the transaction curve (no hard cut) and settles back during the "complete" stage.
- **ATM:** LED strip chases, screen cycles *welcome → self-test → cassette levels → recent visitors* (16 s loop), cash door twitch every 12 s.
- **Reactor:** 24 s seamless loop: breathing core (6 s), energy pulse at 3 s and 15 s, ring revolutions are integers per loop, warning lamp every 8 s, slow camera sway.
- **Marble:** 24 s loop: gears at integer revolutions, one steel marble at 2 s and one brass marble at 13.5 s travel the whole track (bells ring as they pass), pendulum sway.

## Technical
- three.js `0.186.1` (pinned), plain WebGL, procedural geometry, **no R3F / Rapier / postprocessing / external shader framework**, no physics. Chunk is loaded only when a 3D theme is selected (ATM-only use downloads none of it).
- Motion is a pure function of time: `reactorFrame(state, t)` (`src/visual/reactor-curve.ts`), marble launches `txRuns(...)` + energy-conservation timing table (`marble-plan.ts`). Unit-tested for seamless loop, determinism, continuity.
- Environment light = three's procedural `RoomEnvironment`; textures generated on a canvas. **No network request at runtime** (verified by E2E: no third-party host; sounds are local WAV).
- One `requestAnimationFrame` loop in `ThreeHost`: fps cap 30 (`?fps=60` to unlock), DPR ≤ 1.5 × stage scale, adaptive downgrade (resolution → effects), pauses when the tab is hidden and resumes without catch-up, handles `webglcontextlost/restored`, disposes geometry/materials/textures/renderer and force-loses the context on unmount.
- WebGL missing / init error / ≥ 3 context losses in 60 s → DOM/CSS fallback (`FallbackStage`) with the same HUD.
- Names are DOM text (system font stack, no web font). Canvas is `alpha:true`, clear colour alpha 0.
- Effect sounds (bells, clacks, arcs) are scene cues → `AudioEngine.playSfx`: max 4 simultaneous voices (oldest stolen); main sounds stay sequential.

## Debug monitor
`/overlay?...&debug=1` (never on by default): active theme, level, FPS, quality, DPR, WebGL status, draw calls, triangles, geometries, textures, queue, phase, audio, link, log.

## Files
`src/lib/levels.ts` (levels, settings, welcome text) · `profile.ts` (stage lengths + sounds per theme/level) · `dispense.ts` (ATM plan) · `controller.ts` (queue runner, groups, recent, special cooldown) · `src/visual/*` (host, reactor, marble, pure curves, materials, WebGL detect, debug store) · `src/components/themes/*` (ThemeStage, ThreeThemeStage, ThemeHud, FallbackStage) · `src/components/atm/*` (existing ATM + LEDs/idle).

## Adding a theme
1. Add the id in `levels.ts`, a `profileFor` branch, a `SceneFactory` in `src/visual/`, a pure curve + unit tests, a fallback look, and a button in `/control`.
2. Never read the queue in a scene: only `VisualState`.
