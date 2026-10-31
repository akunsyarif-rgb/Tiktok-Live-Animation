# ASSET_PROTOTYPE_PLAN — three separate prototypes (plan only, not implemented)

Each prototype: separate route (`/lab/atm3d`, `/lab/marble`, `/lab/reactor`) behind a flag, **zero change** to the current `/overlay` and `/control` until approved. All support the 6 states: **idle · join · small · medium · big · special**, driven by the same tier mapping (ASSET_REQUIREMENTS §1) and the existing queue (one transaction at a time, duplicate protection, recovery unchanged).

Common to all prototypes:
- Plain three.js scene, `alpha:true`, 540×960 logical, DPR ≤ 1.5, 30 fps cap, tiers 0/1/2, `?debug=1` HUD, `?tier=`.
- Timeline = pure function `state(t)` + cue list (sound/light/particle) → deterministic, seekable.
- Visibility/context-loss recovery per ASSET_PERFORMANCE_GUIDELINES §5.
- Sound from the theme bank, scheduled on the audio clock; visuals never wait on audio longer than their own timeline.
- Art direction before modelling: 3 reference images (own sketches or CC0), palette (≤ 5 colours), material rules, **one signature detail** so it does not look like a stock template.

---

## P1 — ATM (upgrade of the existing machine)

Goal: real depth/reflections while keeping the realistic, non-neon look.

| Part | Plan |
|---|---|
| Dispenser | cash door slides; **roller pair** (two cylinders rotating, speed ramp) pulls notes from a visible **cassette**; presenter extends the note stack; shutter returns |
| Virtual notes | shared plane + `CanvasTexture` of existing SVGs; 1 / 3–6 / 10 (strapped bundle) / 20 (special: two bundles) ; curved-in-flight bend via vertex shader (sin along length) |
| Indicator lights | idle chase LED strip; amber *processing*, green *dispensing*, blue *take cash*; slot strip pulse |
| Internal mechanism | cut-away window under the keypad: belt (UV-scrolled), gear train (3 gears), sensor LED blink |
| Screen | existing `TransactionDisplay` rendered to `CanvasTexture` (reuse DOM → canvas via offscreen drawing, **or** keep DOM screen overlaid on the canvas; decide in prototype) |

| State | Behaviour | ≈ s | Audio cues |
|---|---|---|---|
| idle | LED chase, subtle screen scanline, internal fan/belt idle tick | loop 4 | very low hum (optional) |
| join | card-reader pulse → 1 note out | 3 | beeps, roller, paper slide, shutter, success |
| small | 3–6 notes staggered | 4 | + rustle |
| medium (new) | 10 notes in a fan, presenter extends further | 6 | + longer motor |
| big | strapped bundle of 10 | 8 | premium motor + thunk |
| special | 2 bundles + amber beacon + screen "SPECIAL" message | 11 | + stinger |

Budget: ≤ 60 draw calls, ≤ 60k tris, 1 metal set + 1 rubber (≤ 600 KB textures), GLB 0 (all procedural).
Fallback: current DOM ATM (Tier 0, already shipped and tested).
Risk: matching the realism of today's SVG art with procedural geometry → mitigate with a **reference-match checklist** (same layout/proportions as current).

## P2 — Kinetic Marble Machine

Goal: satisfying, readable chain reaction; gifts = more/larger marbles and more mechanisms triggered.

| Part | Plan |
|---|---|
| Ball paths | 1 launcher → spiral → 2 diverter branches → funnel → elevator wheel → return loop, as spline segments with baked speed tables |
| Moving balls | `InstancedMesh` (steel / glass / gold), ≤ 40 simultaneous; viewer name engraved on the marble via a small canvas-texture atlas (≤ 64 recent names) |
| Wheels/mechanisms | gear train (parametric), see-saw, pendulum kicker, bell bars (3 pitches), gate diverter, elevator wheel with cups |
| Chain reaction | trigger graph: ball reaches `s*` → mechanism animation + sound → releases the next ball/branch; route chosen by seeded RNG from event id |
| Glass | fake glass tube/globe around spiral/funnel |

