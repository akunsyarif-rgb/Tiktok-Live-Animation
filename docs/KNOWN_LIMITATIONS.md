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
