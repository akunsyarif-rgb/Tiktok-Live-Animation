# Build & test verification report

Environment: Linux container, Node 22.22.0, npm 10.9.4, Next 16.4.3, React 19.3.1, TypeScript 5.9.3, Tailwind 4.3.3, Chromium (Playwright) headless.
Date: 2026-10-30.

## Automated results (actually run)

| Check | Result |
|---|---|
| `npm install` | OK, 0 vulnerabilities |
| `npx tsc --noEmit` (strict + noUncheckedIndexedAccess) | PASS, 0 errors |
| `npm run build` (Next production build) | PASS; routes `/`, `/control`, `/overlay` prerendered static |
| `npm test` (node:test) | PASS 14/14 |

Unit/integration tests cover: viewer join sequence + sound order; gift small multi-note; gift large bundle + premium sound; multiple queued events sequential, no overlap, none lost, gift jumps ahead of waiting joins; duplicate processed once (also after completion); watchdog recovery from hung audio; queue recovery from storage after reload; community FIFO, gift-priority, hybrid ordering.

## Browser E2E on production build (`next start`, headless Chromium, iPad 820×1180 portrait and 1180×820 landscape viewports)

| Test | Result |
|---|---|
| Audio activation → "Audio Active", 4/4 samples loaded | PASS |
| Audio Test plays sounds sequentially (a "playing" state observed) | PASS |
| Viewer Join completes (processed counter) | PASS |
| Gift Small completes | PASS |
| Gift Large completes | PASS |
| Burst ×6 queued (waiting = 6), all 6 processed exactly once | PASS |
| Duplicate resend ×2 → "Duplicates blocked" = 2, nothing re-run | PASS |
| `/overlay` detected by `/control`; event routed via BroadcastChannel and processed there | PASS |
| `/overlay` computed backgrounds all transparent (`rgba(0,0,0,0)`) | PASS |
| No horizontal overflow portrait / landscape | PASS |
| No console errors, page errors, failed requests or HTTP ≥ 400 | PASS |

Screenshots were reviewed by the author for layout (ATM body, screen, keypad, card reader, slot, notes, bundle).

## NOT verified

- Real iPad / iPad Safari (only emulated viewport in Chromium). See `IPAD_TEST_CHECKLIST.md`.
- **Actual sound output / audibility / sync feel**: headless run proves the playback pipeline ran, not that it sounds good. Sounds are synthesized placeholders.
- **PRISM Live Studio**: transparency, audio capture, autoplay behavior: untested.
- iOS silent-switch behavior, long-run performance on iPad hardware.
