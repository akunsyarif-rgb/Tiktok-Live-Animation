# ATM LIVE — autonomous TikTok LIVE overlay

A virtual ATM that reacts to your LIVE by itself: viewers are welcomed by name, gifts make the ATM dispense virtual cash (5 levels), comments / likes / follows / shares appear in a separate lane. After setup the host does **not** operate anything: overlay + listener + realtime backend do the work. Banknotes are original, labelled **"UANG HIBURAN VIRTUAL — not legal tender"**.

**Status: READY FOR PREVIEW** (not release candidate): automated, simulator and local-integration tests pass; real iPad, PRISM, real Supabase and real TikTok LIVE are **not verified yet** (`docs/LIVE_TEST_PROCEDURE.md`). Progress log: `EXECUTION_STATUS.md`.

## How it works
`TikTok LIVE → listener (your Node host, unofficial source) → signed events → Supabase Realtime → /overlay (PRISM widget) → rules + director → ATM animation`. Details: `docs/ARCHITECTURE.md`.

| Page | Use |
|---|---|
| `/control` | **setup only**: readiness, security keys, rules, look, simulator (test), diagnostics, "LIVE mode" read-only board |
| `/overlay` | what viewers see. Params: `room`, `pk` (host public key), `clean=1`, `debug=1` (HUD), `bg=dark|checker`, `backdrop=night|transparent` |

## Setup in 6 steps
1. Deploy (Vercel Preview first) with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`, `docs/DEPLOYMENT_VERCEL.md`).
2. `/control` → **Security → Create signing keys** → copy the overlay URL (contains the *public* key).
3. Start the listener on an always-on Node ≥ 22 host (`npm run listener`, env in `.env.example`, `docs/SOURCE_COMPATIBILITY.md`).
4. PRISM → Web source → overlay URL.
5. `/control` → Readiness must be READY → **Enter LIVE mode**.
6. Go LIVE. Music and microphone stay outside the app (`docs/AUDIO_ROUTING.md`).

## Commands
`npm run dev` · `npm run verify` (typecheck + lint + 90+ unit tests + build) · `npm run build && npm run e2e` (browser tests; needs Playwright) · `npm run listener`.

## Docs
ARCHITECTURE · SECURITY · SOURCE_COMPATIBILITY (event source risks) · AUDIO_ROUTING · COST_ESTIMATE · MONETIZATION_PLAN · LIVE_TEST_PROCEDURE · OPERATIONS (checklists, recovery) · TROUBLESHOOTING · DEPLOYMENT_VERCEL · PRISM · KNOWN_LIMITATIONS · BUILD_VERIFICATION · AUDIT (history). `docs/assets/*` is earlier research about 3D assets: **not used** by the ATM-only product.

## Layout
`src/lib/*` logic (events, rules, director, queue, controller, sign, readiness, transport) · `src/components/atm/*` visuals · `src/app/*` pages · `listener/` source adapters + process · `tests/` + `e2e/`.
