# Deploy on Vercel

The web app (`/control`, `/overlay`) is a static Next.js build. No server functions, no secrets.

1. Project already linked to `akunsyarif-rgb/Tiktok-Live-Animation` (Vercel project `tiktok-live-animation`). Framework preset: Next.js. Build `npm run build`, install `npm install`, Node 22.
2. **Environment Variables** (Project → Settings → Environment Variables), for Preview and Production:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon / publishable key (**not** service_role)
   They are inlined at build time → **redeploy after changing them**.
   Without them the app still works (same-browser link only) and `/control` says "cross-device link: disabled".
3. Supabase: no tables, no SQL. Realtime Broadcast only. In Supabase → Realtime settings keep "Allow public access" enabled (the channel is a public channel protected only by the unguessable room code). Free tier: ~200 concurrent connections, 2 M messages/month, 10 msgs/s per client.
   Message budget: control pings every 5 s (≈ 17k/day if left open 24 h) plus events/acks/status. A 3-hour LIVE ≈ a few thousand messages.
4. **Production branch:** Vercel treats the repository's default branch as Production. At the time of writing the only branch is a feature branch, so that branch was deployed as "production". Create/choose a real `main`, set it as Production Branch, and review before merging. Other branches get Preview deployments.
5. Preview deployments may be behind Vercel Authentication (login wall). A PRISM web widget cannot log in → either disable protection for the project (Settings → Deployment Protection) or use the production URL for the LIVE.
6. Verify after deploy: open `/control` → "Connections" shows `Cross-device link: connected`.

Headers set in `next.config.ts`: `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (no camera/mic/geo), `Cache-Control: no-store` on `/control` and `/overlay`.
