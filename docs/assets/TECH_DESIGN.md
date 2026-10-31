# TECH_DESIGN — rendering stack evaluation and architecture proposal

Tags: **[V1]** verified/measured this session · **[V3]** assumption (NOT VERIFIED).

## 1. Compatibility with the actual project [V1]
React **19.3.1**, Next **16.4.3** (App Router), TypeScript strict. Overlay is a client page rendered inside Safari/PRISM.

| Library | Version | React/three constraint | Verdict |
|---|---|---|---|
| three | **0.186.1** (0.187.0 is latest) | pin `<0.187` because `postprocessing` 6.39.5 peer is `three >=0.168 <0.187` | use pinned |
| @react-three/fiber | 9.8.2 | `react >=19 <19.4` → fine now, **will block React 19.4+** | optional |
| @react-three/drei | 10.7.9 | `react ^19`, `fiber ^9` | selective use only |
| @react-three/rapier | 2.2.0 | `react ^19`, `fiber ^9.0.4` | **not recommended by default** |
| @react-three/postprocessing / postprocessing | 3.2.2 / 6.39.5 | needs `three <0.187` | **not for Tier 1** |
| @gltf-transform/cli, meshoptimizer | 4.5.1 / 1.3.0 | dev-only | yes (offline) |

Not verified: R3F inside Next 16 App Router with Turbopack (needs `'use client'` + `dynamic(import, {ssr:false})`). It is a standard pattern, but must be proven in the first prototype build.

## 2. Evaluation

| Option | Pros | Cons | Decision |
|---|---|---|---|
| **Plain three.js** behind a thin React wrapper | smallest (130–161 KB gz measured), imperative timeline fits our state machine, no reconciler in the frame loop, no R3F/React version lock, full control of disposal/pooling | more boilerplate; no JSX scene graph | **Recommended for the shipped overlay** |
| React Three Fiber | fast to prototype, declarative, ecosystem | +≈120 KB gz over plain three (311 vs 130–161 incl. React), React peer cap, re-render discipline needed | acceptable **for prototypes only**, or if the user prefers DX |
| Drei | `useGLTF`, `Instances`, `PerformanceMonitor`, `AdaptiveDpr`, `Html` helpers | default Draco decoder from **gstatic**, `Environment` presets / matcaps / normals / Cloud from **jsdelivr** (found in installed package) → third-party runtime dependency; pulls many unused deps | only with `useGLTF.setDecoderPath('/draco/')`/meshopt and **no preset-based helpers** |
| React Three Rapier / Rapier | real rigid-body physics | **+~0.8 MB gz** (measured 1132 KB vs 311 KB), WASM init, non-trivial determinism across devices/frame rates, CPU cost per body | **No for ATM/Reactor; Marble only if free-form physics is explicitly wanted.** Prefer scripted/analytic motion (below) |
| three postprocessing (Bloom etc.) | pretty glow | extra render targets + full-screen passes (GPU cost on iPad); **alpha**: bloom/composer on a transparent canvas commonly loses or tints alpha → transparent overlay in PRISM would look wrong [V3]; tight `three` peer | **No in Tier 1.** Fake glow with emissive + additive halo sprites |
| Raw CSS/SVG (current) | already works, 86 DOM nodes, 60 fps | no real depth/reflection | keep as Tier 0 |

## 3. Recommended architecture (proposal, no code yet)

```
 existing: queue / controller / audio engine / transport  (unchanged)
                │ phase events + event data (join/small/medium/big/special)
                ▼
         TierMapper  (event → tier + parameters, proposal in ASSET_REQUIREMENTS §1)
                ▼
         ThemeDirector (one per theme: ATM | Marble | Reactor)
           ├─ build(): creates scene objects once, pools, materials
           ├─ idle(t), play(tier, params) → deterministic timeline  f(t)
           ├─ cues: [{t, sound, light, particle}]  ← single source for visuals AND audio
           └─ dispose()
                ▼
         Renderer  Tier0 DOM/SVG │ Tier1/2 three WebGL (canvas, alpha)
```
- The controller already enforces one transaction at a time; a theme only needs `phase` + `plan`. New themes plug into the same `AtmSnapshot` (extend `plan` with `tier`), so queue, dedupe, recovery, transport and tests are reused.
- **Procedural + deterministic first.** Motion = closed-form functions of time: ease curves, spline arc-length parameterization for marbles, `sin` ring rotation, noise via precomputed 128² texture. No per-frame physics integration → identical result on any frame rate, trivially seekable (needed for visibility-resume "snap to end").
- **Marble "chain reaction" without a physics engine:** author a **graph of segments** (spline + gravity profile). Marble position along a spline `s(t)` computed from energy conservation (`v = sqrt(2 g Δh)` with friction factor), pre-baked into a lookup table at build. Triggers (bell, see-saw, gate) fire at known `s` values → deterministic cascades; random variety comes from selecting among a few pre-authored routes by event id (seeded RNG). Cheap collisions: marble-marble spacing along the same spline (1D), no 3D contacts.
- **Instancing & pooling:** `InstancedMesh` for marbles/notes/ring segments/gear teeth; `Points` for particles; ring-buffer pools sized per tier.
- **Shaders:** a handful of `onBeforeCompile` patches or tiny `ShaderMaterial`s (core fresnel/noise, scrolling belt UV, energy arc ribbon, additive halo). Bake expensive noise to textures.
- **Audio:** keep `AudioEngine`; extend with `playAt(id, when)` using `AudioContext.currentTime` scheduling and per-theme preloaded banks; cues from the timeline (no `setTimeout` for hits).
- **Loading:** `import()` of the theme chunk only when selected; renderer chunk lazy; assets by tier; fallback tier shown until ready.
- **Tests that carry over:** all queue/transport/recovery tests stay valid (logic unchanged). New: timeline determinism (same seed → same cue list), cue ↔ audio-asset existence, asset gate, tier downgrade logic, context-loss simulation, offline (no third-party host) run.

## 4. Transparent canvas notes [V3, must be proven on device]
- `new WebGLRenderer({alpha:true, premultipliedAlpha:true, antialias:false})`, `setClearColor(0,0)`; sort additive layers last; avoid `toneMapping` surprises on alpha edges.
- PRISM must support transparent web sources with WebGL canvas; **unknown**. First hardware test: a 20-line page drawing a semi-transparent colored quad over the live camera.
- If transparent WebGL fails in PRISM, fallback is Tier 0 (DOM) or a chroma-key background option (`?bg=green`) — decide with the user.

## 5. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| PRISM web source lacks WebGL / alpha | whole 3D plan | Tier 0 fallback exists; hardware smoke test **before** investing |
| iPad GPU thermal/throttle | dropped frames on stream | 30 fps cap, tiering, soak test |
| Procedural art looks "generic/AI-slop" | visual quality | art direction doc per theme (reference boards, palette, material rules, signature moves) before modelling; 1 hero detail per theme |
| License debt from stock models | legal | procedural-first, CC0-only textures, ASSET_LICENSES rules |
| Bundle growth | slower load | lazy chunks, plain three, budget gate |
| React/R3F version lock | upgrade friction | plain three for production |
