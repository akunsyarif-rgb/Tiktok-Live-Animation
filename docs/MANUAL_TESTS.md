# Manual tests that need a real device / account (PENDING EXTERNAL VALIDATION)

The agent could not run these (no iPad, PRISM, TikTok LIVE account, or real Supabase project/Vercel login). Tick them yourself and note iPadOS/PRISM versions.

## A. iPad Safari – /control
- [ ] Portrait + landscape: no horizontal scroll, buttons comfortably tappable.
- [ ] Activate Audio → "Audio Active", 5/5 samples. Audio Test: 5 sounds in sequence, no overlap.
- [ ] Silent switch ON → silent (expected); OFF → audible.
- [ ] Mute / Volume affect sound immediately.
- [ ] Each simulator button animates; counters correct; Burst ×6 processes one by one.
- [ ] Reload mid-queue: pending events resume, finished ones are not repeated.
- [ ] Lock/unlock the iPad, switch apps, receive a call: ATM state and audio recover.

## B. Real Supabase (free tier)
- [ ] Vercel env vars set + redeploy; `/control` shows `Cross-device link: connected`.
- [ ] Turn Wi-Fi off for 20 s then on: link returns to `connected`; a gift sent while offline arrives once.
- [ ] Leave `/control` open for 1 h: Supabase dashboard → Realtime messages stay far below quota.

## C. PRISM Live Studio iPad
- [ ] Web widget loads `…/overlay?room=…&clean=1`; background transparent over camera.
- [ ] `/control` (Safari) shows `Overlay page: connected` (this is the cross-context test).
- [ ] Gift Large from Safari animates smoothly in PRISM (no dropped frames).
- [ ] **Viewer-audible audio**: do a private/unlisted test LIVE; listen from another device: ATM sounds are in the stream? (see `PRISM.md` if not).
- [ ] Scene switch / app background: overlay recovers; no duplicate payouts.

## D. TikTok LIVE (unofficial listener)
- [ ] Listener running; `/control → TikTok listener` = `connected @you`.
- [ ] A second account joins → Viewer Join transaction (source `tiktok`).
- [ ] Second account sends a small gift → Gift Small; a large one (≥ threshold) → bundle.
- [ ] Gift streak (e.g. Rose ×10) pays **once**.
- [ ] Kill the listener's Wi-Fi 30 s: it reconnects; no duplicate payouts.
- [ ] Stress: ask 20+ viewers to join at once: queue stays bounded, "Dropped" shows evicted joins, gifts still paid.

## E. Sound character
- [ ] Listen to the 5 sounds: do they read as ATM (electronic beeps, motor/rollers, notes sliding, shutter, confirmation beeps) and not as printer/cash register/arcade? They are synthesized placeholders; replace per `AUDIO_ASSETS.md` if not convincing.