| State | Behaviour | ≈ s |
|---|---|---|
| idle | gears and elevator wheel turn slowly, 1 lone marble loops every 6–8 s | loop |
| join | 1 marble launched, rings 1 bell | 4 |
| small | 3 marbles, one branch cascade | 5 |
| medium | 8 marbles, both branches + see-saw + pendulum | 7 |
| big | 20 marbles "avalanche", all mechanisms fire in sequence, gold marble to the top | 9 |
| special | glass globe fills, golden marble finale, confetti-like sparks (pooled), full bell scale | 12 |

Physics: **none** (analytic motion). Rapier only if the user explicitly wants free-form stacking — costs ≈ +0.8 MB gz.
Budget: ≤ 70 draw calls (marbles instanced), ≤ 50k tris. Audio: roll loop pitched by speed, clacks, tinks, bells (Kenney Impact CC0 + own synthesis).
Fallback: 2D canvas path-follow marbles on a static poster (Tier 0).
Risk: spline authoring time; mitigated by one hand-authored layout + parametric variations.

## P3 — Energy Reactor

Goal: dramatic charging/discharging core, readable at stream size.

| Part | Plan |
|---|---|
| Core | icosphere with fresnel + noise shader; intensity uniform `charge ∈ [0,1]`; color ramp cool→hot |
| Rings | 3–5 rings at different axes; speed ∝ charge; segment lights |
| Energy particles | pooled `Points` orbiting inward on charge, outward on discharge; arcs between ring nodes (pooled ribbons with jitter) |
| Charge / discharge | **charge** (riser, rings accelerate, core brightens, particles converge) → **hold** (flicker) → **discharge** (shockwave ring, flash, particles burst, rings brake) → **cooldown** (vent hiss) |
| Frame | containment pylons + coolant pipes (procedural), warning lamps |

| State | Behaviour | ≈ s |
|---|---|---|
| idle | core pulses 0.15–0.25, slow rings, occasional spark | loop |
| join | small charge to 0.5 → soft discharge pulse | 3 |
| small | charge to 0.6, 1 arc burst | 4 |
| medium | charge to 0.8, ring spin-up, arcs, medium shockwave | 6 |
| big | charge to 1.0, overload flicker, big shockwave, pylons flash | 8 |
| special | overcharge >1 (white-hot), double shockwave, alarm light sweep, slow-motion tail | 12 |

Glow: emissive + additive halo quads; **no real bloom** in Tier 1. Budget: ≤ 40 draw calls, ≤ 30k tris, ≤ 1,500 particles.
Audio: own synthesis (hum layers, riser, boom, zaps) — zero license risk.
Fallback: CSS/SVG glowing core with rotating rings.
Risk: additive overdraw on iPad → keep halos small, cap layers; tier switch.

---

## Milestones (rough, for planning)

| # | Deliverable | Gate |
|---|---|---|
| M0 | **Hardware smoke test page** (transparent WebGL quad, 30 fps loop, audio ping) in Safari iPad + PRISM | decides if 3D is viable in PRISM at all |
| M1 | Shared engine core: renderer wrapper, tiers, pools, timeline/cues, context-loss + visibility recovery, asset gate | unit tests + headless checks |
| M2 | P1 ATM prototype | iPad soak test, parity with DOM ATM |
| M3 | P3 Reactor prototype (cheapest, synthesized audio) | iPad soak test |
| M4 | P2 Marble prototype | iPad soak test |
| M5 | Theme switch in `/control`, credits screen, docs | full regression (existing 54 + 46 + new) |

## Decisions needed from the user (blocking)
1. Approve **procedural-first / plain three.js** (vs R3F) — see TECH_DESIGN §2.
2. Approve tier mapping and adding `GIFT_MEDIUM` / `GIFT_SPECIAL` (or diamond-based mapping only).
3. Audio: synthesis + CC0 only, **or** licensed real recordings (then: private repo or out-of-git injection; any purchase needs your explicit approval).
4. Allow network hosts (polyhaven.com, ambientcg.com, kenney.nl, quaternius.com, sketchfab.com, freesound.org) in the session **or** provide the exact download page URLs, so assets can be pinned with verified size/license.
5. Do you have access to an iPad + PRISM for the M0 smoke test? (nothing 3D should be built before M0 passes.)
6. Which theme first (recommended order: M0 → ATM → Reactor → Marble).
