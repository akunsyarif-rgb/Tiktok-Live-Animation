# Security review (final preview validation)

Every row says how it was tested. "Tested" = an automated check that fails if the control is removed. Nothing here ran against a real Supabase project, a real PRISM or real TikTok.

## Threat model
Anyone who knows the Supabase URL + anon key (public by design) and the room code can join the realtime channel and read every message. Goals: they must not be able to make the overlay show fake events, change its settings, clear its queue, flood it, run script in it, or learn the host private key.

## Findings and status
| # | Finding | Severity | Resolution | Evidence |
|---|---|---|---|---|
| 1 | Host private key stored as plaintext PKCS#8 in `localStorage`: readable by any script that runs in the page | High | key is now a **non-extractable CryptoKey in IndexedDB**; bytes are shown once at creation (for the listener) and then dropped from memory; legacy plaintext key is migrated and deleted | unit (`extractable === false`, `exportKey` rejects); E2E: IndexedDB record non-extractable, localStorage has no PKCS#8, reveal disappears after dismiss/reload, legacy key migrated |
| 2 | A captured signed `clear`/`settings` could be re-sent for 10 minutes (replay) | Medium | strictly increasing timestamps; overlay refuses same/older control timestamps and persists the high-water mark | unit (`ReplayGuard`, monotonic `signMessage`); E2E: replayed signed `clear` refused |
| 3 | No CSP: an injected script could call out to any host | Medium | production CSP: `connect-src` = self + the configured Supabase origin (https+wss), `object-src 'none'`, `base-uri/form-action 'self'`; `'unsafe-inline'` remains for Next's bootstrap scripts (no nonces) | E2E: header present; no CSP violations in any suite |
| 4 | Avatar `<img>` from a viewer-controlled https URL leaks the overlay machine's IP/Referer to that host | Low | `referrerPolicy="no-referrer"`; only https URLs pass validation; signed rooms reject unsigned events | unit (URL validation); IP exposure to an arbitrary https host remains for validly signed events (accepted risk, see below) |
| 5 | Ping flood made the overlay publish a status per ping | Low | status replies are throttled (0.7 s) | code review |
| 6 | Rate limiting / payload size | — | 30 events/s token bucket, 16 kB message cap, per-minute caps in the listener, queue caps | unit + E2E burst of 200 |
| 7 | XSS through username / comment / avatar | — | no `innerHTML`/`dangerouslySetInnerHTML`/`eval` anywhere (grep); React text nodes; control chars, bidi and zero-width characters stripped; avatar scheme allow-list | E2E: signed markup in username, comment and avatar (`javascript:`, `data:`) stays inert text: no element injected, `window.__xss` unset, no dialog |
| 8 | Forged / unsigned `event`, `settings`, `clear` | — | all three require a valid ECDSA P-256 signature when the overlay has the host public key | E2E: unsigned event, unsigned settings (mute/night/idle-off), wrongly-signed event all refused and counted; nothing changed |
| 9 | Secrets in bundle, logs, URL | — | `npm run security:scan` (JWT with role decode, `sb_secret_`, PKCS#8/PEM keys, service-role assignments) over `.next` output, `public/`, tracked files; diagnostics redact JWT/keys/room; URL carries only the public key and room | scan fails on planted secrets (verified), passes on the build; E2E: real listener output never contains the signing key, room or anon key |

## Key lifecycle
- **Create:** `/control` → Security → Create signing keys → copy the overlay URL (public key) and the listener key (shown once).
- **Rotate (also the revocation procedure):** Rotate keys → update the PRISM source URL (new `pk`) and the listener `ATM_SIGNING_KEY` → restart the listener. Old-key messages are refused by the overlay immediately (tested). Until the overlay URL is changed, an attacker holding the *old private key* could still sign: update the overlay first when a leak is suspected. Rotate the room too.
- **Remove:** Remove keys on the host; the overlay then refuses anything signed by them.
- A time-based or per-message revocation list does not exist: revocation = replacing the public key in the overlay.

## Supabase channel audit
Realtime Broadcast only; no tables, no RLS, no schema. The channel `atm:<room>` is a **public** broadcast channel: anyone with URL + anon key + room code can subscribe (read everything: comments, names, gift values, status) and publish. Supabase Realtime *Authorization* (private channels + RLS on `realtime.messages`) needs authenticated users; this product has none, so **signatures are the authorization** and **confidentiality is not provided**: do not put anything private in events. Never put `service_role` in the app or listener (the app refuses it; the scanner would flag it). Use a dedicated project. Dashboard settings could not be inspected from here (no Supabase project is attached to this work): MANUAL: confirm Realtime is enabled, note the messages/connections quota of your plan.

## Residual risks (not fixed, by design or by platform)
1. XSS is mitigated, not impossible: with a script already running in the control page, the non-extractable key can still be *used* to sign while that page is open (it just cannot be read or exfiltrated). CSP `unsafe-inline` weakens that.
2. Anyone holding the room code can read channel traffic and can spoof unsigned informational messages (`status`, `ack`, `listener`, `ping`): a fake "green" dashboard or a fake `ack` can make the sender stop retrying an event. They cannot change what the overlay shows.
3. Control-message replay protection compares timestamps: the host's clock moving backwards makes settings refused until it catches up (rotate keys to reset). Event replay is blocked by id dedupe for ≤ 10 min only; stale (> 10 min) signed events are refused by the signature window.
4. WebCrypto ECDSA, IndexedDB `CryptoKey` storage and CSP behaviour inside the **PRISM web view** are NOT VERIFIED: use `/prism-check` there. If WebCrypto is missing the overlay refuses all control messages (fails closed).
5. The listener host holds the private key and the TikTok session-free connection: protect it like a password manager (dedicated user, `chmod 600` env file, no shell history).
6. Unofficial TikTok library: AGPL-3.0, third-party sign service, terms risk (SOURCE_COMPATIBILITY.md).
7. `npm audit`: production dependencies 0 vulnerabilities (app and listener). Dev-only eslint/minimatch advisory (16 moderate) is not shipped; fixing needs a breaking eslint major.
