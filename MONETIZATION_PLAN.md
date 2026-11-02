# Monetization plan (hypotheses to validate, not facts)

All prices, margins and demand are **assumptions**. Nothing here is validated; do not build payments before step 1 below is proven.

## Customer & problem
- **Who:** Indonesian TikTok LIVE creators (chat/just-chatting, gaming, jualan live), small MCN/agencies running several accounts.
- **Problem:** gift/join reactions are manual or generic; good overlays cost money and need constant operation; creators want something that *runs itself* while they talk.
- **Our edge:** autonomous (no dashboard during LIVE), a recognisable ATM identity (virtual cash for gifts), transparent overlay for PRISM, runs on free-tier infra, deterministic rules (no AI cost), signed messages (no fake gifts on screen).

## Honest constraints
1. The event source is **unofficial** (can break, terms risk, AGPL). Selling "TikTok integration" as a guaranteed feature is risky: sell **overlay + setup**, disclose the dependency, offer simulator/replay mode.
2. The virtual banknotes must stay "UANG HIBURAN VIRTUAL / not legal tender"; no real-looking currency or bank branding (legal/platform risk).
3. Vercel Hobby is non-commercial: customer deployments need Pro or another host.
4. Per-tenant infrastructure and support time are the real costs, not licences.

## Packages (initial price hypotheses, IDR)
| Package | Contents | Price |
|---|---|---|
| Demo | ATM overlay, watermark, simulator + replay mode | Free |
| Creator | Overlay (ATM, rain window), your branding colours/name, rules presets, setup guide | Rp 149.000 one-time **or** Rp 49.000/mo |
| Pro | Creator + 3 premium room themes, gift animation packs, signed-room setup, priority fixes | Rp 99.000/mo |
| Setup service | Remote install: listener host, Supabase project, PRISM scene, test LIVE | Rp 350.000 – 750.000 one-time |
| Agency | up to 10 accounts, shared dashboard, white-label | Rp 499.000 – 1.500.000/mo |
Later (only with demand): asset packs (Rp 25–75k), custom commissioned theme (Rp 1.5–5 jt), subscription tiers.

## Unit economics (estimates)
Infra per active creator: Supabase free (shared project risk: use one project per ~10 creators or Pro Rp 400k/mo ÷ 10 = Rp 40k), listener host Rp 0–80k, support ≈ 1–2 h/month. Pro at Rp 99k/mo → gross margin ≈ 20–60 % depending on hosting/support; Setup service ≈ 60–80 % margin but time-bound. One-time Creator licence has the best margin but no recurring revenue.

## Validation (before any payment system)
1. Show a 60 s demo clip to 20 creators; ask for a pilot: **target ≥ 5 pilots, ≥ 2 willing to pay** Rp 99–149k.
2. Run 5 free pilot LIVEs with real TikTok events; measure: setup time, event loss, crashes, creator-reported "wow" moments.
3. Pre-sell Setup service to 3 creators (manual WhatsApp invoice).
4. Go/no-go: ≥ 30 % of pilots keep it for 4 weeks.

## 90-day roadmap
- **Days 1–14:** real-device + real-LIVE validation (`docs/LIVE_TEST_PROCEDURE.md`), fix what breaks; replay demo clip.
- **15–30:** branding presets (logo/colour/name), onboarding doc in Bahasa Indonesia, 5 pilots.
- **31–60:** 2 premium room themes, gift pack v1, simple tenant provisioning script (room + keys + listener env), legal review of terms/disclaimers.
- **61–90:** paid launch (WhatsApp/QRIS manual), measure churn, decide on subscription tooling and a second event source (official/partner API if one becomes available).
