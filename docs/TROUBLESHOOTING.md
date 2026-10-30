# Troubleshooting

## Audio
| Problem | Cause / fix |
|---|---|
| No sound on `/control` | Tap **Activate Audio** (browser rule). Check Mute, Volume, iPad silent switch (mutes Web Audio), volume buttons. |
| No sound on `/overlay` | The overlay needs its own start. It tries automatically; if blocked it shows "TAP: ENABLE SOUND" (hidden with `?clean=1`). Test without `clean=1`; add `&debug=1` and read `audio:`. |
| Sound only on the iPad, not in the stream | PRISM may not capture web-widget audio. See `PRISM.md` alternatives. Cannot be fixed in app code. |
| "MISSING: <sound> (fallback tone)" | File not served (404/500) or corrupt. Check `public/audio/*.wav` are deployed. The transaction still runs; a beep replaces the sound. |
| `Audio failures` counter rises | `lastError` text says why (`audio context interrupted` = a call/Siri took audio; it recovers on the next sound). |
| Audio stops after a phone call | iOS interrupts the audio session; the engine tries to resume before each sound. If still silent, tap Activate Audio again. |

## Links
| Problem | Fix |
|---|---|
| `Cross-device link: disabled — not configured` | `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` missing at **build** time → set in Vercel and redeploy. |
| `disabled — secret/service_role key refused` | You pasted the wrong key. Use anon/publishable. |
| stays `connecting` / `reconnecting` | Supabase project paused (free tier pauses after inactivity), wrong URL/key, Realtime disabled, network blocking WebSockets. |
| `connected` but Overlay not detected | Room mismatch (copy URL again), overlay not open, overlay behind a Vercel login wall. |
| Events arrive late/not at all | Overlay was closed (events expire: join 20 s, gift 120 s). Open the overlay before LIVE. |
| `rate limit hit` in log | More than 30 events/s from a sender: flood protection engaged; senders retry. |

## TikTok listener
| Problem | Fix |
|---|---|
| `offline: streamer is not LIVE yet` | Normal before you go LIVE. |
| `SignatureRateLimitError` | The signing service throttled you. Wait, or consider an `EULER_API_KEY` (check its pricing first). |
| `error: …` repeating | TikTok may have changed the protocol: update `tiktok-live-connector` (`cd listener && npm update`), check its issues. Fall back to the simulator buttons. |
| connected but no events | Not verified against real rooms. Check `ATM_ROOM`, that `sent` increases in `/control`, and that the room is yours/public. |

## Build / deploy
- `npm run verify` runs typecheck, lint, tests and the production build.
- Vercel build fails on env? The app builds without any env vars; failures are unrelated to Supabase settings.
