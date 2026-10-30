# Audio asset manifest

Source of truth in code: `src/lib/audio/manifest.ts`. Files live in `public/audio/`.

| Sound ID | File | Used for | Length | Origin | Real recording? |
|---|---|---|---|---|---|
| `processing` | `processing.wav` | Viewer Join: processing stage | 1.4 s | Synthesized | **No** |
| `cash_dispense` | `cash_dispense.wav` | Viewer Join + Gift Small: dispensing stage | 2.3 s | Synthesized | **No** |
| `gift_processing` | `gift_processing.wav` | Gift Small + Gift Large: processing stage | 1.9 s | Synthesized | **No** |
| `premium_dispense` | `premium_dispense.wav` | Gift Large: dispensing stage (bundle) | 3.8 s | Synthesized | **No** |

## Honest status

- All four files are **original, procedurally synthesized placeholders** (noise + oscillators shaped to mimic motor, note riffle, shutter, thunk, beeps). License: CC0, created for this repo. No copyrighted ATM recording is used.
- They are **not** real ATM recordings and should **not** be described as realistic. They are WAV samples (not just live oscillators), which proves the sample pipeline, but real authentic ATM character needs real recordings.
- Missing/undecodable files never crash playback: engine tries Web Audio decode → HTMLAudio element → a short oscillator beep. The Control page lists missing assets under System status.

## Replacing with real audio

1. Record your own ATM, or use a properly licensed sample (CC0 / purchased with commercial and streaming rights). Keep a license note.
2. Export as WAV/MP3/M4A, keep the same file names (or edit `manifest.ts` `file`).
3. Update `nominalMs` (safety timeout only) and `realRecording: true`, `license` in the manifest.
4. Re-check sync: processing sound length should be ≈ the processing stage (1.4 s join / 1.9 s gift; stage waits for whichever is longer), dispensing sound ≈ animation length (single 1.5 s, small ≤ 3.1 s, bundle 2.0 s). Sync tuning constants: `src/lib/dispense.ts`, `src/lib/controller.ts` `DEFAULT_TIMING`.

## Missing assets

None missing. Wanted (not present): real recorded ATM motor/riffle/shutter loop, real keypad beep, real receipt-printer sound.

## Sound design intent (and what was NOT verified)

Per sound: *processing* = keypad-style beeps + low electronic hum; *cash* = motor with gear/roller pulsing, band-passed noise for paper sliding (smooth, deliberately not clicky, to avoid a printer/dot-matrix feel), shutter thunk; *success* = two short beeps. No cash-register "ka-ching", no arcade chimes.
The author **cannot listen** to audio; these descriptions are design intent, checked only by synthesis code review and playback tests. Judge by ear (`MANUAL_TESTS.md` §E) and replace if unconvincing.

## Audio testing guide
1. `/control` → Activate Audio → expect `5/5 loaded` (Samples).
2. **Audio Test** → 5 sounds in order, one at a time.
3. Mute / Volume → immediate effect (also on the overlay through the link).
4. Break a file on purpose (rename it): Samples shows `MISSING: …`, a short beep plays instead, the transaction still completes.
5. Sync: processing sound length ≈ processing stage (1.4 s join / 1.9 s gift); cash sound starts together with the notes; success beep starts when "SILAKAN AMBIL UANG ANDA" appears.
6. On the overlay: `&debug=1` shows `audio:active` / `fail:n`.
