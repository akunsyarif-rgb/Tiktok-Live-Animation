# Manual iPad testing checklist

Not yet run by the author on a physical iPad. Tick each box on the device and note iPadOS/Safari version.

Setup: `npm run dev -- -H 0.0.0.0` (or `npm run build && npm start -- -H 0.0.0.0`) on a computer on the same Wi-Fi, open `http://<computer-ip>:3000`. Note: `http://` over LAN is not a secure context; the app avoids secure-context-only APIs. Hosting the built app on any HTTPS static/Node host also works.

## Safari, /control
- [ ] Page loads portrait and landscape, no horizontal scroll, buttons ≥ 44 px, readable.
- [ ] Silent switch OFF / ringer on. Tap **Activate Audio** → shows "Audio Active", Samples `4/4 loaded`.
- [ ] **Audio Test** plays 4 sounds one after another, never overlapping.
- [ ] Volume slider changes loudness live.
- [ ] Viewer Join: avatar initials + @name, "MEMPROSES TRANSAKSI", progress bar, processing sound, one note slides out with cash sound, "SILAKAN AMBIL UANG ANDA", note disappears, back to standby.
- [ ] Gift Small: several notes staggered, gift sound.
- [ ] Gift Large: bundle with strap, longer premium sound with chime.
- [ ] Burst ×6: one transaction at a time, nothing skipped (Processed counter +6), waiting list shrinks.
- [ ] Gift Priority / Hybrid: a gift sent while joins wait is served before them. Community: strict order.
- [ ] Resend last: "Duplicates blocked" increments, ATM does not repeat.
- [ ] Reload mid-queue: pending events resume, no re-run of finished ones.

## Safari, /overlay (same browser, second tab)
- [ ] `/overlay?bg=dark`: full ATM, portrait, scaled to screen, no cropping.
- [ ] Control shows "Overlay page: connected". Events sent from Control animate on Overlay.
- [ ] Tap **TAP: ENABLE SOUND** on overlay → sound plays there (overlay needs its own activation).
- [ ] `/overlay?clean=1` hides the hint; background stays transparent.

## PRISM Live Studio (iOS) — NOT verified by author
- [ ] Add Web widget with `https://<host>/overlay?clean=1`, portrait 9:16 canvas. Is background transparent?
- [ ] Does the widget animate smoothly (no dropped frames)?
- [ ] Does PRISM capture web-widget audio? Can audio be activated inside the widget (no tap possible when clean)?
- [ ] Important: PRISM's web view is likely a different browser process than Safari, so `/control` in Safari **cannot** reach it over BroadcastChannel. Record what works.
