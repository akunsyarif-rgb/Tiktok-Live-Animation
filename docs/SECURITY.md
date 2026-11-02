# Security

## Threat model
Anyone who knows the Supabase URL + anon key (both public by design) and the room code can join the realtime channel. Goals: they must not be able to (1) make the overlay show fake events/comments, (2) change settings or clear the queue, (3) flood it, (4) trigger script/markup injection.

## Controls (implemented)
| Risk | Control | Verified by |
|---|---|---|
| Event injection / spoofing | **ECDSA P-256 signatures** on `event`, `settings`, `clear`. Host keeps the private key (control browser + listener env `ATM_SIGNING_KEY`); the overlay holds only the **public** key (`&pk=` in its URL, remembered in localStorage). Replay window ±10 min + id dedupe. Unsigned/forged/stale messages are refused and counted (`refused:`), readiness shows it | unit (`sign`), E2E: forged + wrongly-signed events never shown |
| Room code as only protection | room code is only the channel name; authorization is the signature | as above |
| Payload abuse | schema validation, ≤16 kB, id charset, text stripped of control/bidi/zero-width chars, https-only avatars, length limits, rules engine (links, repeated chars, blocklist, per-user rate, duplicate text) | unit |
| Flood | overlay token bucket 30 events/s; listener caps (joins 30/min, comments 60/min, follows/shares 60/min, likes batched every 2 s); realtime client 10 msg/s; queue caps | unit + E2E burst of 200 |
| Secrets | no secret in the browser bundle; env validation refuses `service_role`/`sb_secret_` keys; diagnostics redact JWTs/keys/tokens/room codes; private signing key is only shown by an explicit "copy" click | unit (`config`, `diag`) |
| XSS | React escapes all text; no `dangerouslySetInnerHTML`; no dynamic code | review |
| Resource cleanup | timers/listeners/rAF released on unmount; channels closed; no server state | E2E cleanup |

## Supabase
The app uses **Realtime Broadcast only**: no tables, no RLS to configure, no schema to migrate. Supabase *Realtime Authorization* (private channels + RLS on `realtime.messages`) needs authenticated users; this product has no user accounts by design, so message **signatures** are the authorization. Do **not** put the `service_role` key anywhere in the web app or listener. Use a dedicated project (rate/message quotas are per project). Rotate the room ("New room") after any exposure; rotate keys ("Remove keys" → "Create signing keys") if the private key leaked.

## Known gaps
- Signing is **off until you create keys**: an unsigned room works but is readiness-DEGRADED ("NOT secured").
- Informational messages (`status`, `ack`, `ping`, `listener`) are unsigned: an attacker can spoof a green dashboard or read overlay status, but cannot change what the overlay shows.
- The private key lives in the control browser's localStorage and the listener env: protect those devices.
- WebCrypto ECDSA P-256 on the PRISM web view is **NOT VERIFIED** (works in Safari/Chromium/Node). If it fails, the overlay refuses control messages (safe failure) and diagnostics say so.
- `npm audit`: production dependencies 0 vulnerabilities (app and listener). Dev-only toolchain (eslint → minimatch ReDoS advisory, 16 moderate) is not shipped; `npm audit fix --force` would be a breaking eslint major.
- Unofficial TikTok library is AGPL-3.0 and depends on a third-party signing service: see SOURCE_COMPATIBILITY.md.
