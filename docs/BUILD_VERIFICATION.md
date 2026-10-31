# Build & test verification (actual results)

Environment: Linux container, Node 22.22, npm 10.9, Next 16.4.3, React 19.3.1, TypeScript 5.9.3, `@supabase/realtime-js` 2.118, Chromium (Playwright) headless. Date 2026-10-30. Branch `claude/finalize-atm-live`.

## Automated (all run, all pass)

| Check | Command | Result |
|---|---|---|
| TypeScript (strict, `noUncheckedIndexedAccess`) app + listener | `npm run typecheck` | PASS |
| Lint (eslint + next config) | `npm run lint` | PASS, 0 problems |
| Unit + integration | `npm test` | PASS **54/54** |
| Production build | `npm run build` | PASS (`/`, `/control`, `/overlay` static) |
| Clean-clone build (no `listener/node_modules`, `npm ci`) | simulated Vercel install | PASS |
| Browser E2E (headless Chromium, 2 production builds) | `node e2e/run.cjs` | PASS **46/46** |

### What the 54 tests cover
Queue ordering for all 3 modes; hybrid N-gifts and T-seconds rules; overflow eviction + hard cap; **20 000-event stress** (bounded, no id twice, no accepted gift lost); duplicate protection (also after completion); sequential transactions, no overlap; gift arriving mid-animation waits; 60-event burst in order; audio rejecting/hanging doesn't stop transactions; watchdog (aborted once, never started twice); reload recovery (pending resume, "take your cash" not repeated, stale discarded, `stop()` re-queues); input sanitizing (bad avatar schemes, control chars, ids, clamps); protocol validation (version/type/size); env config (service_role/secret keys refused); room code; redaction; TikTok payload mapping (join dedupe, gift diamonds → small/large, streak paid once, hostile payloads); outbox (retry, ack, pacing, expiry); ingest rate limit; BroadcastChannel transport (rooms isolated, garbage ignored); **real `@supabase/realtime-js` against a local Phoenix-protocol server**: broadcast both ways, server drop → reconnect, server unreachable at start → recovers.

### What the 46 E2E checks cover
Audio activation (5/5 samples), sequential audio test, mute; join = exactly 1 note, small = 3–6, large = ONE bundle labelled Rp 1.000.000 + VIRTUAL; no notes leak between transactions; burst, duplicate blocking, 30-event stress, clear; mode/policy UI; same-browser overlay routing with ack; reload mid-queue (processed exactly 2, none twice); offline (no internet) local operation; no horizontal overflow on iPad portrait/landscape and 390 px phone; overlay fits 540×960, iPad portrait/landscape, 1080×1920, phone; overlay transparent; `?clean=1`; audio file 500 + corrupt file → degraded, transaction still completes, no JS error; **cross-context (isolated storage, no BroadcastChannel) control↔overlay via realtime link**: connect, event animates in overlay, status mirrored, mute propagates, other room sees nothing, **outage during a gift → link reconnects, gift delivered exactly once**; **real listener process** launched against an unreachable TikTok target: shows honest `connecting`, never `connected`, logs contain no secrets; zero console/page errors.

## Bugs found by these tests and fixed
1. Vercel build failed: `listener/` was type-checked without its dependency → excluded from the root tsconfig, own `listener/tsconfig.json` (found on the first Preview deployment).
2. Corrupt audio file caused an uncaught promise rejection (E2E).
3. `/control` overflowed horizontally on a 390 px phone (E2E).
4. Earlier unit-test round: transaction lost on `stop()`; reload could repeat a finished transaction (see `AUDIT.md`).

## NOT verified (PENDING EXTERNAL VALIDATION)
- Real iPad / iPadOS Safari; PRISM Live Studio (transparency, widget audio capture, autoplay, WebSockets).
- **Audio audibility, ATM realism, A/V sync by ear** (the agent cannot listen; sounds are synthesized placeholders).
- Real Supabase project (auth, quotas, rate limits, public-channel setting).
- TikTok listener against a real LIVE (join/gift payloads, signing server, protocol drift).
- Viewer-audible audio in the actual broadcast.
- Vercel Preview/Production runtime behaviour (see status below).
- Long-running (hours) stability and performance on iPad hardware.

