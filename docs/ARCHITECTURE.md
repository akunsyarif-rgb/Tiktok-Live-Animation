# Architecture

```
 TikTok LIVE ──(unofficial protocol)──► listener/ (Node, your host) ─┐
                                                                      │  Supabase Realtime Broadcast
 iPad Safari  /control  ──── simulator events, settings ─────────────┼─ (WebSocket, room = shared secret)
                                                                      │
 PRISM Live Studio  Web widget  /overlay  ◄───────────────────────────┘
        │  ack for every event  ──► sender retries until acked
        └─ AtmController (queue → one transaction at a time) → ATM animation + AudioEngine
```

Same-browser shortcut: `/control` and `/overlay` in two tabs also talk over `BroadcastChannel` (no server needed).

## Modules (`src/lib`)

| Module | Job |
|---|---|
| `events.ts` | Event type, simulator generator, **sanitizer** (all untrusted input goes through it) |
| `queue.ts` | Pure queue: duplicate protection, mode policy (community / gift-priority / hybrid), overflow protection |
| `controller.ts` | Runs one transaction at a time: processing → dispensing → complete; watchdog; persistence/recovery |
| `dispense.ts` | Event → banknote plan (1 note / 3–6 notes / bundle of 10) and animation timing |
| `audio/engine.ts`, `audio/manifest.ts` | Web Audio engine (activation, volume, mute, sequential playback, fallbacks) and asset list |
| `protocol.ts` | Message schema + validation for everything crossing a link |
| `transport.ts` | `BroadcastChannel` link + Supabase Realtime link, state reporting, reconnect |
| `outbox.ts` | At-least-once sending with acks, pacing (free-tier rate limit), expiry |
| `ingest.ts` | Validation + token-bucket rate limit in front of the controller |
| `tiktok-map.ts` | TikTok payload → ATM event (pure, unit-tested on sample shapes) |
| `config.ts` | Env parsing (refuses secret keys), room code rules |
| `diag.ts` | Redacting ring-buffer log |

`listener/index.ts` is the optional TikTok process. It reuses `src/lib` and runs on Node ≥ 22 with `--experimental-strip-types`.

## Delivery guarantees

- Sender → overlay is **at-least-once** (outbox resends until `ack`); overlay duplicate protection makes it **effectively once**.
- Duplicate ids are remembered (last 5000) and survive a reload (localStorage, ≤ 10 min old).
- A transaction showing "take your cash" is never re-run after a reload; one interrupted earlier is re-run (at-least-once for in-flight work).
- Watchdog: a transaction stuck > 30 s is aborted, counted as "Watchdog recoveries", and **not** retried (so it can never run twice).
- Overload: > 100 waiting → oldest waiting **joins** are evicted (counted as "Dropped"); gifts are kept up to a hard cap of 500.
- Not guaranteed: events sent while **no overlay is open** are dropped after 20 s (join) / 120 s (gift) and logged as undelivered.

## Queue policy

| Mode | Order |
|---|---|
| Community | strict first-come-first-served |
| Gift Priority | any waiting gift before any waiting join (joins can wait long while gifts keep coming) |
| Hybrid (default) | gifts first, but a waiting join is guaranteed its turn after **N gifts in a row** (default 3) **or** after waiting **T seconds** (default 30), whichever comes first. N and T are settings in `/control`. Reason: gifts are paying viewers, joins must not starve. |

## Security model

- No API routes, no server secrets in the web app. The only config is the Supabase **anon/publishable** key (public by design) – the app refuses `service_role`/`sb_secret_` keys.
- The **room code** (24 random chars) is the access control: anyone who has the Supabase URL+anon key **and** the room code can send events to / read status from that room. Treat the overlay URL like a password; rotate with "New room".
- Every inbound message is validated (version, type, size ≤ 16 kB, field clamps, https-only avatars, safe ids) and rate limited (30 events/s). Text is rendered by React (escaped).
- Diagnostics are redacted (JWTs, keys, tokens, room codes).
