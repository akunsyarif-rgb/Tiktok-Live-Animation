# ASSET_REQUIREMENTS — what each theme needs, formats, naming, pipeline

Scope: requirements only. **No implementation** until the user approves ASSET_CATALOG + this plan.

## 1. Event tiers (shared by all themes) — proposal

The existing queue/controller stays. A new **tier mapper** converts an `AtmEvent` into a visual tier. Current events only have 3 types, so *medium* and *special* need either more event types or a diamond-based mapping (listener already computes `gift.diamonds`).

| Tier | Trigger (proposal, editable in UI) | Duration target |
|---|---|---|
| idle | no active event | loop, ≤ 4 s seamless |
| join | `VIEWER_JOIN` | 2.5–3 s |
| small | gift < 10 💎 | 3–4 s |
| medium | gift 10–999 💎 (new) | 5–6 s |
| big | gift 1,000–9,999 💎 (today's `GIFT_LARGE`) | 7–8 s |
| special | ≥ 10,000 💎 or a named gift list (new) | 10–12 s |

Open decision for the user: thresholds, whether to add `GIFT_MEDIUM`/`GIFT_SPECIAL` to the protocol (backward compatible by `parseMessage` versioning).

## 2. Per-theme asset requirements

### 2.1 ATM
| Group | Needed | Source plan | Budget |
|---|---|---|---|
| Geometry | chassis, bezel, screen, keypad (12 keys + 3), card reader, cash door/presenter, internal rollers/belt/cassette | procedural | 0 KB |
| Banknotes | 6 denominations, front only | existing SVG → `CanvasTexture`; shared plane | ≤ 250 KB total |
| Materials | 1 brushed/painted metal set (albedo, normal, ORM), 1 rubber | CC0 (ambientCG / Poly Haven) | ≤ 600 KB |
| Lights | idle LED chase, slot strip, status lamps | emissive + additive quads | 0 KB |
| Env | `RoomEnvironment` | three | 0 KB |
| Audio | processing beeps, motor spin-up/loop, roller, paper slide ×3 variants, shutter, tray thunk, success beep, error buzz, ambient idle hum | synth (+ optional CC0/licensed) | ≤ 400 KB |
| Fallback | current DOM/SVG ATM | existing | already shipped |

### 2.2 Marble machine
| Group | Needed | Source plan | Budget |
|---|---|---|---|
| Marbles | ≥ 3 materials (steel, glass, tinted) | one `InstancedMesh` per material | 0 KB |
| Tracks | 1 main loop + 2 branches + spiral + funnel + launcher, as spline data (JSON) | procedural | ≤ 20 KB JSON |
| Mechanisms | gears (3 sizes), pendulum, see-saw, kicker, bell, elevator wheel, gate/diverter | procedural parametric | 0 KB |
| Glass | tube/globe shells (fake glass) | procedural | 0 KB |
| Materials | 1 wood/brass/steel set | CC0 | ≤ 600 KB |
| Audio | marble roll (loop, pitch by speed), clack ×4, tink ×4 (glass), gear tick loop, ratchet, bell ×3 pitches, launch, funnel swirl, win chime | Kenney Impact (CC0 [V2]) + synth | ≤ 500 KB |
| Fallback | 2D canvas marble path or static poster | to design | ≤ 100 KB |

### 2.3 Energy reactor
| Group | Needed | Source plan | Budget |
|---|---|---|---|
| Core | icosphere + noise/fresnel shader | procedural | 0 KB |
| Rings | 3–5 rotating rings (torus + segment lights) | procedural | 0 KB |
| Frame | pylons, pipes, containment glass | procedural ± Quaternius props | ≤ 800 KB if used |
| Particles | pooled points (≤ 1,500), arcs (≤ 12 pooled ribbons), shockwave ring | procedural + 1 sprite | ≤ 10 KB |
| Materials | 1 hazard-metal set | CC0 | ≤ 500 KB |
| Audio | hum loop (3 intensity layers), charge riser (3 lengths), discharge boom, zap ×4, coolant hiss, alarm, special-gift stinger | **own synthesis** | ≤ 500 KB |
| Fallback | CSS/SVG glowing core with rotating rings | to design | ≤ 50 KB |

## 3. Format rules

| Type | Format | Rule |
|---|---|---|
| 3D | `.glb` (glTF 2.0) | Meshopt-compressed (`EXT_meshopt_compression`), no Draco unless self-hosted decoder; ≤ 1.5 MB each, ≤ 6 MB per theme; ≤ 30k tris per object, ≤ 100k visible total on iPad; unit = meters; Y-up; no cameras/lights in file |
| Textures | **WebP** (default), **KTX2/Basis** only if memory needs it (self-hosted 527 KB transcoder) | max **1024²** (512² for secondary), power-of-two, sRGB for albedo only, **pack** ORM into one RGB map, no unused maps |
| Env | procedural `RoomEnvironment` or `.hdr` ≤ 256×128 → PMREM at load | no 2K+ HDR on mobile |
| Sprites | single atlas ≤ 512², WebP with alpha | premultiplied-alpha consistent |
| Audio | **WAV 16-bit mono** for ≤ 1 s SFX, **M4A (AAC) or MP3** for ≥ 1 s/loops; 44.1 kHz; peak −1 dBFS; normalize loudness to ≈ −16 LUFS short-term for effects | Avoid OGG as only format (Safari support is version-dependent — NOT VERIFIED); loops must be sample-accurate (WAV) or use Web Audio loop points |
| Data | JSON (splines, cue sheets) | schema-validated at build |

## 4. Folder & naming

```
public/assets/
  common/        env/, textures/, particles/
  atm/           models/, textures/, audio/
  marble/        models/, textures/, audio/, data/
  reactor/       models/, textures/, audio/
  licenses.json  (machine-readable, §6)
CREDITS.md       (only when attribution is required)
```
Names: `kebab-case`, theme prefix, version suffix when replaced (`atm-chassis-v2.glb`), **never overwrite old assets** (rule from the brief: keep previous files).

## 5. Optimization pipeline (dev-only tools, run offline, not in the app bundle)

```bash
# glTF: dedup, prune, flatten, weld, simplify (optional), WebP textures resized to 1024, meshopt
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024
# inspect: counts, sizes
npx @gltf-transform/cli inspect out.glb
# audio (ffmpeg, if available on the dev machine): mono, 44.1k, loudness
ffmpeg -i in.wav -ac 1 -ar 44100 -af loudnorm=I=-16:TP=-1.5 out.wav
```
Gate (CI script, later): fail if any GLB > 1.5 MB, any texture > 1024², any asset missing from `licenses.json`.

## 6. `licenses.json` entry schema

```json
{
  "id": "common-metal-brushed-01",
  "file": "common/textures/metal-brushed-01.webp",
  "sourceUrl": "https://…",
  "author": "…",
  "licenseName": "CC0 1.0",
  "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
  "attribution": "none",
  "commercial": true,
  "modified": "resized to 1024, packed ORM",
  "retrievedAt": "YYYY-MM-DD",
  "evidence": "private-storage/evidence/…png",
  "sha256": "…"
}
```

## 7. QA acceptance per asset
- Opens in `gltf-transform inspect` without errors; triangle/draw-call counts recorded.
- Rendered on Safari iPad against the 3 tier budgets (ASSET_PERFORMANCE_GUIDELINES).
- License entry complete; credits updated if needed.
- Audio: no clipping, no clicks at loop points, checked in Safari (not only Chrome).