See `MANUAL_TESTS.md` for the checklist.

---

# Themes pass (Energy Reactor · Kinetic Marble · ATM upgrade) — branch `claude/visual-themes`

Date 2026-10-31. Everything below was actually run in the container; nothing on a real iPad / iPhone / PRISM / TikTok LIVE.

| Check | Command | Result |
|---|---|---|
| TypeScript strict (app + listener) | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS, 0 problems |
| Unit + integration | `npm test` | PASS **81/81** (was 54) |
| Production build | `npm run build` | PASS (static `/`, `/control`, `/overlay`) |
| Browser E2E (headless Chromium, SwiftShader WebGL2, 3 servers/builds) | `node e2e/run.cjs` | PASS **81/81** (main 36 · themes 31 · remote 14) |

Bundle: three.js theme chunk **717 KB raw / 181 KB gzip, lazy** (loaded only when Reactor/Marble is selected); all chunks 1.46 MB raw / 418 KB gz. Audio 1.7 MB (14 WAV). No third-party host requested at runtime (asserted in E2E).

## New unit tests (27) cover
Gift hierarchy 0–4 and configurable thresholds · visual-settings validation · name fallback + welcome phrases + group text · ATM plan per level · profile durations (join lighter than gift; welcome stretches only the join; every sound exists and fits its stage) · reactor curve (seamless 24 s idle loop, determinism, charge→release→settle, peaks rise with level, double shockwave on special, returns to idle, no jumps between stages) · marble plan (launch counts per level, order, finale ramp, motion table) · controller: levels in snapshot, thresholds change live, **special cool-down**, recent visitors, **20 joins → grouped welcomes with every name shown and none lost**, group never swallows gifts, group survives reload, **theme switching with a queue and while idle**, 5 gifts + big during animation + 15 joins + special sequential/once, idle toggle never blocks queue, regression test for the persistence bug below.

## E2E theme suite covers
Theme selector → overlay (all 3) · theme persists across overlay reload · debug monitor off by default · idle animation runs on its own in each theme · idle can be disabled (static) · real `@username` in the welcome of each theme · ATM notes per level (3–6 / 10 / 1 bundle / 2 bundles) · stress on the Reactor (5 gifts + big during animation + 20 joins + special = 27 events processed exactly once, nothing dropped) · recent visitors · theme switching during a queue (nothing lost) · cleanup after 16 theme switches (one canvas, geometry count stable, heap growth small) · **WebGL context loss + restore** · transactions after restore · **canvas transparency (alpha 0 at corners, 255 at centre)** · no CDN · **overlay reload mid-queue (nothing repeated/lost)** · **no-WebGL browser → DOM fallback + names still shown** (Reactor and Marble) · no console/page errors.

## Bugs found by these tests and fixed
1. Setting the visual settings on mount (before `start()`) **overwrote the persisted queue** → reload lost pending events. `persist()` is now a no-op before `start()`; regression test added.
2. Frozen idle (idle animation off) still advanced scene accumulators; ATM "blink" kept animating → both now static.
3. Rapid theme switching built and discarded a WebGL context per click, stalling the page under software GL → host creation debounced (150 ms).
4. Empty usernames were dropped by the sanitizer → now `guest` (a viewer is never lost).
5. Test-hook bug (lost context cannot return the extension) fixed; several test-side bugs fixed (stale counters, debug HUD in screenshot diff). Test fixtures changed only where they were unrealistic (gift `diamonds` values).

## NOT verified (PENDING EXTERNAL VALIDATION)
Real device frame rate / thermals (SwiftShader runs 4–6 fps, so no performance number from here is meaningful) · transparent WebGL in PRISM · audio capture/audibility/sync by ear · real TikTok events · real Supabase · Vercel Preview behaviour of this branch (**not pushed**, see below) · visual taste on a real stream. See `LIVE_TEST_CHECKLIST.md` and `KNOWN_LIMITATIONS.md`.
