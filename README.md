# TikTok Live Animation — Phase 0: ATM visual & audio prototype

Frontend-only prototype. A virtual ATM dispenses **virtual entertainment banknotes** (rupiah-inspired, labeled "UANG HIBURAN VIRTUAL — BUKAN ALAT PEMBAYARAN YANG SAH") when simulated viewers join or send gifts. No TikTok connection, no backend, no database.

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, CSS animations, inline SVG, Web Audio API + HTML Audio fallback.

## Run

```bash
npm install
npm run dev                  # http://localhost:3000
# iPad on same Wi-Fi:
npm run dev -- -H 0.0.0.0    # open http://<computer-ip>:3000
# production
npm run build && npm start
```

Scripts: `npm run typecheck`, `npm test` (queue/controller tests), `npm run audio:generate` (regenerates placeholder WAVs).

## Pages

| Route | Purpose |
|---|---|
| `/control` | Dashboard: mode, volume, **Activate Audio**, Audio Test, Viewer Join / Gift Small / Gift Large simulators, burst + duplicate test, queue and system status, live preview |
| `/overlay` | Transparent portrait 9:16 ATM for PRISM Web Widget. `?clean=1` hides the sound hint, `?bg=dark` / `?bg=checker` preview backdrops |

Open `/control` and `/overlay` in two tabs of the **same browser**: Control detects the overlay (BroadcastChannel) and routes events to it. If no overlay is open, Control animates its own preview, so one page is enough to test. Audio must be activated separately on each page that should make sound (browser rule).

## Behavior

- Viewer Join → 1 note. Gift Small → 3–6 notes. Gift Large → strapped bundle of 10 notes (Rp 1.000.000 virtual).
- Each transaction: processing (processing sound) → dispensing (cash sound + animation) → "take your cash" → standby. Strictly sequential; an active transaction is never interrupted.
- Modes: **Community** (FIFO), **Gift Priority** (gifts before waiting joins), **Hybrid** (default; gifts first, but a waiting join is served after 3 gifts in a row).
- Duplicate event ids are rejected (also after processing). Pending queue is mirrored to `sessionStorage` and resumes after reload. A 30 s watchdog aborts a stuck transaction and continues.
- Audio: explicit activation, separate processing / cash / gift / premium sounds, master volume, sequential non-overlapping playback, missing files degrade gracefully (HTMLAudio → oscillator beep).

## Layout

```
src/lib/        events, dispense plan, EventQueue, AtmController, bus, audio/ (manifest, AudioEngine)
src/components/atm/  ATMBody ATMScreen ATMKeypad CardReader CashSlot Banknote SingleNoteAnimation CashBundleAnimation TransactionDisplay (+ Avatar, AtmStage, StageScaler)
src/app/        /, /control, /overlay
public/audio/   4 WAV placeholders     scripts/generate-audio.mjs     tests/
docs/           AUDIO_ASSETS.md  IPAD_TEST_CHECKLIST.md  KNOWN_LIMITATIONS.md  BUILD_VERIFICATION.md
```

## Docs

- [Audio asset manifest](docs/AUDIO_ASSETS.md) — **sounds are synthesized placeholders, not real ATM recordings**
- [Manual iPad checklist](docs/IPAD_TEST_CHECKLIST.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Build verification report](docs/BUILD_VERIFICATION.md)

## Out of scope (later phases)

TikTok connector/APIs, Supabase/database, auth, multi-account, paid APIs, deployment.
