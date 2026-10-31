# Known limitations

1. **Audio is synthesized, not recorded.** The 5 WAV files are original placeholders. The agent cannot listen; it verified playback mechanics, not realism. See `AUDIO_ASSETS.md`.
2. **PRISM unverified.** Transparency, widget audio capture, autoplay, WebSocket support in the widget are untested.
3. **Viewer-audible audio depends on PRISM**, not on this app.
4. **TikTok integration is unofficial and unverified against a real LIVE.** It may break whenever TikTok changes its protocol; it relies on a third-party signing service; library license is AGPL-3.0. Needs an always-on Node host (not Vercel, not an iPad alone).
5. **Real Supabase untested.** The realtime client was tested against a local server implementing the same wire protocol (join, heartbeat, broadcast, drop/reconnect). Auth, quotas, rate limits and "public channel" settings of the real service were not exercised.
6. **Room code = password.** Anyone with Supabase URL + anon key + room code can send events to / read status from your room. There is no per-user authentication (by design for Phase 1 simplicity). Rotate with "New room".
7. **Delivery is not durable.** Events sent while no overlay is open expire (join 20 s, gift 120 s). Queue persistence is `localStorage` on the overlay device only (≤ 10 min old).
8. **Watchdog-aborted transactions are not retried** (to guarantee no double payout) → counted in "Watchdog recoveries".
9. **Overload sheds viewer joins** (oldest first) above 100 waiting; gifts are kept up to 500.
10. A transaction interrupted by a reload while still dispensing is re-run once (at-least-once for in-flight work).
11. Web Audio is muted by the iPad silent switch; iOS may suspend audio on calls/backgrounding.
12. Front-view dispenser animation (notes slide down out of the slot); not 3D.
13. Same-browser link needs both tabs in the same browser profile.
14. Keypad / soft keys / card reader are decorative.
15. Banknotes are original, rupiah-inspired, labelled "UANG HIBURAN VIRTUAL / NOT LEGAL TENDER". Using real-looking currency imagery in streams can still carry legal/platform risk; review before monetizing.
16. Vercel treats the repository's default branch as Production; at the time of writing a feature branch was that default (see `DEPLOYMENT_VERCEL.md`).

## Themes (Reactor / Marble / ATM upgrade)
17. **Not run on a real iPad / iPhone / PRISM.** All WebGL checks ran in headless Chromium with SwiftShader (software GL, ~4–6 fps): they prove it renders, switches, falls back, recovers from context loss and cleans up, **not** that it holds 30–60 fps on an iPad GPU. Frame rate on device is **NOT VERIFIED**.
18. **Transparent WebGL inside PRISM is NOT VERIFIED** (alpha channel is correct in Chromium). If PRISM shows a black box, use `?theme=atm` (DOM) or a chroma background.
19. Visual quality was judged from screenshots only (no live motion review, no sound review by ear). Sounds are synthesized placeholders. Aesthetic tuning (colours, intensities, camera) will need your eyes on a real stream.
20. ATM **join still dispenses 1 virtual note** (original locked decision) and lasts ~5.5 s; only the new themes use the lighter ~4 s join. Say so if you want a note-less ATM join.
21. Marble special "route" is a lit back-layer track; marbles are deterministic (no collisions between marbles, no physics). Marble spacing assumes ≥ 30 fps; below that the `live` clock slows (dt clamp 0.1 s) and marbles lag the schedule.
22. Gift levels depend on `gift.diamonds`. The simulator and listener send the **total** value; events with no value fall back to their type (small=1, large=3). A custom sender must do the same.
23. `session_id` does not exist in this protocol (the secret **room code** plays that role); event idempotency is the event `id` (unchanged).
24. Preview-only: the bundle for a 3D theme adds a lazy chunk (three.js) loaded the first time such a theme is selected.
