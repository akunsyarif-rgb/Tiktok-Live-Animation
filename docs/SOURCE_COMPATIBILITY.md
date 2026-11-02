# Event source compatibility & risk report

## What is real and what is not
| Layer | Status |
|---|---|
| Official TikTok integration | **None used.** No public official API for third-party creators to read LIVE joins/comments/gifts is known/used [V3: re-check TikTok developer docs; none was verified] |
| Third-party library | `tiktok-live-connector` 2.5.0 (npm), **unofficial, reverse-engineered**, **AGPL-3.0**, relies on a third-party signing service (Euler Stream); README: "not a production-ready API" |
| Listener | `listener/` (ours) wraps it behind `EventSourceAdapter`; run on your own Node host |
| Simulator / replay | `ATM_SOURCE=replay` and the /control simulator: **not a LIVE**, labelled `source: simulator`, readiness never turns the TikTok line green from them |
| Verified against a real TikTok LIVE | **No.** Payload mapping is unit-tested on sample shapes only. PENDING EXTERNAL VALIDATION (`LIVE_TEST_PROCEDURE.md`) |

## Event matrix
| Need | Library event | Mapped to | Notes |
|---|---|---|---|
| Viewer joins | `member` | VIEWER_JOIN | same viewer within a minute collapses; ≤ 30/min forwarded |
| Comments | `chat` | COMMENT | ≤ 60/min forwarded; rules engine filters again at the overlay |
| Gifts | `gift` | GIFT_SMALL/LARGE + `gift.diamonds` | streak gifts (`giftType 1`) paid once on `repeatEnd`; level by diamonds |
| Likes | `like` | LIKE (batched every 2 s) | summed, one event per window |
| Follows | `follow` | FOLLOW | one per viewer per 10 min |
| Shares | `share` | SHARE | one per viewer per minute |
Anything the library does not deliver is not shown. Field names beyond the documented ones are read defensively (`msgId`, `user.uniqueId`, `giftDetails.diamondCount`, `likeCount`…) and **unverified**.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| TikTok changes protocol / blocks access | events silently stop | readiness shows connection state + age of last event; simulator-free fallback: overlay stays in idle; `npm update` in `listener/`; keep adapter swappable |
| Third-party sign service rate-limit / outage / price | no connection | backoff 5 s→2 min with jitter; `SignatureRateLimitError` path; optional `EULER_API_KEY` (check its pricing first) |
| AGPL-3.0 | network-service/distribution obligations | isolated in `listener/`, not bundled in the web app; do not offer the listener as a hosted service without legal review |
| TikTok terms / account risk | account action | no login/cookies/credentials used or needed; read-only; **you** decide; selling this as a service raises the stakes |
| Needs an always-on Node host | LIVE fails if host sleeps | PC/Codespace/VPS; not Vercel, not iPad (`COST_ESTIMATE.md`) |
| Duplicate events after reconnect | double payouts | idempotent ids (`tt:*:<msgId or user+bucket>`), overlay dedupe (5000 ids), persisted |

## Compatibility
Node ≥ 22 (`--experimental-strip-types`). Library requires Node ≥ 20. Browser side unaffected by the source.
