# RELEASE READINESS — Autonomous ATM LIVE

Branch: `work/atm-live-autonomous` (Preview only). Production untouched, no deployment deleted/promoted.

**Status: READY FOR REAL LIVE TEST** (after the manual steps below). Not PRODUCTION READY.
"Ready" = code, tooling, docs and local/simulated tests are done. Nothing here proves real TikTok, PRISM, iPad or Supabase-hosted behaviour.

## 1. Component status

| Component | Status | Evidence level |
|---|---|---|
| Overlay `/overlay` (ATM, 9:16, transparent) | Implemented | Automated + Playwright |
| Control `/control` (readiness, rules, LIVE mode, security panel) | Implemented | Automated + Playwright |
| Event pipeline (normalize → sign → outbox → transport → verify → dedupe → lanes) | Implemented | Unit + E2E + local Phoenix server |
| Rules engine / Animation Director / ambient lane | Implemented | Unit + E2E |
| Signatures (ECDSA P-256) + ReplayGuard | Implemented | Unit + E2E |
| Key storage (non-extractable IndexedDB key) | Implemented | Unit + E2E (Chromium only) |
| CSP + secret scanner | Implemented | Build + `npm run security:scan` |
| Listener (`listener/`: tiktok-unofficial + replay, health, `--check`, watchdog, graceful shutdown) | Implemented | Replay + simulated only |
| systemd unit `deploy/atm-listener.service` | Written | **Untested** |
| `/prism-check` probe page | Implemented | Chromium only |
| Supabase Realtime transport | Implemented | Local Phoenix-protocol server with real `@supabase/realtime-js`; **not** hosted Supabase |
| Vercel Preview | READY for commit `8773c85`; newest commit built after push | Read-only audit |
| Real TikTok LIVE | **Not tested** | — |
| PRISM Web Widget | **Not tested** | — |
| iPad audio / mic / music routing | **Not tested** | — |

## 2. Test evidence (separated)

- **Automated unit** (`npm test`): 89 tests. Re-run after final changes — see `docs/BUILD_VERIFICATION.md`.
- **Static**: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run security:scan` (scanner verified to flag planted secrets and pass the real build).
- **Playwright E2E (Chromium, local)**: `node e2e/run.cjs` suites main/ui/remote/autonomy. Last full run: all PASS, no FAIL (see build verification doc).
- **Simulator**: fake listener, replay file, local Phoenix server. Proves protocol and logic only.
- **Real Supabase hosted**: not tested. **Real TikTok**: not tested. **PRISM**: not tested. **Real audio**: not tested. **Safari/iOS WebKit**: not tested.

## 3. Blockers (need manual action)

1. **Vercel Authentication is ON for Previews** (`all_except_custom_domains`). PRISM's embedded browser cannot log in. Do NOT disable globally. Options: attach a custom domain to the branch, or use a protection-bypass/share link; confirm with `/prism-check` inside PRISM.
2. **No env vars set on Vercel.** Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Preview scope, then redeploy (values are inlined at build time). Anon/publishable key only — never service_role.
3. **Preview runtime unverified**: Vercel MCP fetch cannot pass protection, so `/control` and `/overlay` on Preview were not opened by me.
4. **Listener host**: needs an always-on Node ≥ 20 host (VPS). Procedure in `docs/LISTENER_HOST.md`.
5. **Supabase Broadcast channel is public** (anon key can publish/subscribe). Mitigated by signatures; abuse/quota is not blocked at channel level. Private channel + RLS authorization is a Production requirement.

## 4. Manual user steps (in order)

1. Vercel: add the two env vars (Preview), redeploy branch.
2. Make Preview reachable by PRISM (custom domain or bypass link).
3. Open `/control` on the controller device → Security → create keys. **Copy the listener key once** (shown a single time); copy the overlay URL (contains the public key `?pk=`).
4. Put `ATM_SIGNING_KEY`, Supabase URL/anon key and room in the listener env on the VPS (`deploy/listener.env.example`), start via systemd, check `--check` and the health endpoint.
5. Open the overlay URL in PRISM Web Widget; open `/prism-check` there first and compare to `docs/PRISM.md`.
6. Run the audio routing checklist (`docs/AUDIO_ROUTING.md`). Do not assume iPhone audio reaches the iPad.
7. Dry run with `ATM_SOURCE=replay`, then real LIVE per `docs/LIVE_TEST_PROCEDURE.md`.

## 5. Security risks (status of each finding)

| Finding | Severity | State |
|---|---|---|
| Private key in localStorage | High | Fixed: non-extractable IndexedDB key, one-time reveal, legacy migration. Tested in Chromium. |
| Replay of captured settings/clear | Medium | Fixed: ReplayGuard + monotonic ts. Tested. |
| No CSP | Medium | Fixed (production only). Not exercised in dev; verify in Preview. |
| Avatar referrer leak | Low | Fixed (`no-referrer`). |
| Ping flood amplification | Low | Fixed (throttled reply). |
| Public Broadcast channel | Medium | **Open** — signature-protected but unauthenticated transport; DoS/quota abuse possible. |
| Listener key lives in a VPS env file | Medium | Open — protect file permissions (0600), rotate if leaked. |
| Key revocation | Low | Rotation = new keys + new overlay URL + new listener env; no remote revocation list. |
| Unofficial TikTok library (AGPL, ToS risk, may break) | Business | Open — see `docs/SOURCE_COMPATIBILITY.md`. |

No claim of "secure" beyond the tests listed. No secret found in bundle/logs/URL by scanner; overlay URL carries only the public key.

## 6. Preview status

- Latest verified deployment before this pass: commit `8773c85`, READY, target null (not Production).
- After pushing this pass: re-check via Vercel; record state in the final report.
- Preview has no Supabase env → remote sync will not work until blocker 2 is done.

## 7. Production requirements (not done, do not do without approval)

- Real TikTok LIVE test passed and PRISM/iPad test passed.
- Private Supabase channel + authorization (or edge-function gate), rate limits.
- Dedicated Production env vars; custom domain; protection decided deliberately.
- Listener supervised on a VPS with log shipping and alerting; systemd unit tested.
- Legal review of the unofficial TikTok library vs. an official/partner API.
- Explicit owner approval before merging to main or promoting any deployment.
