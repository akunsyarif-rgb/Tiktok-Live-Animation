# Known limitations (Phase 0)

1. **Audio is placeholder.** Synthesized, not real ATM recordings. See `AUDIO_ASSETS.md`.
2. **PRISM Live Studio is unverified.** Transparency, audio capture and widget autoplay behavior inside PRISM have not been tested in a real broadcast.
3. **Control ↔ overlay link is same-browser only** (`BroadcastChannel`). If PRISM loads `/overlay` in its own web view, Safari's `/control` cannot drive it. A server relay is a later-phase concern (out of scope: no backend in Phase 0). Control falls back to its own live preview.
4. **Overlay audio needs a user tap** (browser autoplay policy). In a PRISM widget with no touch, audio may never activate; untested.
5. **iOS silent switch** mutes Web Audio output.
6. **Dispense animation is front-view**: notes slide down out of the slot into a tray (no 3D perspective).
7. Animation/sound sync is time-aligned at phase start (not frame-locked); drift from audio decode latency of ~tens of ms is possible.
8. Queue persistence uses `sessionStorage` (cleared when the tab closes). Persistence is best-effort.
9. Keypad, soft keys and card reader are decorative (not interactive).
10. Events are simulated; avatars always use the local initials fallback in the simulator (remote avatar URLs + error fallback are implemented but unexercised by the simulator).
11. Banknotes are original, rupiah-inspired designs, labeled virtual/not legal tender. They are not copies of real notes.
12. No lint setup was added (kept dependencies minimal).
