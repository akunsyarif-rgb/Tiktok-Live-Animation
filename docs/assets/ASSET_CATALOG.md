# ASSET_CATALOG — TikTok LIVE Visual Engine (ATM · Marble Machine · Energy Reactor)

> Status: **research/proposal, awaiting user approval.** Nothing was downloaded, nothing was added to the app. No asset below is "approved" until the user signs off *and* its license is re-checked on the source page at download time.

## 0. How to read this catalog

Verification level of every claim:

| Tag | Meaning |
|---|---|
| **[V1]** | Read from the primary source during this session (npm registry, `raw.githubusercontent.com`, local file measurement). |
| **[V2]** | Seen only in web-search snippets of official or third-party pages. Likely right, **must be re-read on the source page before use**. |
| **[V3]** | Prior knowledge / assumption. **NOT VERIFIED.** |

**Network limit found:** from this sandbox `polyhaven.com`, `ambientcg.com`, `docs.ambientcg.com`, `kenney.nl`, `quaternius.com`, `sketchfab.com`, `freesound.org`, `opengameart.org`, `sonniss.com`, `cdn.jsdelivr.net`, `unpkg.com` do **not resolve**. Only the npm registry, GitHub (`raw.githubusercontent.com` per file) and web search work. So marketplace entries are source-level (license regime, categories, search keys), **not** pinned individual files with verified size/license. To pin exact files, either allow those hosts in the session network settings or have the user supply the download page URLs.

## 1. What the repository has today (audit, read-only) [V1]

| Item | Finding |
|---|---|
| Framework | Next.js 16.4.3 (App Router, Turbopack), React 19.3.1, TypeScript 5.9 strict, Tailwind 4.3 |
| 3D renderer | **None.** ATM is DOM + inline SVG + CSS transform/opacity animation. No `three`, no R3F, no physics, no GSAP/howler. |
| Audio engine | Own `AudioEngine` (`src/lib/audio/engine.ts`): Web Audio, sequential playback, mute/volume, HTMLAudio + oscillator fallbacks, auto-activate attempt. |
| Static assets | `public/audio/` only: 5 WAV (processing 123,522 B · cash_dispense 202,902 B · gift_processing 167,624 B · premium_dispense 335,204 B · success 52,964 B) = **876 KB**. Mono 44.1 kHz 16-bit. |
| Asset license | All 5 WAV are original, procedurally synthesized by `scripts/generate-audio.mjs` (CC0 by the author). Not real recordings. |
| Models / textures / HDRI | **None.** Banknotes are inline SVG (original, labelled virtual). |
| JS shipped | 712,744 B uncompressed JS in `.next/static` (all routes, incl. lazy realtime client). |
| Current overlay performance | Headless Chromium on a desktop, 540×960, during a Gift Large transaction: **535 frames in 9 s, avg 16.67 ms, p95 16.7 ms, max 16.8 ms (= 60 fps)**; JS heap **9.5 MB**; **86 DOM nodes**; layout count 0 during animation; page load 700 ms. **This says nothing about iPad/PRISM GPU behaviour [NOT VERIFIED on device]**, it is only a DOM-baseline. |
| Repo visibility | **Public** (`visibility: public`), default branch `claude/phase0-atm-prototype` [V1]. This matters for licensing (see ASSET_LICENSES §3). |

## 2. Libraries (npm registry, measured) [V1]

