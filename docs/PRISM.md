# PRISM Live Studio (iPad): what must be verified on the device

> **Nothing here was verified inside PRISM.** The agent has no iPad/PRISM. Use the built-in probe page, then the stream preview.

## Why a server link
PRISM's Web widget and Safari are different processes: no shared `localStorage`, IndexedDB or `BroadcastChannel`. Cross-device control needs the realtime backend (Supabase Broadcast + signed messages). The overlay is autonomous after it has its URL: it keeps its settings and replay-guard state in its own storage.

## Step 0 — make the Preview reachable by PRISM (manual: needs your Vercel account)
Current project state (read from Vercel, not changed): **Vercel Authentication is ON for all deployments except custom domains**, and **no environment variables exist** yet. Consequences: a `*.vercel.app` Preview URL asks for a Vercel login (PRISM cannot log in), and the build has no `NEXT_PUBLIC_SUPABASE_*` so the cross-device link is disabled.
Do, without disabling protection globally:
1. Supabase: create/choose a **dedicated** project; copy *Project URL* and the **anon/publishable** key (never `service_role`).
2. Vercel → Project → Settings → Environment Variables: add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Preview** (branch `work/atm-live-autonomous`). Redeploy (they are inlined at build time).
3. Reachability for PRISM, pick one:
   - **(recommended)** attach a **custom domain** you own to this branch (Project → Settings → Domains → Git branch `work/atm-live-autonomous`). Custom domains are exempt from the current protection mode, other Previews stay protected. Cost: a domain.
   - or Deployment Protection → *Shareable link* / *Protection Bypass*: the share token is appended to the URL and a cookie is set; whether the PRISM web view keeps that cookie is **unknown**: test it with `/prism-check`.
   - or create a separate Production-like project for the LIVE (your decision; Production must not be changed for tests).
4. Do not use older deployment URLs: each deployment URL is a snapshot of one commit; use the branch alias of the newest Preview.

## Step 1 — probe the web view
Add a Web source in PRISM with `https://<host>/prism-check?room=<your room>` (9:16). Read the rows on the stream preview:
| Row | Needs PASS because |
|---|---|
| Secure context | WebCrypto/IndexedDB require https |
| WebCrypto ECDSA P-256 sign + verify | signature verification of every event; if FAIL the overlay refuses all control messages |
| Imported private key non-extractable | host key hygiene (only relevant on the control browser) |
| IndexedDB stores a CryptoKey | host key persistence (control browser) |
| localStorage | overlay remembers settings/replay guard across reloads |
| Canvas 2D | night-window backdrop (transparent mode does not need it) |
| Realtime link to your Supabase | WebSocket works in the widget; cross-device link |
Transparency squares and 9:16: judge by eye on the **stream** (dashed square must show the scene behind it). "Copy report" gives a redacted text report. Also open the same page in iPad Safari for comparison.

## Step 2 — overlay in PRISM
`https://<host>/overlay?room=<room>&pk=<host public key>&clean=1` (first run add `&debug=1`: HUD shows `remote:`, `secured:`, `refused:`, counters). Required: background transparent (no black box), ATM fully inside the 9:16 canvas, `remote:connected`, `secured:true`. Then trigger a test from `/control` (simulator, clearly labelled TEST) in Safari and watch the widget react: this is the cross-context test.

## Audio
ATM sound inside the widget may not be captured by PRISM; music and microphone are external by design (see AUDIO_ROUTING.md). The overlay never needs audio.

## If something fails
| Failure | Do |
|---|---|
| login page instead of overlay | Step 0.3 |
| overlay loads, `remote:` not connected | env vars missing at build / wrong room / WebSocket blocked (probe says which) |
| `secured:false` | `pk` missing in the PRISM URL |
| `refused:` rises | listener/control signed with another key (rotate) or host clock > 10 min off |
| black background | use `?backdrop=transparent` (default) and check PRISM source settings; fallback is a chroma colour behind the widget |
