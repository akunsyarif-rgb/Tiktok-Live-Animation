# Execution status

Branch `work/atm-live-autonomous` (new). **Decision:** remote `work/three-theme-preview` was found advanced by other commits (theme work) and diverging from this line of work; it was **not touched** and no force-push was made.

## Done
- [x] Audit: repo, docs, remote branches, security, costs
- [x] ATM-only: Reactor/Marble, three.js, theme selector, 9 theme sounds removed (-0.7 MB JS, -0.8 MB audio)
- [x] Event pipeline: comment / like / follow / share added to the existing protocol (additive), source adapters (`tiktok`, `replay`), normalization, dedupe, per-event status in diagnostics
- [x] Rules engine (pre-LIVE configurable) + ambient Animation Director lane (merge, aggregate, never overlaps the dispenser)
- [x] ATM visuals: night-window room with rain/reflections (opt-in backdrop), transparent default, ambient HUD, varied idle (LED patterns, 16 s screen cycle, gloss sweep), reduced-motion respected
- [x] Autonomy: overlay persists full settings; LIVE read-only mode; readiness per layer from evidence
- [x] Security: signed control-plane messages (ECDSA P-256), replay window, refusal counters, listener rate caps
- [x] Docs: ARCHITECTURE, SECURITY, SOURCE_COMPATIBILITY, AUDIO_ROUTING, COST_ESTIMATE, MONETIZATION_PLAN, LIVE_TEST_PROCEDURE, KNOWN_LIMITATIONS

## Pending external validation
Real iPad Safari · PRISM (transparency, WebCrypto, audio capture) · real Supabase · real TikTok LIVE · Vercel Preview of this branch (see BUILD_VERIFICATION.md for the live status)