| Package | Version | License | Peer constraints | Note |
|---|---|---|---|---|
| `three` | 0.187.0 latest (use **0.186.1**) | MIT | – | `postprocessing` 6.39.5 requires `three >=0.168 <0.187` → **pin three to 0.186.x** if postprocessing is ever used |
| `@react-three/fiber` | 9.8.2 | MIT | `react >=19 <19.4`, `three >=0.156` | OK with React 19.3.1; **blocks React 19.4+** until R3F updates |
| `@react-three/drei` | 10.7.9 | MIT | `react ^19`, `@react-three/fiber ^9`, `three >=0.159` | default `useGLTF` pulls the Draco decoder from `www.gstatic.com`; `Environment` presets/matcaps/normals/Cloud pull from `cdn.jsdelivr.net/gh/pmndrs/drei-assets@master` (verified by grepping the installed package) → **runtime third-party CDN dependency; unacceptable for PRISM/offline unless self-hosted** |
| `@react-three/rapier` | 2.2.0 | MIT (LICENSE file read) | `react ^19`, `@react-three/fiber ^9.0.4` | pulls `@dimforge/rapier3d-compat` 0.21.0 (Apache-2.0, 14.7 MB unpacked, WASM inlined) |
| `@react-three/postprocessing` / `postprocessing` | 3.2.2 / 6.39.5 | MIT / Zlib | see above | alpha/transparent-canvas caveat (TECH_DESIGN §4) |
| `@gltf-transform/cli` | 4.5.1 | MIT | Node ≥ 18 | offline optimization tool (dev-only) |
| `meshoptimizer` | 1.3.0 | MIT | – | meshopt compression for GLB |

**Measured bundle cost** (esbuild, minified, gzip, includes React+ReactDOM ≈ 60 KB gz where React is used) [V1, measured in a scratch dir, not in the repo]:

| Variant | min | gzip |
|---|---|---|
| plain `three` (WebGLRenderer + Mesh) | 519 KB | **130 KB** |
| plain `three` + GLTFLoader + Meshopt decoder + RoomEnvironment + PMREM + InstancedMesh | 630 KB | **161 KB** |
| R3F + three (Canvas, mesh) incl. React | 1124 KB | 311 KB |
| + drei (`useGLTF`, `Instances`) | 1198 KB | 333 KB |
| + `@react-three/postprocessing` Bloom | 1289 KB | 358 KB |
| R3F + **Rapier** physics | 3334 KB | **1132 KB** |

Today's whole app JS is ~713 KB uncompressed; a Rapier build would add ~0.8 MB gzip on top → **physics is the single most expensive decision.**

Three.js decoders shipped inside the `three` package (self-hostable, no CDN) [V1]: `meshopt_decoder.module.js` 29 KB · Draco `draco_decoder.wasm` 192 KB + `draco_wasm_wrapper.js` 58 KB · Basis/KTX2 `basis_transcoder.wasm` 527 KB + js 57 KB. **`RoomEnvironment.js` exists** in `three/examples/jsm/environments/` → a zero-asset image-based-lighting environment.

## 3. Cross-theme asset sources

