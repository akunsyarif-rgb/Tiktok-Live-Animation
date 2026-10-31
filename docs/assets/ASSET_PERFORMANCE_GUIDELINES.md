# ASSET_PERFORMANCE_GUIDELINES — budgets, tiers, fallbacks, test protocol

Targets: **Safari iPad**, **iPhone Safari**, **PRISM Live Studio web/browser source**. Tags: **[V1]** measured/read this session · **[V3]** engineering assumption or general knowledge, **NOT VERIFIED on device**. The agent has no iPad/iPhone/PRISM; every device number below is a *budget to be confirmed*, not a result.

## 1. Baseline measured today [V1]
DOM/SVG ATM, headless desktop Chromium, 540×960: 60 fps steady (avg 16.67 ms, max 16.8 ms over 535 frames), JS heap 9.5 MB, 86 DOM nodes, 0 layouts during animation, 700 ms load, 713 KB uncompressed JS (all routes), 876 KB audio. **Any 3D theme must not make the stream worse than this on the same hardware, which is why the DOM ATM stays as the fallback tier.**

## 2. Budgets (per theme, per tier)

| Metric | Tier 1 (iPad/desktop) | Tier 2 (iPhone / weak) | Tier 0 fallback |
|---|---|---|---|
| Renderer | WebGL2 (WebGL1 acceptable), `alpha:true`, `antialias:false` + FXAA-free | same, DPR 1 | DOM/SVG (existing) |
| Draw calls | ≤ 80 (target 50) | ≤ 40 | – |
| Visible triangles | ≤ 100k | ≤ 40k | – |
| Dynamic lights | ≤ 2 (prefer 0: env + emissive) | 0 | – |
| Shadows | none (fake blob/AO texture) | none | – |
| Texture memory (GPU) | ≤ 48 MB | ≤ 24 MB | – |
| Texture size | ≤ 1024² (most 512²) | ≤ 512² | – |
| Particles | ≤ 1,500 points, ≤ 3 additive full-screen-ish layers | ≤ 500, 1 layer | – |
| Frame rate | cap **30 fps** render (stream is encoded ≈ 30 fps), allow 60 on `?fps=60` | 30 | CSS |
| Render scale | DPR `min(devicePixelRatio, 1.5)`, auto-drop to 1 | 1 | – |
| JS added (gz) | ≤ 170 KB (plain three) / ≤ 360 KB (R3F+drei+bloom) | same | 0 |
| GLB total per theme | ≤ 6 MB (each ≤ 1.5 MB) | ≤ 3 MB | – |
| Audio per theme | ≤ 1 MB total, ≤ 12 simultaneous-loaded buffers | ≤ 600 KB | – |
| Time to first frame | ≤ 2.5 s on 4G | ≤ 3.5 s | ≤ 1 s |
| JS heap | ≤ 120 MB | ≤ 80 MB | ≤ 20 MB |

Rationale/assumptions [V3]: iOS Safari kills tabs on memory pressure; mobile GPUs are fill-rate bound (transparent overdraw, full-screen passes, `transmission`, bloom) far more than vertex bound. A transparent overlay always pays **alpha blending over the whole canvas** → keep the canvas only as large as the visible stage (540×960 logical).

## 3. Tier selection and fallback chain

```
detect → WebGL2/1 context OK? ── no ──► Tier 0 (DOM/SVG)
          │ yes
          ▼
probe 1.5 s of rendering (idle scene) with PerformanceMonitor-style sampler
   avg frame > 22 ms (<45 fps at a 30 fps cap)  ──► drop: DPR→1 → disable particles layers → disable glow quads → Tier 2
   still > 33 ms after 5 s                       ──► Tier 0
```
- Feature-detect, never user-agent sniff. Query `WEBGL_debug_renderer_info` only for diagnostics (may be blocked).
- User override: `?tier=0|1|2`, `?fps=30|60`, `?dpr=1`. Overlay `?debug=1` shows tier, fps, draw calls, triangles, texture count, heap.
- Downgrade is **sticky for the session** (no flip-flopping on a live stream); upgrade only after reload.
- Effects that are **optional** and first to go: glow quads → particle layers → env-map reflections (fall back to baked matcap-like gradient) → animated normal maps → everything but the core silhouette.

## 4. Rules that matter most

