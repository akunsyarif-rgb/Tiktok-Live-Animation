# Build & test verification — branch `work/atm-live-autonomous`

Date 2026-11-02 · Node 22.22 · Next 16.4.3 · React 19.3.1 · TypeScript 5.9 strict · headless Chromium (Playwright). Everything below was actually run; nothing ran on a real iPad / PRISM / real Supabase / real TikTok LIVE.

## Automated
| Check | Command | Result |
|---|---|---|
| Typecheck (app + listener) | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS, 0 problems |
| Unit + integration | `npm test` | PASS **84/84** |
| Production build | `npm run build` | PASS (`/`, `/control`, `/overlay` static); JS 730 KB raw / 228 KB gz total, audio 0.87 MB, no 3D library |
| Dependency audit | `npm audit --omit=dev` (app + listener) | 0 vulnerabilities (dev-only eslint/minimatch advisory, 16 moderate, not shipped) |
| Browser E2E | `node e2e/run.cjs` (4 suites) | full run 81/82 → the 1 failure (lost "playing …" diagnostic) fixed → main suite re-run **33/33**; UI suite **21/21**; autonomy suite **15/15**; remote/realtime suite passed in the full run |

## Test classes (kept separate on purpose)
| Class | What it proves | What it does NOT prove |
|---|---|---|
| Unit (84): rules, ambient director, signing, readiness, mapping, queue, controller, levels, transport | logic, security checks, dedupe, burst (1000 mixed events), recovery, signatures (tamper / wrong key / stale / unsigned refused), reconnect backoff | real platforms |
| Simulator (control buttons) E2E | UI, ambient lane (comment/likes/follow/share), idle, backdrop animates, reduced-motion still, LIVE mode, security panel, no overlap with the dispenser, no CDN | TikTok |
| **Integration: real realtime protocol (real `@supabase/realtime-js` ↔ local Phoenix-protocol server) + SIMULATED listener, NO control page** | host does not touch anything: join → "Welcome, @name", comments (spam link filtered), gifts → dispenser, likes/follow/share, duplicates blocked, forged + wrongly-signed events refused, burst of 200 acknowledged (only 40 joins reach the dispenser, grouped), link outage → event delivered exactly once after reconnect, overlay reload mid-queue, return to idle | real Supabase quotas/auth, real TikTok |
| Real TikTok LIVE | — | **NOT RUN** |
| PRISM / iPad | — | **NOT RUN** |
| Audio into the broadcast | — | **NOT RUN** |

## Bugs found by this pass and fixed
1. Visual settings applied before `start()` erased the persisted queue (earlier pass; regression test kept).
2. Frozen idle still advanced animation; ATM text blink ignored idle-off and reduced-motion.
3. Empty usernames were dropped (now `guest`).
4. Rewrite of /control lost the "playing <sound>" diagnostic (caught by E2E, restored).
5. E2E-only bugs fixed in the tests (stale counters, element screenshots of a zero-size body), no test weakened.

## Deployment
Vercel Preview for this branch built and reached **READY** (target = preview, not production); build log lists `/control` and `/overlay` as static. The Preview URL could **not** be opened from this environment (outside the sandbox allow-list; the Vercel fetch tool had no access): runtime of the Preview is UNVERIFIED. A Production deployment for branch `work/three-theme-preview` (commit `d6c1b92`) exists and was **not** created by this work.
