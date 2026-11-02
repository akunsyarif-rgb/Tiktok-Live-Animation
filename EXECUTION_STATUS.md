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

## Final preview validation pass (security / runtime / listener host / PRISM)
- [x] Private key: non-extractable CryptoKey in IndexedDB, shown once, legacy migration, rotation/removal UI
- [x] Replay guard for settings/clear, CSP, avatar referrer policy, ping throttle, secret scanner (`npm run security:scan`)
- [x] Listener: health endpoint, `--check`, link-stall exit, graceful flush, crash handlers, replay rehearsal file, systemd unit, `docs/LISTENER_HOST.md`
- [x] `/prism-check` probe page, `docs/PRISM.md`, audio routing checklist
- [x] Vercel (read-only): Preview READY; Vercel Authentication ON (blocks PRISM); no env vars set; Preview URL could not be opened from here
- [ ] Real Supabase / real TikTok / PRISM / iPad: waiting for you (RELEASE_READINESS.md)
