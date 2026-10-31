# ASSET_LICENSES — rules, per-source license analysis, compliance procedure

> Not legal advice. Every source below must be **re-read on its own page at download time** (screenshot + URL + date saved). Marketplaces are **not** one license: license is per source and often per item.

Verification tags: **[V1]** read from primary source this session · **[V2]** from search snippets of official/third-party pages · **[V3]** assumption. See ASSET_CATALOG §0 for the network limit (most marketplaces were unreachable from the sandbox).

## 1. Per-source analysis

| Source | License | Commercial | Attribution | Redistribute raw files | Modify | AI-training clause | Special risks | Level |
|---|---|---|---|---|---|---|---|---|
| **Poly Haven** | CC0 (HDRIs, textures, models) | Yes | No (link appreciated) | Yes (CC0) | Yes | none seen | Real-world objects → trademark/privacy; some gun models removed over design copyright; no warranty. Website content itself is not CC0. | [V2] polyhaven.com/license, /faq |
| **ambientCG** | CC0 1.0 for assets + previews | Yes | No | Yes | Yes | none seen | none beyond CC0 | [V2] docs.ambientcg.com/license |
| **Kenney** | CC0 (stated on kenney.nl/support; corroborated by OpenGameArt/Gumroad listings) | Yes | No | Yes | Yes | none seen | Third-party **ports/wrappers** (e.g. Godot library) can carry another license (AGPLv3 seen on a wrapper). Only download from kenney.nl. "Sci-fi Sounds" license not seen. | [V2]/[V3] |
| **Quaternius** | CC0 per official pack pages (Sci-Fi Essentials Kit, Modular Sci-Fi Megakit) | Yes | No for CC0 | Yes | Yes | itch.io page says no generative AI used | **Ultimate Space Kit conflict:** Quaternius says CC0, Sketchfab copy says CC-BY + NoAI. Take only from quaternius.com and re-read. Patreon "source" tier has a different (paid) scope. | [V2] |
| **Khronos glTF-Sample-Assets** | **Per model** (read from each README): ToyCar CC0; GlassHurricaneCandleHolder, MetalRoughSpheres, IridescenceLamp = CC-BY 4.0 | CC0/CC-BY yes | CC-BY: yes (author + license link) | per model | per model | – | Khronos trademark/logo not licensed. Use only as private test fixtures, not shipped. | **[V1]** raw README files |
| **pmndrs/drei-assets** | **No LICENSE file** (404). README: HDRIs from HDRI Haven (Poly Haven CC0), Kenney prototype textures | undefined for the repo | – | – | – | – | Do not copy from this repo; take originals from Poly Haven / Kenney. Also a runtime CDN dependency (see TECH_DESIGN). | **[V1]** |
| **Sketchfab** | **Per model**: CC0 / CC-BY / CC-BY-SA / CC-BY-ND / CC-BY-NC / Standard | CC0 & CC-BY yes; **NC no**; ND forbids modification (optimizing/converting is a modification → avoid ND) | CC-BY: yes (dialog gives text) | CC0: yes; others per license | per license | Some models carry a **NoAI** notice | Login required; license can change; uploader may not own rights (stolen models exist); real brand ATMs = trademark. | [V2] help.sketchfab.com |
| **OpenGameArt** | **Per item** (CC0, CC-BY, CC-BY-SA, GPL, …) | per item | per item | per item | per item | – | Verify each page. "Low-Poly ATMs": CC0, OBJ, untextured. | [V2] |
| **Sonniss GDC Game Audio Bundle** | Proprietary EULA: royalty-free, worldwide, non-exclusive, perpetual-style; commercial OK | **Yes** | **No** | **No: only embedded in a project (game/film/app); no standalone redistribution, no resale, no competing library** | Yes (as part of a work) | **Yes: cannot be used to train AI models** (reported for the 2024 bundle) | **Public repo problem** (see §3). Terms changed between years → use the EULA PDF shipped with the exact bundle year. | [V2] third-party coverage + mirrored 2023 EULA |
| **Freesound** | **Per sound**: CC0 / CC-BY / CC-BY-NC | CC0 & CC-BY yes; NC no | CC-BY: yes | CC0 yes | yes | – | Use filter **CC0 only**; record URL/author. | [V3] (host unreachable) |
| **rawAmbience / other "royalty-free" packs** | Vendor EULA ("royalty-free, any project") | Yes per listing | No | Typically no standalone redistribution | – | – | **"Royalty-free" ≠ CC0.** Paid packs need user approval; read EULA. | [V2] |
| **Fab / CGTrader marketplace models** | Marketplace standard/royalty-free license | Usually yes | No | **No** (no redistribution of source files) | Yes | varies | Paid; raw file in a public repo = redistribution violation. | [V2] |
| **Own synthesis / own procedural code** | Author-owned, CC0 dedication in repo | Yes | No | Yes | Yes | – | Safest. | [V1] |
| **three.js / R3F / drei / rapier / gltf-transform** (code) | MIT / MIT / MIT / MIT / Apache-2.0 (rapier core) / MIT | Yes | Keep license notices (bundlers keep them; add a NOTICE file) | – | – | – | `tiktok-live-connector` (listener) is **AGPL-3.0** — unrelated to assets but remember it is isolated in `listener/`. | **[V1]** npm + LICENSE |

