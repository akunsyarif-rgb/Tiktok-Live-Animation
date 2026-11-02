# Known limitations

1. **Nothing here ran on a real iPad, PRISM, real Supabase or a real TikTok LIVE.** All E2E ran in headless Chromium. Frame rate, thermals, transparency and audio capture in PRISM are NOT VERIFIED.
2. **TikTok source is unofficial** (AGPL-3.0 library + third-party sign service). It can break at any time; payload mapping is verified on sample shapes only. See SOURCE_COMPATIBILITY.md.
3. **The listener needs an always-on Node host.** Not Vercel, not an iPad. If it dies, events stop (readiness shows it; the overlay keeps idling).
4. **Security is only as strong as the signing setup**: until keys are created the room is not secured. Informational messages (status/ack/listener) are unsigned. See SECURITY.md.
5. **ATM sounds are synthesized placeholders**; PRISM may not capture web-widget audio. Music/mic are external by design (AUDIO_ROUTING.md).
6. **Delivery is not durable**: events while the overlay is closed expire (join 20 s, gift 120 s). Queue persistence = `localStorage` of the overlay device (≤ 10 min).
7. **Watchdog-aborted transactions are not retried** (so they can never run twice) → counted in recoveries.
8. **Overload sheds viewer joins** (oldest first) above 100 waiting; ambient comments merge into "+N more".
9. ATM **join still dispenses 1 virtual note** (original product decision, ≈ 5.5 s).
10. The night-window backdrop is an opaque scene: use it only when the overlay is not meant to sit over a camera feed. Transparent mode shows only the ATM.
11. The room code is a shared secret in the URL; the signing private key sits in the control browser's localStorage and the listener env.
12. Banknotes are original and labelled "UANG HIBURAN VIRTUAL / NOT LEGAL TENDER"; avoid real-looking currency or bank branding when selling.
13. Production on Vercel is whatever branch is the repository default (`claude/phase0-atm-prototype` at time of writing): decide a real `main` before launch (see DEPLOYMENT_VERCEL.md).
14. Vercel Hobby is non-commercial: customer-facing deployments need a paid plan.
