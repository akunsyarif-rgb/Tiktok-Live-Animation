# Cost estimate (monthly)

All prices/limits are **assumptions from general knowledge, not verified today**: confirm on each vendor's pricing page. FX assumed Rp 16.000 / USD.

## Realtime message model (what actually consumes Supabase Realtime)
Per event: 1 message + 1 ack (+ retries on loss). Listener heartbeat: 1 / 5 s. Overlay status: on change, throttled 0.7 s, + reply to each control ping (only while /control is open: 1 / 5 s). Likes: ≤ 1 batched event / 2 s while likes flow. Caps: joins 30/min, comments 60/min, follows 60/min, shares 60/min.

| Scenario (3 h LIVE) | Events | Messages per LIVE (≈) | 20 LIVEs / month |
|---|---|---|---|
| Light (small account) | 20 joins, 40 comments, 5 gifts, ~1 k like batches | ~4 k | ~80 k |
| Medium | 400 joins, 800 comments, 60 gifts, 3 k like batches | ~14 k | ~280 k |
| Busy (caps reached) | ≤ 5.4 k joins, ≤ 10.8 k comments, 1 k gifts, ≤ 5.4 k like batches, follows/shares | ~70 k | ~1.4 M |
Heartbeat alone ≈ 2.2 k per 3 h. Concurrent connections: 2–3 per room (listener, overlay, optional control).

## Components
| Component | Light | Medium | Busy | Notes |
|---|---|---|---|---|
| Supabase Realtime (Broadcast only, no DB) | Free | Free | Free up to ~2 M msg/month; above that Pro ≈ US$25 (≈ Rp 400k) | free-tier message/connection limits [V3]; free projects pause after inactivity |
| Vercel (static web app) | Free (Hobby) | Free | Free | **Hobby is for non-commercial use**: selling to creators needs Pro ≈ US$20/user/mo [V3] |
| Listener host (Node ≥ 22, always on during LIVE) | Rp 0 (own PC / free tier / Codespaces hours) | Rp 0–80k (small VPS) | Rp 80–160k | free VM tiers exist but change; a laptop that sleeps = LIVE without events |
| Third-party TikTok sign service | Rp 0 | Rp 0 | maybe paid key | `EULER_API_KEY` only if rate-limited: price **unknown**, check first |
| Bandwidth | negligible (overlay ≈ 1.5 MB JS + 0.9 MB audio once; messages < 5 kB) | | | |
| AI/APIs | **none** (rules engine is deterministic) | | | |
| **Total (personal use)** | **≈ Rp 0** | **≈ Rp 0–80k** | **≈ Rp 100–600k** | |

## Cost control already built in
Per-minute caps at the listener, like batching, ping every 5 s, status throttle, no polling, no storage, events expire instead of queueing forever.
