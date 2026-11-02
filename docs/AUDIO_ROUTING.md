# Audio routing: music and microphone are OUTSIDE the app

The ATM LIVE app only makes its own dispenser sounds (optional). It never plays, reads, ducks or controls music, and it never captures the microphone.

| Signal | Where it comes from | How it reaches viewers | App involvement |
|---|---|---|---|
| Music | another app/device (Apple Music, Spotify…) | PRISM audio input / device audio capture / mixer | none |
| Host voice | device mic or external audio interface | PRISM microphone input | none |
| ATM sounds | the overlay web page (Web Audio) | only if PRISM captures widget audio | optional, **unverified** |

## Setups (all PENDING real tests; none verified here)
1. **iPad runs PRISM + overlay, music on the same iPad**: music app in background, PRISM microphone on. Whether PRISM can also capture device/media audio depends on your PRISM version/iOS: check PRISM's audio settings. iOS usually allows one app to hold the audio session: test that music keeps playing when PRISM goes live.
2. **Music on an iPhone, LIVE on the iPad**: iPhone audio does **not** reach PRISM automatically. Options: a cable/interface into the iPad, or play the music on a speaker that the iPad mic hears (lower quality). Bluetooth source→iPad is not a capture path.
3. **External audio interface/mixer** (most reliable): music + mic mixed in hardware → iPad as the audio input.
4. **ATM sounds in the broadcast**: the widget may be muted/not captured by PRISM. If it is, ATM sounds are inaudible to viewers; the visuals are unaffected. The overlay never needs audio to work (audio failure never stops a transaction).

## Rules
- Do not start music from the app; do not assume the app sees system audio.
- Verify with a private/unlisted test LIVE and listen on a second device before going public.
- **Music rights:** music you may play privately is not automatically licensed for public LIVE. Use licensed/royalty-free music or TikTok's own sound library as allowed by its terms.
- Mute/volume in /control affect only the ATM sounds.
