# PRISM Live Studio (iPad)

> **PENDING EXTERNAL VALIDATION.** Nothing below was verified inside PRISM: the author has no iPad/PRISM/LIVE access. Items marked ☐ must be checked by you (see `MANUAL_TESTS.md`).

## Why a server link is needed
PRISM's Web widget and Safari are different processes/contexts: they do **not** share `localStorage`, `BroadcastChannel` or sessions. The only dependable path is a network link. This app uses Supabase Realtime Broadcast (free tier) with a secret **room code**.

Emulated test (automated): two fully isolated browser contexts (separate storage, no `BroadcastChannel`) exchanged events, acks, settings and survived a dropped connection through the realtime link (against a local server speaking the same wire protocol). Real Supabase and real PRISM remain untested.

## Setup
1. Deploy to Vercel with the two `NEXT_PUBLIC_SUPABASE_*` variables (`DEPLOYMENT_VERCEL.md`).
2. Open `/control` in Safari. **Connections → Room code → Copy overlay URL** (`…/overlay?room=…&clean=1`).
3. PRISM → add source **Web** (widget) → paste the overlay URL → portrait 9:16 canvas, transparent. ☐ confirm background is transparent.
4. Back in `/control`: "Overlay page: connected" must turn on within ~5 s. ☐
5. Press **Gift Large** → ATM must animate in PRISM. ☐

## Audio (the hard part)
Viewers only hear the stream audio PRISM captures. Open questions you must test:
- ☐ Does PRISM include web-widget audio in the broadcast (not only the iPad speaker)?
- ☐ Can WebAudio start without a tap in the widget? The overlay tries automatically (`autoActivate`); if blocked it shows a "TAP: ENABLE SOUND" button (hidden by `?clean=1` — remove `clean=1` for the first test, or add `&debug=1` to see `audio:` state).
- ☐ iPad silent switch / ringer: Web Audio is muted by it.

If PRISM does not capture widget audio, code cannot fix it. Alternatives you can test: (a) route the iPad's own audio into the stream if your PRISM version has "device audio / media sound" capture; (b) play the sounds as media files from PRISM's own sound/media source (the WAVs are in `public/audio/`), triggered manually; (c) stream from a desktop with OBS browser source (audio capture is reliable there).

## If the widget stays blank / does not link
Append `&debug=1` to the overlay URL: the HUD shows `local:` / `remote:` link state, room prefix, audio state and the last log lines. Typical causes: env vars missing at build, wrong room code, Vercel Authentication wall, PRISM blocks WebSockets.
