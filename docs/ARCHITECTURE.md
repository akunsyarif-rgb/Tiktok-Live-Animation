# Architecture (ATM LIVE, autonomous)

```
 TikTok LIVE ─(unofficial)─► Source adapter ─► normalize/validate ─► sign ─► Outbox (ack + retry, paced)
   listener/ (Node ≥22, your host)                                                │ Supabase Realtime Broadcast
                                                                                  ▼ (room + signed messages)
 PRISM Web widget  /overlay  ◄── verify signature ◄── ingest (validate, rate-limit)
        │
        ├─ dedupe (event id)  ─┬─ main lane: join / gift ► ONE EventQueue (policy: community | gift-priority | hybrid)
        │                      │                           ► AtmController: one transaction at a time → ATM animation
        │                      └─ ambient lane: comment / like / follow / share ► RulesEngine ► AmbientDirector (merge, never blocks)
        └─ idle: night-window backdrop + ATM LEDs/screen, independent of the queue
 iPad Safari /control  = setup + readiness + diagnostics (NOT needed during LIVE)
```

## Pipeline stages and ownership
| Stage | Code | Job |
|---|---|---|
| Source adapter | `listener/sources/*`, `src/lib/source.ts` | produce events; reconnect with exponential backoff + jitter; swappable (`ATM_SOURCE`) |
| Normalize | `src/lib/tiktok-map.ts`, `events.ts` (`sanitizeEvent`) | one event shape: id, type, username, timestamp, source, validated payload |
| Transport | `transport.ts`, `outbox.ts`, `sign.ts` | realtime link, at-least-once delivery with acks, message signing |
| Ingest | `ingest.ts` | validation + token-bucket rate limit (30/s) |
| Rules | `rules.ts` | pre-LIVE configurable: comment filtering/truncation/rate, like window, follow/share on/off |
| Director | `controller.ts` (main lane), `director.ts` (ambient lane), `profile.ts`, `dispense.ts` | priority, durations, grouping, anti-collision, return to idle |
| Renderer | `components/atm/*` | ATM (DOM/SVG/CSS) + night-window canvas backdrop + ambient HUD |
| Health | `readiness.ts`, `diag.ts` | evidence-based readiness per layer; redacted log |

Event record: `id` (idempotency key), `type` (VIEWER_JOIN, GIFT_SMALL/LARGE, COMMENT, FOLLOW, LIKE, SHARE), `username`, `timestamp`, `source` (`tiktok` | `simulator`), payload (`gift`, `text`, `count`). Processing status is observable per event in the diagnostics log (`queued / duplicate ignored / filtered (reason) / shown / start / done`) and as counters (`received`, `filtered`, `duplicates`, `dropped`). There is no `session_id`: the secret **room** scopes a LIVE session.

## Response hierarchy (no new backend event types)
Level from the event: join 0 · gift by diamond value (configurable) 1 small, 2 medium, 3 big, 4 special (a 2nd special inside 60 s is shown as big). Comments/likes/follows/shares are the ambient lane: max 3 comments visible, floods collapse into "+N more", likes become one pulse per window, several follows/shares become one toast. Joins are welcomed by name on the ATM screen; ≥4 waiting joins are welcomed together without dropping any name.

## Delivery and recovery guarantees
- sender → overlay: at-least-once (outbox resends until ack, expiry 20 s join / 120 s gift) + idempotent overlay = effectively once.
- queue persisted in `localStorage` (≤10 min); a transaction already showing "take your cash" is not repeated after a reload; watchdog aborts a transaction stuck > 30 s and never retries it.
- overlay settings (policy, rules, visual, volume) are persisted on the overlay itself: a PRISM widget reload comes back configured **without** the control page.
- overload: > 100 waiting joins/gifts evicts the oldest *joins* (counted), gifts kept to a hard cap of 500; ambient lane merges.
- Not guaranteed: events while the overlay is closed expire; the unofficial TikTok source can silently stop (readiness shows last-event age).

## Queue policy
community = FIFO · gift-priority = gifts first · hybrid (default) = gifts first, a waiting join is guaranteed a turn after N gifts or T seconds (defaults 3 / 30 s).
