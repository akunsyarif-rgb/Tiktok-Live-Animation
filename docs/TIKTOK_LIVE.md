# Connecting TikTok LIVE (optional, unofficial)

> **PENDING EXTERNAL VALIDATION.** The listener has run only against an offline/unreachable target. It has never received a real join or gift. Simulated events prove the ATM, not the listener.

## What it is
`listener/` uses [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) 2.5.0, a **reverse-engineered, unofficial** client of TikTok's web LIVE protocol. It is **not** an official TikTok API and not affiliated with TikTok/ByteDance.

Risks you accept:
- TikTok can change the protocol or block it at any time → events silently stop or the connection fails. The author of the library states it is "not a production-ready API".
- It depends on a third-party **signing server** (Euler Stream); it can rate-limit (`SignatureRateLimitError`) or require an API key (`EULER_API_KEY`, may be paid → your decision).
- License is **AGPL-3.0**. Fine for running it yourself; if you distribute it or offer it as a network service you must comply (source offer). That is why it lives in its own folder and is not bundled into the web app.
- Using unofficial access may violate TikTok's terms. The app does not bypass authentication, and never needs your TikTok login or cookies — do not add them.

## Where it can run
It needs a long-running Node ≥ 22 process **while you are LIVE**. Vercel cannot host it. Options: a PC/laptop, a GitHub Codespace (usable from iPad Safari, free hours are limited), or any small VPS. An iPad alone cannot run it.

## Run
```bash
cd listener && npm install && cd ..
TIKTOK_USERNAME=yourname SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... ATM_ROOM=<room from /control> npm run listener
```
(see `.env.example`; never commit real values). Start it **before** going LIVE; it retries while you are offline (`streamer is not LIVE yet`).

## Mapping
| TikTok | ATM |
|---|---|
| `member` (viewer joins) | `VIEWER_JOIN` → 1 note. Same viewer re-joining within the same minute is ignored (same event id). At most `ATM_MAX_JOINS_PER_MIN` (30) are forwarded. |
| `gift` | `GIFT_SMALL` (3–6 notes) when value < `ATM_LARGE_GIFT_DIAMONDS` (default 1000 diamonds), else `GIFT_LARGE` (bundle of 10). Value = diamonds per gift × repeat count. |
| gift streak (`giftType 1`) | paid **once**, on the final `repeatEnd` event; in-progress streak events are ignored |

Events carry `source: "tiktok"` (simulator ones `"simulator"`); `/control` shows `[tiktok]` in its log and the listener state in **Connections**.

## Failure handling
Auto-reconnect with exponential backoff (5 s → 2 min, jittered); `offline` state when the streamer is not LIVE; events are sent with acks and resent if the overlay does not confirm (given up after 20 s join / 120 s gift → "undelivered" counter + log). The listener never reports `connected` unless the library connected.

## How to verify (you)
See `MANUAL_TESTS.md` §TikTok. Minimum: go LIVE on a test account, join from a second account, send a cheap gift; the ATM must react and `/control → TikTok listener` must show `connected` with `sent` increasing.
