# Real-world test procedure (iPad Safari + PRISM + TikTok LIVE)

Results table = what was actually done. Do not mark a row until it was done on the real device/account.

| Test class | Status today |
|---|---|
| Automated (unit/integration/E2E in the repo) | RUN: see BUILD_VERIFICATION.md |
| Simulator (control buttons, replay file) | RUN (headless): proves the pipeline only |
| Integration: real realtime protocol (local Phoenix-protocol server) + SIMULATED listener, **no control page** | RUN (autonomy suite) |
| Real Supabase | PENDING |
| Real TikTok LIVE | PENDING |
| PRISM on iPad | PENDING |
| Audio (music + mic + ATM sounds into the broadcast) | PENDING |

## Preparation (PRE-LIVE, ~15 min)
1. Deploy Preview with `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (Preview scope), Deployment Protection off for this Preview.
2. `/control` (Safari iPad): note **Cross-device link: connected**. **Create signing keys**. **Copy overlay URL** (contains `room` + public key `pk`).
3. Start the listener on its host: `ATM_SOURCE=tiktok TIKTOK_USERNAME=… SUPABASE_URL=… SUPABASE_ANON_KEY=… ATM_ROOM=… ATM_SIGNING_KEY=… npm run listener` (key from "Copy listener key (secret)").
4. PRISM → Web source → overlay URL (+`&debug=1` for the first run), 9:16, transparent. Pick the background in /control (Transparent or Night window).
5. Readiness must read **READY** (or DEGRADED only for "streamer not LIVE yet"). Press **Enter LIVE mode**; do not touch /control again.
6. Audio: start music from its own app, mic on, per AUDIO_ROUTING.md.

## Scenario (LIVE, host touches nothing)
| # | Do | Expect | Result |
|---|---|---|---|
| 1 | host starts the LIVE | listener state → connected; readiness TikTok line green | |
| 2 | a 2nd account joins | "Welcome, @name" on the ATM screen | |
| 3 | it comments (also a link, an empty-ish spam) | comment shown; link hidden | |
| 4 | small gift, then Medium/Big (use thresholds) | different dispenser animations, name visible | |
| 5 | gift streak (e.g. Rose ×10) | paid once | |
| 6 | several accounts at once | one dispenser animation at a time, joins grouped, comments merged ("+N more") | |
| 7 | like/follow/share | aggregated like pulse, follow/share toast | |
| 8 | music keeps playing, host talks | broadcast audio intact (listen on a 2nd device) | |
| 9 | stop the listener's Wi-Fi 30 s | readiness shows the source down; overlay keeps idling; after reconnect events resume, no duplicates | |
| 10 | reload the PRISM widget | overlay returns configured, pending events resumed | |
| 11 | forge test: send an unsigned event with the room code (e.g. second device) | refused (`refused:` counter), nothing shown | |

Record: iPadOS/PRISM versions, fps from `&debug=1`, battery/thermals after 30 min, `Copy diagnostics` text.

## Rollback
Switch the PRISM source to a plain scene; stop the listener. The app holds no server state to clean up.
