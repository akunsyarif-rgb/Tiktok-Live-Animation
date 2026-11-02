# Operations: checklists and recovery

## Before LIVE (do ≥ 15 min earlier)
- [ ] Vercel deployment is the one you intend (production URL, not a login-walled preview).
- [ ] `/control` (Safari): **Cross-device link: connected**. Room code set, overlay URL copied.
- [ ] PRISM Web widget uses that exact overlay URL (`?room=…&clean=1`), portrait 9:16, transparent.
- [ ] `/control` shows **Overlay page: connected**. If not: see Troubleshooting.
- [ ] Audio: Activate Audio on `/control`; press **Audio Test**; confirm you hear it **in the broadcast preview / a test LIVE**, not just from the iPad speaker. iPad silent switch OFF. Volume ≥ 60 %, Mute OFF.
- [ ] Send one of each: Viewer Join, Gift Small, Gift Large → animation + sound + counters OK (Processed increases, Watchdog 0, Dropped 0).
- [ ] Signing keys created, overlay URL contains `pk=`, listener has `ATM_SIGNING_KEY` (/control → Security shows "overlay enforcing ✓").
- [ ] Readiness = READY (or DEGRADED only for "streamer not LIVE yet"). Then press **Enter LIVE mode** and leave /control alone.
- [ ] Mode chosen (Hybrid recommended; see ARCHITECTURE queue policy).
- [ ] TikTok listener (if used) running on its host; `/control` shows **connected @yourname**. It may say `offline` until you are LIVE — that is normal.
- [ ] iPad: charger connected, Auto-Lock off, Do Not Disturb on (calls interrupt audio), no other app using the microphone/audio.
- [ ] Note the room code somewhere safe (password-like). Do not show `/control` or the overlay URL on stream.

## During LIVE
- Watch `/control → Event queue`: **Waiting** should return to 0 between bursts. **Dropped** > 0 means overload (old joins were skipped on purpose). **Watchdog recoveries** > 0 means a transaction hung (see Diagnostics).
- Keep `/control` open (it also acts as heartbeat/preview). Do not use the Safari tab that hosts the overlay if you use the same-browser link.

## After LIVE
- [ ] Stop the TikTok listener (Ctrl-C) so it stops consuming quota.
- [ ] `/control → Copy diagnostics` and save if anything odd happened.
- [ ] Note Processed / Dropped / Undelivered counts for the record.
- [ ] If the overlay URL/room code was exposed, press **New room** and update PRISM + listener.
- [ ] Close the `/control` tab (it pings every 5 s).

## Recovery procedures
| Symptom | Do this |
|---|---|
| ATM frozen / animation stuck | Wait 30 s (watchdog aborts it automatically and logs `watchdog`). Still stuck → reload the overlay (PRISM: refresh the widget). Pending events are restored (≤ 10 min old); a transaction already showing "take your cash" is not repeated. |
| Wrong/duplicate payouts suspected | `/control → Copy diagnostics`; look for `duplicate ignored` (blocked) vs `start` lines. Same event id never starts twice. |
| Queue too long (backlog) | **Clear waiting queue** (clears the overlay's waiting events too). Active transaction finishes normally. |
| No sound | See Troubleshooting → Audio. |
| Overlay "not detected" | Re-copy the overlay URL from `/control` (room mismatch is the usual cause), check Cross-device link state, reload the widget. |
| Link keeps dropping | Check iPad Wi-Fi; the app reconnects by itself and resends unacknowledged events (joins for 20 s, gifts for 120 s). |
| Compromised room code | **New room**, update PRISM URL and listener `ATM_ROOM`. |
| Everything broken, LIVE ongoing | Switch PRISM scene without the ATM; fix afterwards. The app never blocks the stream itself. |

## Diagnostics
`/control → System status & diagnostics` (log) and **Copy diagnostics** (UA, link states, audio state, last 300 lines; secrets and room codes redacted). Overlay: add `&debug=1` for an on-screen HUD (link/audio/queue + last 8 log lines). Listener: console output is the same log (redacted of secrets by construction; it never prints keys).