## 2. Hard rules for this project

1. **Allowed to ship in the repo/app:** own work, CC0, and CC-BY **only if** the credit is added to `CREDITS.md` + an in-app credits screen + the manifest.
2. **Never ship:** CC-BY-NC, CC-BY-ND (we optimize/convert), CC-BY-SA (viral on derivative works — avoid), "personal use only", any license not read, any model of a real brand's product/logo (ATM bank logos, real banknote designs).
3. **Quote the license, don't infer it:** each manifest entry stores `licenseName`, `licenseUrl`, `sourceUrl`, `author`, `retrievedAt`, `evidence` (screenshot path), `attribution` (required text or `none`).
4. **No bulk downloads.** One asset at a time, only what the approved prototype list needs.
5. Keep originals (unoptimized, with license evidence) **outside the public repo** (private storage) if the license forbids redistribution; ship only the optimized, embedded runtime copy where the EULA allows embedding.
6. "Banknote" art stays original and labelled virtual/not legal tender; no real note portraits/security features.

## 3. Decision needed: the repository is public [V1]

`akunsyarif-rgb/Tiktok-Live-Animation` is **public**. Consequences:

| Asset type | Public repo OK? |
|---|---|
| CC0 / own | Yes |
| CC-BY | Yes, with credits |
| **Sonniss / vendor "royalty-free" EULA audio** | **Risky:** committing the raw WAVs makes them downloadable standalone = prohibited "standalone redistribution". Options: (a) make the repo private; (b) keep Sonniss files out of git and inject them at build time from private storage (Vercel build secret/Blob) — still public once deployed under `/audio/…` URL, which is "embedded in an app" and generally allowed but legally grey; (c) skip Sonniss, use CC0/synthesis only. **Recommended: (c) for the open repo, (a)+(b) only if the user wants real recordings.** |
| Paid marketplace models | **No** (raw file redistribution) unless repo private and EULA allows embedding |

## 4. Compliance procedure per asset (checklist)

- [ ] Open the **source page**, read the license text (not just a badge). Screenshot.
- [ ] Confirm commercial use + no NoAI/ND/NC/SA. Confirm uploader is the author (Sketchfab).
- [ ] Record in `public/assets/licenses.json` (schema in ASSET_REQUIREMENTS §6).
- [ ] If attribution: add to `CREDITS.md` and in-app credits.
- [ ] Optimize (conversion = modification; fine for CC0/CC-BY).
- [ ] Re-verify at release; a changed license page invalidates future downloads, not past ones (keep evidence).

## 5. Credits/NOTICE skeleton (to add only with approved assets)

```
CREDITS.md
- <Asset name> — <Author> — <License> — <URL> — <what we changed>
NOTICE
- three (MIT), … (kept automatically in bundles; list here for humans)
```
