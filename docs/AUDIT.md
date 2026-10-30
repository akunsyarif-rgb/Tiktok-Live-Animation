# Audit (state at start of the finalization pass) and what was done

Baseline: branch `claude/phase0-atm-prototype`, one commit (Phase 0). Verified from code/tests, not from earlier reports.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | **Critical** | `/control` ↔ `/overlay` used `BroadcastChannel`: cannot cross Safari ↔ PRISM web view. The core use-case was unlinked. | Added Supabase Realtime Broadcast link (room code), acks + outbox, heartbeat, reconnect. Emulated cross-context test passes; real PRISM/Supabase **pending external validation**. |
| 2 | **High** | No real TikTok integration (only simulator). | Added `listener/` (unofficial `tiktok-live-connector`), mapping, reconnect/backoff, status in `/control`. **Not verified on a real LIVE.** |
| 3 | **High** | `stop()` (React StrictMode / unmount) dropped the active event: a transaction could be silently lost. | Active event is re-queued on controlled stop (test added). |
| 4 | **High** | Reload while "take your cash" showing re-ran the same transaction (double payout). | Persist active phase; completed ones are not re-run (test added). |
| 5 | **High** | Queue persistence in `sessionStorage` → lost when the web view is recreated; stale events could replay forever. | `localStorage`, versioned, 10-min TTL, sanitized on restore. |
| 6 | **High** | No input validation on bus messages: any same-origin page could inject oversized/garbled events; avatar URL unchecked. | `sanitizeEvent`/`parseMessage`: schema, size ≤16 kB, clamps, https-only avatars, id charset; ingest rate limit 30/s. |
| 7 | **High** | Unbounded queue under bursts (memory, hour-long backlog). | Soft cap 100 (evict oldest joins), hard cap 500; counters shown. |
| 8 | **High** | Corrupt/undecodable audio produced an **uncaught promise rejection** (found by E2E). | Handled both decodeAudioData outcomes; test: corrupt + 500 files. |
| 9 | Medium | Hybrid rule ("join after 3 gifts") was arbitrary and had no time bound. | Documented policy: N gifts **or** T seconds; both configurable and explained in the UI. |
| 10 | Medium | Audio failure handling: a rejecting player could surface as a failed transaction; no success beep; no mute. | `safePlay` isolates failures; success beep; mute; failure counters; resume after iOS interruption; auto-activate attempt for embedded web views. |
| 11 | Medium | Audio did not read as ATM (clicky riffle ≈ printer). | Re-synthesized: roller motor, smooth paper rustle, shutter, success beeps. Realism **not verified by ear**. |
| 12 | Medium | `/control` overflowed horizontally on a 390 px phone (found by E2E). | Fixed (`min-w-0`, wrapped log). |
| 13 | Medium | No diagnostics; secrets could leak into logs. | Redacting ring-buffer log, copy button, overlay `?debug=1`. |
| 14 | Medium | Watchdog: stuck transaction could be confused with a retry. | Reason-tagged abort; watchdog-aborted events never retried; test "each event started once". |
| 15 | Low | No lint, no CI-style verify script. | ESLint (next config) + `npm run verify`. |
| 16 | Low | Security headers / cache on live pages. | Added in `next.config.ts`. |
| 17 | Info | Vercel project treats the only branch as **production**; the Phase 0 push was auto-deployed as production. | Documented; needs your decision (real `main`). |
| 18 | Info | `tiktok-live-connector` is AGPL-3.0, unofficial, depends on a third-party signing service. | Isolated in `listener/`, risks documented. |

Not changed on purpose: no auth system (room code is the access control), no database, no API routes (nothing to protect), no paid services.