1. **Deterministic, time-driven animation** (`t = now - t0`, not frame counting) so a throttled/dropped frame cannot desync with audio and the queue.
2. **Instancing** for repeated objects (marbles, notes, gear teeth, ring segments); **merge** static geometry; share materials (≤ 12 materials).
3. **Pool** everything transient (particles, arcs, notes, marbles); zero allocation inside the frame loop; reuse vectors/matrices.
4. Avoid `MeshPhysicalMaterial.transmission/thickness` on mobile (extra scene render); fake glass instead (opacity + env reflection + fresnel).
5. No real-time shadows, no SSAO, no depth-of-field; **no full-screen postprocessing in Tier 1** unless proven on the iPad (alpha-canvas bloom caveat in TECH_DESIGN §4).
6. Upload textures once, `dispose()` on theme switch; call `renderer.info` in debug HUD to catch leaks.
7. Keep shaders ≤ ~40 ALU ops/fragment, no loops with dynamic bounds, `precision mediump` where safe, no derivatives-heavy noise on the full screen (bake noise into a 128² texture instead).
8. Load order: UI shell → fallback DOM ATM → (lazy) 3D chunk → assets by tier; never block the stream's first frame on 3D.
9. No third-party CDN at runtime (drei presets, gstatic Draco, jsdelivr) — **self-host decoders/HDRIs** [V1 finding]. A blocked CDN inside PRISM would otherwise silently break the scene.

## 5. Lifecycle / recovery (must be implemented and tested)

| Event | Required behaviour |
|---|---|
| `webglcontextlost` | `preventDefault()`, stop loop, show Tier 0, on `webglcontextrestored` recreate GPU resources from retained CPU data and resume at the **current queue state** |
| tab hidden / PRISM source inactive (`visibilitychange`, `pagehide`) | pause render loop (rAF stops anyway); **do not** advance a "virtual clock" blindly: on resume, finish/skip the active animation to its end state, then continue the queue; reset particle pools |
| tab shown again | `audioContext.resume()`; re-sync timeline; verify context state; if > 5 s hidden, snap to idle |
| low memory / repeated context loss (≥ 2 in 60 s) | permanently drop one tier |
| resize / orientation | resize canvas to logical 540×960 × DPR, re-fit by CSS scale (existing `StageScaler` approach); no re-creation |
| audio interrupted (call/Siri) | existing engine already tries `resume()` before each sound; add a visual-only continuation (animation never waits for audio longer than its own timeline) |

## 6. Audio latency & sync [V3 targets]
- Preload and **decode** all sounds for the active theme before first use; schedule with `AudioContext.currentTime` (not `setTimeout`) for hits that must align with visuals; visuals driven from the same clock (`ctx.currentTime` offset) → no drift.
- Budget: sound-to-visual offset ≤ 50 ms; if `ctx.baseLatency`/`outputLatency` are available (Safari support NOT VERIFIED) log them in diagnostics and compensate.
- Voices: ≤ 8 simultaneous sources; per-theme gain staging + one master limiter (`DynamicsCompressorNode`).
- Loops (hum, rolling): crossfade via two gain nodes; pause when idle tier is silent-by-design.

## 7. Test protocol (to be run by a human with devices — agent can only run the headless part)

**Agent-runnable (desktop Chromium, headless; indicative only):** frame-time histogram via rAF, JS heap, DOM nodes, bundle gzip size, `renderer.info` counters, asset-size gate, context-loss simulation (`WEBGL_lose_context` extension), visibility simulation, offline/CDN-blocked run.

**Needs hardware (PENDING EXTERNAL VALIDATION):**
- [ ] iPad (note model + iPadOS): 10-min soak of each theme in Safari, Web Inspector Timelines (CPU/GPU), memory graph stays flat (no growth > 10 %).
- [ ] iPhone (oldest supported): same, Tier 2.
- [ ] PRISM Live Studio browser source: does WebGL work? transparent canvas keeps alpha? fps? CPU/GPU load in PRISM stats? app thermal state after 30 min?
- [ ] Background/foreground, lock/unlock, switch PRISM scenes: context loss/restore, audio resume, no duplicate or lost transactions.
- [ ] Audio: sync by ear/video capture (record the stream, measure offset between visual hit and sound), loudness vs mic/music levels.
- [ ] Battery/thermals at 30 fps vs 60 fps.

Pass bar: Tier 1 sustained ≥ 28 fps at 30-fps cap with p95 frame < 40 ms, no context loss in 10 min, heap growth < 10 MB over 10 min, zero JS errors, queue integrity unchanged (same 54 unit + 46 E2E checks still green).

## 8. Asset gate (CI, proposed)
Fail the build if: any GLB > 1.5 MB or theme GLB total > 6 MB; any texture > 1024²; total `public/assets` per theme > budget; asset missing in `licenses.json`; decoder/HDR/font URL points to a third-party host.
