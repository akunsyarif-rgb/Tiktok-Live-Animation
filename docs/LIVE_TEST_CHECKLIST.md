# Manual LIVE test checklist (tonight)

Automated tests cannot cover these. Nothing here was verified on a real iPad, PRISM, Supabase or a real TikTok LIVE.

## Before
- [ ] Deployment under test is the **branch Preview** (not Production). Open `/control` on the iPad (Safari), copy the Overlay URL (it contains the room code).
- [ ] Vercel env vars `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set for Preview, Deployment Protection off for this Preview (PRISM cannot log in). `/control` shows *Cross-device link: connected*.
- [ ] PRISM Web widget → paste overlay URL (**without** `clean=1` and with `&debug=1` for the first run), canvas 9:16, transparent.
- [ ] Audio: Activate Audio in `/control`, Audio Test; overlay shows `audio:active` (or tap the sound button once).
- [ ] iPad: charger, Auto-Lock off, Do Not Disturb, silent switch off.

## Each theme (ATM, Reactor, Marble) — pick theme in `/control`
- [ ] Overlay switches to the theme within ~1 s; idle motion visible, nothing static, nothing flickering.
- [ ] Idle animation toggle OFF → scene freezes; ON → moves again.
- [ ] Viewer Join → "Welcome, @name" readable on the **stream** (view from another phone). Name correct.
- [ ] Gift Small / Medium / Big / Special → clearly different in size; Special shows the grand effect; sound matches; returns smoothly to idle.
- [ ] Join ×20 → grouped welcomes, no wall of text, names visible in *Recent visitors*, none missing.
- [ ] Burst while an animation runs → one at a time, no overlap, no freeze.
- [ ] Switch theme while the queue is running → nothing lost.
- [ ] Reload the overlay mid-queue → resumes, no repeated payout.

## Performance (use `&debug=1`)
- [ ] fps ≥ 28 at the 30 fps cap in each 3D theme for 10 min; `q:1`, no `gl:lost`.
- [ ] If `q:0` or `dpr:0.7` appears, note when (the device downgraded itself).
- [ ] iPad not hot after 30 min; PRISM CPU/GPU acceptable.
- [ ] Background the app / lock the screen / switch PRISM scenes → overlay recovers, no duplicate transactions, audio resumes.

## PRISM / audio (the unknowns)
- [ ] Is the **WebGL canvas transparent** in PRISM (no black box)? If black → tell me: fallback is `?theme=atm` or a chroma background.
- [ ] Does PRISM capture the widget's audio into the broadcast? Listen from a second device.
- [ ] `/control` ↔ PRISM link works (cross-context).

## TikTok (optional, unofficial listener)
- [ ] Listener running, status *connected*; a 2nd account joining shows the real name; a small gift and a big gift map to different levels; gift streak pays once.

## Results to send back
Device/iPadOS/PRISM versions, what failed, screenshots/screen recording, `Copy diagnostics` text from `/control`.