| ID | Source | What | License regime | Commercial | Attribution | Fit | Risk | Level |
|---|---|---|---|---|---|---|---|---|
| X-1 | **Poly Haven** — https://polyhaven.com/license , https://polyhaven.com/faq | HDRIs, PBR textures, 3D models | **CC0** for all assets; site content itself is not CC0. Cannot claim authorship/relicense. | Yes | Not required (a link is appreciated) | High for HDRI + metal textures | Some models depict real-world objects → check trademark/privacy; no warranty | [V2] (official pages seen via search; fetch blocked) |
| X-2 | **ambientCG** — https://docs.ambientcg.com/license | PBR materials (metal, painted metal, plastic…), HDRI, some models | **CC0 1.0** for all downloads and previews | Yes (even redistribution as files) | Not required | High for metals/concrete/rubber | Download sizes (1K–8K zips) must be down-scaled; check each material's maps | [V2] |
| X-3 | **three.js `RoomEnvironment`** (in `three` MIT package) | Procedural studio IBL | MIT code, no art asset | Yes | Keep MIT notice (bundled automatically) | **Best default env for metal/glass**, 0 KB texture | Looks "studio", not themed | [V1] |
| X-4 | **Kenney** (kenney.nl) | CC0 models, textures, **audio** (Interface Sounds ≈100 files, Impact Sounds 130+, Sci-fi Sounds) | CC0 per Kenney (support page not reachable; OpenGameArt/Gumroad listings say CC0) | Yes | Not required | Medium (stylized); audio useful | A Godot-wrapper port showed AGPLv3 — that is wrapper code, **download from kenney.nl only, never from ports**. Sci-fi Sounds license not seen → verify. | [V2]/[V3] |
| X-5 | **Quaternius** — https://quaternius.com/packs/scifiessentialskit.html , https://quaternius.com/packs/modularscifimegakit.html | Low-poly sci-fi kits (FBX/OBJ/glTF) | **CC0** on official pages. **Conflict:** "Ultimate Space Kit" on Sketchfab shows *CC-BY + NoAI* while Quaternius says CC0 → take it only from quaternius.com and re-read | Yes | None for CC0 | Low–medium (flat low-poly style clashes with a realistic ATM; OK for Reactor props/pipes/panels) | Style consistency; per-pack license can differ | [V2] |
| X-6 | **Khronos glTF-Sample-Assets** (GitHub) | Material/transmission/iridescence **test fixtures** | **Per model:** ToyCar = CC0 (5.4 MB); GlassHurricaneCandleHolder = CC-BY 4.0 Wayfair (2.7 MB); MetalRoughSpheres = CC-BY 4.0 (11.2 MB); IridescenceLamp = CC-BY 4.0 (4.1 MB). Khronos logo restricted. | CC0/CC-BY yes | CC-BY needs credit | **Use only as local test fixtures to validate glass/metal rendering on Safari; do not ship** | Too heavy unoptimized; 150 models, mixed licenses | [V1] |
| X-7 | **pmndrs/drei-assets** (GitHub) | HDRIs, matcaps, normal maps | **Repository has no LICENSE file** (raw `LICENSE` = 404). README says HDRIs from HDRI Haven (= Poly Haven CC0), prototype textures from Kenney | – | – | Do **not** depend on it (also a CDN runtime risk) | License gap → take the original from Poly Haven instead | [V1] |
| X-8 | **Sketchfab** — help: https://help.sketchfab.com/en/articles/16152215-crediting-users-for-3d-model-downloads | User uploads | **Per model**: CC0, CC-BY, CC-BY-SA/ND/NC, or Standard. CC-BY needs credit text (provided in download dialog). Some models carry a NoAI notice. Download requires login. | CC0 / CC-BY yes; NC no; ND = no modification (conversion/optimization is risky) | CC-BY: yes | Highest variety (ATM, marble run, reactor) | Quality & license vary; **never assume**; keep a screenshot/URL of the license at download time | [V2] |
| X-9 | **OpenGameArt** — "Low-Poly ATMs" https://opengameart.org/node/44474 | Low-poly ATM pack | **CC0**, `.obj`, no textures (per search snippet) | Yes | No | Reference/base mesh only; low-poly look | Needs conversion + texturing; license to be re-read | [V2] |
| X-10 | **Fab / CGTrader** ATM models (https://www.cgtrader.com/3d-models/electronics/other/atm-machine-low-poly ; a free 1,262-tri Bitcoin ATM on Fab) | Marketplace models | CGTrader listing ≈ US$19.99 royalty-free; Fab free item license not seen | Depends | Depends | – | **Paid or unclear → not proposed**; any purchase needs explicit user approval | [V2] |

## 4. Theme 1 — ATM Machine

Current state: DOM/SVG ATM (production-ready). Proposed 3D "upgrade" keeps it as **Tier-0 fallback**.

| ID | Component | Recommended source | Format / size target | License | Fit | Risk | Level |
|---|---|---|---|---|---|---|---|
| A-1 | ATM body (chassis, bezel, keypad, card reader, cash door) | **Procedural** (extruded rounded boxes, bevels) — no external model | code only | n/a (own) | Exact match to current design; avoids a trademarked real-brand ATM | More modelling code | [V3] |
| A-2 | Reference/mesh base alternative | OpenGameArt Low-Poly ATMs (X-9) | OBJ → GLB ≤ 300 KB | CC0 [V2] | Low | untextured low-poly; verify | [V2] |
| A-3 | Banknote (virtual rupiah-inspired) | **Existing SVG → CanvasTexture** (1 texture per denomination, 512×240) + one shared plane geometry, `InstancedMesh` for bundle | 6 textures ≈ 40 KB each WebP | own | Perfect, keeps "UANG HIBURAN VIRTUAL" disclaimers legible | text must stay legible at 540×960 | [V1 repo] |
| A-4 | Brushed/painted metal PBR | ambientCG / Poly Haven metal (X-1/X-2) | 1K albedo+normal+ORM packed, WebP/KTX2 ≈ 300–600 KB total | CC0 [V2] | High | pick **one** metal set; mobile memory | [V2] |
| A-5 | Screen glow / indicator LEDs / cash-slot light | **Procedural** emissive + additive quad | 0 KB | own | High | none | [V3] |
| A-6 | Internal mechanism cut-away (rollers, belt, cassette) | **Procedural** (cylinders + animated UV belt) | 0 KB | own | High | none | [V3] |
| A-7 | Environment | `RoomEnvironment` (X-3) or one small Poly Haven studio HDRI converted to PMREM (≤ 256×128 `.hdr` ≈ 100–300 KB) | – | MIT / CC0 | High | HDRI look must match | [V1]/[V2] |
| A-8 | Audio — electronic processing/beeps | Keep current synth + optionally Kenney Interface Sounds (X-4) | WAV/M4A ≤ 30 KB each | CC0 [V2] | Medium | Kenney UI sounds feel "app-like", not ATM | [V2] |
| A-9 | Audio — motor/roller/paper/shutter | Sonniss GDC (X-12 below) or rawAmbience packs, or own synthesis | WAV mono ≤ 150 KB each | see ASSET_LICENSES | **Best realism**, replaces the placeholder synthesis | Sonniss no-standalone-redistribution vs **public repo** | [V2] |

## 5. Theme 2 — Kinetic Marble Machine

Searches for open marble-run projects/GLB with clear license returned **nothing usable** [V2] → plan is **procedural**.

| ID | Component | Recommended source | Size target | License | Fit | Risk | Level |
|---|---|---|---|---|---|---|---|
| M-1 | Marbles (steel/glass/colored) | `SphereGeometry(24×16)`, **one `InstancedMesh`** (≤ 200), env-map reflection | 0 KB | own | High | none | [V3] |
| M-2 | Tracks / rails / spirals | `TubeGeometry` / lathe along `CatmullRomCurve3` splines authored in code; deterministic path graph | 0 KB | own | High | spline authoring effort | [V3] |
| M-3 | Gears / cogs / wheels | **Parametric gear profile** (extrude shape, 16–40 teeth) in code; instanced where equal | 0 KB | own | High | none | [V3] |
| M-4 | Glass tube / globe | Thin-walled transparent shell: `MeshPhysicalMaterial` with **fake** glass (opacity + env reflection + fresnel rim). **Avoid real `transmission`** on iPad (extra full-scene render pass) | 0 KB | own | High | transmission cost → [NOT VERIFIED on device] | [V3] |
| M-5 | Wood/metal/rubber textures | ambientCG / Poly Haven (X-1/X-2), 1K max, 1–2 sets | ≤ 600 KB | CC0 [V2] | High | – | [V2] |
| M-6 | Optional hero prop (e.g. a clockwork/wheel set) | Sketchfab CC0 (X-8) — **only after per-model license check**, decimate to ≤ 20k tris, Meshopt | ≤ 1 MB | per model | optional | license/quality unknown | [V3] |
| M-7 | Audio — marble roll/clack/tink, ratchet, gear, bell/chime | Kenney **Impact Sounds** (130+, CC0 [V2]) + Sonniss/rawAmbience mechanical packs or own synthesis | 12–20 clips, ≤ 40 KB each | see ASSET_LICENSES | High | "royalty-free" ≠ CC0 | [V2] |

## 6. Theme 3 — Energy Reactor

| ID | Component | Recommended source | Size target | License | Fit | Risk | Level |
|---|---|---|---|---|---|---|---|
| R-1 | Core (glowing sphere/crystal) | Icosphere + **custom fresnel/noise shader** (emissive, animated by uniform) | 0 KB | own | High | shader cost on iPad (keep ≤ 40 ALU/frag) | [V3] |
| R-2 | Rotating rings / gyroscope | Torus/ring geometry, instanced segments, rotation by time | 0 KB | own | High | none | [V3] |
| R-3 | Turbine / blades / pipes / frame | Procedural; optional Quaternius Sci-Fi Essentials/Modular Megakit props (X-5) for panels/pipes | ≤ 800 KB GLB | CC0 [V2] | Medium (low-poly) | style mismatch, license re-read | [V2] |
| R-4 | Energy particles / sparks / arcs | **GPU points + additive sprite** (one `Points`, pooled 500–1,500) ; lightning = pooled `Line2`/ribbon with jittered noise | 1 sprite 128×128 ≈ 5 KB | own | High | overdraw on iPad (cap additive layers) | [V3] |
| R-5 | Glow/bloom | **Fake**: emissive + additive halo quads. Real bloom only with `AdaptiveDpr` + tier switch | 0 KB | own | High | `postprocessing` + transparent canvas alpha → [NOT VERIFIED] | [V3] |
| R-6 | Metal/hazard textures | ambientCG / Poly Haven (X-1/X-2) | ≤ 500 KB | CC0 [V2] | High | – | [V2] |
| R-7 | Audio — low hum loop, charge-up riser, discharge/zap, cooldown, alarm | **Own synthesis** (oscillators + filtered noise; already have the generator) ± Kenney Sci-fi Sounds (verify license) | 6–10 clips ≤ 60 KB | own / CC0 [V3] | **Synthesis suits energy sounds best, zero license risk** | realism judged by ear (agent cannot listen) | [V3] |

## 7. Audio (all themes)

| ID | Source | License | Notes |
|---|---|---|---|
| S-1 | **Own synthesis** (`scripts/generate-audio.mjs`) | CC0 (author) | Already in repo; extend for reactor hum/charge/zap and for chimes. Zero license risk. Placeholder realism for mechanical sounds. |
| S-2 | **Kenney audio** (Interface, Impact, Sci-fi) | CC0 [V2]; Sci-fi Sounds not confirmed [V3] | OGG files: convert to **WAV/M4A/MP3** for Safari certainty (Ogg support on Safari is version-dependent, NOT VERIFIED). |
| S-3 | **Sonniss GDC Game Audio Bundle** (yearly free bundles) — https://sonniss.com/gdc-bundle-license (not reachable); mirrored 2023 EULA found | Royalty-free, worldwide, non-exclusive, commercial OK, **no attribution** [V2]; **no standalone redistribution** (only embedded in a project); **no AI training** (2024 note) [V2] | Best mechanical realism. **Our repo is public → committing raw Sonniss WAVs = standalone redistribution risk.** Needs a decision (ASSET_LICENSES §3). |
| S-4 | **Freesound** (CC0 filter) | Per sound: CC0 / CC-BY / CC-BY-NC | Host unreachable here; accept **CC0 only**, record URL+author+date per file. |
| S-5 | rawAmbience "Free Mechanical Sound Effects" (Gumroad) / paid 201-file pack (US$15) | "Royalty-free, any project" per listing [V2]; free pack license text not seen | Paid → user approval; free → read license first. |

## 8. Recommendation summary (for approval)

1. **Do not buy/download models for the MVP.** All three themes can be built from procedural geometry + 2–4 CC0 textures + `RoomEnvironment` + synthesized/CC0 audio → smallest size, no license debt, no "stock-model" look.
2. Textures: pick **one metal + one wood/rubber** per theme from Poly Haven/ambientCG (CC0), 1K, WebP/KTX2.
3. Audio: extend own synthesis (reactor), Kenney Impact (marble), and decide on Sonniss for ATM mechanics **after** resolving the public-repo question.
4. Keep the DOM ATM as the always-available fallback.
5. Real marketplace pinning (exact files, sizes, license screenshots) is **BLOCKED** until the listed hosts are reachable or the user provides links.
