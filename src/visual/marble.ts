import * as THREE from "three";
import { brushedTexture, glowTexture, glass, metal } from "./materials.ts";
import { IDLE_LAUNCHES, MARBLE_LOOP_S, buildTimeTable, finaleAmount, indexAt, txRuns, type MarbleKind, type Route, type TimeTable } from "./marble-plan.ts";
import type { SceneApi, SceneCtx, SceneFactory, VisualState } from "./types.ts";

const TAU = Math.PI * 2;
const W = TAU / MARBLE_LOOP_S;
const MARBLE_R = 0.18;
const MAX_MARBLES = 24;
const N_SAMPLES = 360;
const hash = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

function mainPoints(): THREE.Vector3[] {
  const p = [
    v3(-2.15, 2.3), v3(-1.0, 2.14), v3(0.5, 1.93), v3(2.05, 1.72), v3(2.32, 1.58), v3(2.15, 1.4),
    v3(1.0, 1.27), v3(-0.6, 1.0), v3(-2.05, 0.8), v3(-2.33, 0.65), v3(-2.15, 0.47),
    v3(-0.8, 0.3), v3(0.6, 0.08), v3(1.4, -0.12),
  ];
  const R = 1.4, turns = 1.5, n = 26;
  for (let i = 1; i <= n; i++) {
    const th = (i / n) * turns * TAU;
    p.push(v3(R * Math.cos(th), -0.12 - 2.53 * (i / n), R * Math.sin(th)));
  }
  p.push(v3(-1.3, -2.85, 0.15), v3(-0.8, -3.25, 0.25), v3(-0.25, -3.6, 0.3), v3(0.05, -3.9, 0.3), v3(0, -4.0, 0.3));
  return p;
}
const SPECIAL_POINTS = [
  [-2.3, 3.4], [0, 3.15], [2.35, 2.85], [2.5, 2.65], [2.25, 2.45], [0, 2.2], [-2.35, 1.95], [-2.5, 1.75], [-2.25, 1.55],
  [0, 1.3], [2.35, 1.05], [2.5, 0.85], [2.25, 0.65], [0.5, 0.4], [-1.0, 0.1], [-1.5, -0.5],
].map(([x, y]) => v3(x!, y!, -0.6)).concat([v3(-1.3, -1.4, -0.45), v3(-0.5, -2.6, -0.1), v3(0.1, -3.6, 0.25), v3(0, -4.0, 0.3)]);

interface PathData {
  pts: THREE.Vector3[];
  tt: TimeTable;
  len: number;
  /** sample index nearest to given control-point positions (mechanism triggers) */
  mark: (p: THREE.Vector3) => number;
}

function buildPath(points: THREE.Vector3[]): PathData {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const pts = curve.getSpacedPoints(N_SAMPLES);
  const ys = pts.map((p) => p.y);
  const ds = pts.slice(1).map((p, i) => p.distanceTo(pts[i]!));
  const mark = (p: THREE.Vector3) => {
    let best = 0, bd = Infinity;
    pts.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  return { pts, tt: buildTimeTable(ys, ds), len: curve.getLength(), mark };
}

function gearShape(r: number, teeth: number): THREE.Shape {
  const sh = new THREE.Shape();
  const ro = r * 1.1, ri = r * 0.88, n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = i % 4 === 1 || i % 4 === 2 ? ro : ri;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.22, 0, TAU, true);
  sh.holes.push(hole);
  return sh;
}

interface Run { id: string; route: Route; kind: MarbleKind; t0: number; prev: number; doneAt: number; slot: number }

export const createMarble: SceneFactory = (ctx: SceneCtx): SceneApi => {
  const { scene, env, camera } = ctx;
  let quality = ctx.quality;
  const brushed = brushedTexture();
  const glowTex = glowTexture();
  const root = new THREE.Group();
  root.position.set(0, -0.15, 0);
  root.scale.setScalar(0.88);
  scene.add(root);

  const steel = metal(0x5f6872, 0.42, env, brushed);
  const dark = metal(0x1b2025, 0.55, env, brushed, 0.8);
  const brass = metal(0xb08a45, 0.34, env, brushed);
  const goldRail = new THREE.MeshStandardMaterial({ color: 0x6b5128, emissive: 0xff9a2a, emissiveIntensity: 0.03, metalness: 0.6, roughness: 0.5, envMap: env, envMapIntensity: 0.5 });

  const key = new THREE.DirectionalLight(0xfff0dc, 1.5);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const bowlLight = new THREE.PointLight(0xffd8a0, 0, 7, 2);
  bowlLight.position.set(0, -3.6, 1.4);
  root.add(bowlLight);

  // ---- frame + back panel ----
  const panel = new THREE.Mesh(new THREE.BoxGeometry(5.7, 9.7, 0.16), dark);
  panel.position.set(0, -0.35, -1.0);
  root.add(panel);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 9.9, 0.5), steel);
    rail.position.set(sx * 2.85, -0.35, -0.8);
    root.add(rail);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.36, 0.7), steel);
  top.position.set(0, 4.65, -0.7);
  root.add(top);
  const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.5, 1.4), steel);
  baseBlock.position.set(0, -5.05, -0.3);
  root.add(baseBlock);
  const rivets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8).rotateX(Math.PI / 2), steel, 28);
  const rm = new THREE.Matrix4();
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? 1 : -1;
    rm.makeTranslation(side * 2.62, 4.2 - Math.floor(i / 2) * 0.62, -0.9);
    rivets.setMatrixAt(i, rm);
  }
  root.add(rivets);

  // ---- gears (chain, meshed centre distance = r1 + r2) ----
  const specs: { r: number; n: number; a: number }[] = [{ r: 0.72, n: 16, a: 0 }, { r: 0.45, n: 10, a: 0.2 }, { r: 0.54, n: 12, a: -0.35 }, { r: 0.8, n: 18, a: 0.15 }];
  const gears: { m: THREE.Mesh; dir: number; ratio: number }[] = [];
  let gx = -2.0, gy = 3.7;
  specs.forEach((sp, i) => {
    if (i > 0) {
      const prev = specs[i - 1]!;
      const d = prev.r + sp.r;
      gx += Math.cos(sp.a) * d;
      gy += Math.sin(sp.a) * d;
    }
    const geo = new THREE.ExtrudeGeometry(gearShape(sp.r, sp.n), { depth: 0.14, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 4 });
    const m = new THREE.Mesh(geo, i % 2 ? brass : steel);
    m.position.set(gx, gy, -0.75);
    root.add(m);
    gears.push({ m, dir: i % 2 ? -1 : 1, ratio: specs[0]!.n / sp.n });
  });
  let gearAngle = 0;

  // ---- paths + rails + glass helix ----
  const main = buildPath(mainPoints());
  const special = buildPath(SPECIAL_POINTS);
  const shortPts = mainPoints().slice(0, 6).concat([v3(2.2, 1.2, 0)]);
  const short = buildPath(shortPts);
  const paths: Record<Route, PathData> = { main, special, short };

  const railTube = (pts: THREE.Vector3[], dz: number, dy: number, rad: number, mat: THREE.Material) => {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(v3(0, dy, dz))), false, "centripetal");
    const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.min(160, pts.length * 3), rad, 6, false), mat);
    root.add(m);
    return m;
  };
  const helixStart = main.mark(v3(1.4, -0.12, 0));
  const helixEnd = main.mark(v3(-1.3, -2.85, 0.15));
  const rampPts = main.pts.filter((_, i) => i % 6 === 0 && i <= helixStart);
  railTube(rampPts, 0.13, -0.2, 0.045, steel);
  railTube(rampPts, -0.13, -0.2, 0.045, steel);
  const helixPts = main.pts.filter((_, i) => i % 4 === 0 && i >= helixStart && i <= helixEnd);
  railTube(helixPts, 0, 0, 0.27, glass(0xa8d4ff, 0.08, env)).renderOrder = 2;
  railTube(helixPts, 0, -0.2, 0.05, steel);
  const exitPts = main.pts.filter((_, i) => i % 5 === 0 && i >= helixEnd);
  railTube(exitPts, 0.12, -0.2, 0.045, steel);
  railTube(exitPts, -0.12, -0.2, 0.045, steel);
  // ring clamps along the glass helix (instanced)
  const clampCount = 9;
  const clamps = new THREE.InstancedMesh(new THREE.TorusGeometry(0.32, 0.035, 6, 20), brass, clampCount);
  const cm = new THREE.Matrix4();
  for (let i = 0; i < clampCount; i++) {
    const p = main.pts[Math.floor(helixStart + ((helixEnd - helixStart) * (i + 0.5)) / clampCount)]!;
    const q = main.pts[Math.min(N_SAMPLES, Math.floor(helixStart + ((helixEnd - helixStart) * (i + 0.5)) / clampCount) + 1)]!;
    const dir = q.clone().sub(p).normalize();
    cm.compose(p, new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), dir), v3(1, 1, 1));
    clamps.setMatrixAt(i, cm);
  }
  root.add(clamps);
  // special (back) route rails: dim until a special gift lights them
  const spRail = railTube(SPECIAL_POINTS.filter((_, i) => i % 1 === 0), 0, -0.2, 0.05, goldRail);
  void spRail;

  // ---- bowl (final destination) ----
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 14, 0, TAU, Math.PI / 2, Math.PI / 2), glass(0xbfe2ff, 0.2, env));
  bowl.position.set(0, -3.75, 0.3);
  root.add(bowl);
  const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 8, 40).rotateX(Math.PI / 2), brass);
  bowlRim.position.set(0, -3.75, 0.3);
  root.add(bowlRim);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.42, 20, 1, true), brass);
  cup.position.set(2.2, 1.0, 0);
  root.add(cup);

  // ---- bells, gate, pendulum, wheel ----
  const bellMarks = [short.mark(v3(2.15, 1.4, 0)), main.mark(v3(-2.15, 0.47, 0)), main.mark(v3(1.4, -0.12, 0))];
  const bellMain = [main.mark(v3(2.15, 1.4, 0)), main.mark(v3(-2.15, 0.47, 0)), main.mark(v3(1.4, -0.12, 0))];
  const bellPos: [number, number][] = [[2.55, 1.2], [-2.55, 0.25], [1.75, -0.5]];
  const bells = bellPos.map(([x, y], i) => {
    const g = new THREE.Group();
    g.position.set(x, y + 0.5, 0.05);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55 - i * 0.07, 14), brass);
    bar.position.y = -0.3;
    g.add(bar);
    root.add(g);
    return { g, hit: -10, rate: [1, 1.26, 1.5][i]! };
  });
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.2), brass);
  gate.position.set(1.0, 0.05, 0);
  root.add(gate);
  let gateHit = -10;
  const pendulum = new THREE.Group();
  pendulum.position.set(-1.9, -2.55, 0.1);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), steel);
  arm.position.y = -0.45;
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), brass);
  bob.position.y = -0.95;
  pendulum.add(arm, bob);
  root.add(pendulum);
  let pendHit = -10;
  const wheel = new THREE.Group();
  wheel.position.set(2.05, -2.0, -0.45);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 40), steel));
  const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.04, 0.05), steel, 4);
  const sm = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) { sm.makeRotationZ((i / 4) * Math.PI); spokes.setMatrixAt(i, sm); }
  wheel.add(spokes);
  root.add(wheel);
  let wheelAngle = 0;

  // ---- marbles (one InstancedMesh) ----
  const marbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, envMap: env, envMapIntensity: 1.5 });
  const marbles = new THREE.InstancedMesh(new THREE.SphereGeometry(MARBLE_R, 20, 14), marbleMat, MAX_MARBLES);
  marbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  marbles.frustumCulled = false;
  const KIND_COLOR: Record<MarbleKind, number> = { steel: 0xdde3ea, brass: 0xe6b860, glass: 0x9ccfff, gold: 0xffd060 };
  const col = new THREE.Color();
  for (let i = 0; i < MAX_MARBLES; i++) marbles.setColorAt(i, col.setHex(0xffffff));
  root.add(marbles);

  // ---- sparks (finale, pooled) ----
  const SPARKS = 64;
  const sPos = new Float32Array(SPARKS * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  const sMat = new THREE.PointsMaterial({ map: glowTex, color: 0xffd080, size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(sGeo, sMat);
  sparks.frustumCulled = false;
  root.add(sparks);

  // ---- run management ----
  let live = 0; // scene time that keeps running while a transaction's marbles finish
  const runs: Run[] = [];
  const spawned = new Set<string>();
  const idleSpawned = new Set<string>();
  const slots = Array.from({ length: 14 }, (_, i) => v3(Math.cos(i * 2.4) * 0.5 * Math.sqrt((i + 1) / 14) * 1.2, -3.88 + 0.1 * Math.floor(i / 6), 0.3 + Math.sin(i * 2.4) * 0.4 * Math.sqrt((i + 1) / 14)));
  let slotCounter = 0;
  let launchKick = -10;
  let lastSpecialLight = 0;
  const tmpM = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();

  const spawn = (id: string, route: Route, kind: MarbleKind, offsetS: number) => {
    if (runs.length >= MAX_MARBLES) return;
    runs.push({ id, route, kind, t0: live - offsetS, prev: 0, doneAt: -1, slot: slotCounter++ % slots.length });
    launchKick = live - offsetS;
    if (offsetS < 0.4) ctx.cue("mb_clack", { rate: 1.1, gain: 0.5 });
  };

  const strike = (i: number, when: number) => {
    bells[i]!.hit = when;
    ctx.cue("mb_bell", { rate: bells[i]!.rate * (0.97 + hash(when * 7 + i) * 0.06), gain: 0.55 });
  };

  function update(dt: number, t: number, s: VisualState): void {
    live += dt;
    camera.position.x = Math.sin(W * 2 * t) * 0.2;
    camera.position.y = 0.2 + Math.sin(W * 3 * t) * 0.1;
    camera.lookAt(0, 0.2, 0);

    // idle launches (seamless 24 s loop) — only while the idle clock runs
    const cyc = Math.floor(t / MARBLE_LOOP_S);
    const local = t - cyc * MARBLE_LOOP_S;
    for (const L of IDLE_LAUNCHES) {
      const k = `i${cyc}:${L.at}`;
      if (local >= L.at && local < L.at + 1.5 && !idleSpawned.has(k)) {
        idleSpawned.add(k);
        spawn(k, "main", L.kind, local - L.at);
      }
    }
    if (idleSpawned.size > 40) idleSpawned.clear();

    // transaction launches: scheduled by tx time, spawned once each
    let fin = 0;
    if (s.active) {
      const sched = txRuns(s.level, s.seed, s.timeline.processingMs, s.timeline.mainMs);
      for (const r of sched) {
        const k = `${s.seed}:${s.level}:${r.key}`;
        if (s.txMs >= r.at && !spawned.has(k)) {
          spawned.add(k);
          const since = (s.txMs - r.at) / 1000;
          if (since < paths[r.route].tt.total + 3) spawn(k, r.route, r.kind, since);
        }
      }
      fin = finaleAmount(s.level, s.txMs, s.timeline.processingMs, s.timeline.mainMs);
    }
    if (spawned.size > 80) spawned.clear();

    // marbles
    const inten = s.intensity;
    let moving = 0;
    marbles.count = MAX_MARBLES;
    for (let i = 0; i < MAX_MARBLES; i++) {
      const r = runs[i];
      if (!r) {
        tmpM.compose(tmpP.set(0, -20, 0), tmpQ.identity(), tmpS.setScalar(0.0001));
        marbles.setMatrixAt(i, tmpM);
        continue;
      }
      const path = paths[r.route];
      const since = live - r.t0;
      const fi = indexAt(path.tt, since);
      const a = Math.min(N_SAMPLES - 1, Math.floor(fi));
      const f = fi - a;
      const p0 = path.pts[a]!, p1 = path.pts[Math.min(N_SAMPLES, a + 1)]!;
      tmpP.copy(p0).lerp(p1, f);
      let scale = 1;
      const finished = since >= path.tt.total;
      if (finished) {
        if (r.doneAt < 0) {
          r.doneAt = live;
          if (r.route !== "short") ctx.cue("mb_clack", { rate: 0.75, gain: 0.5 });
        }
        const rest = live - r.doneAt;
        if (r.route === "short") scale = Math.max(0.0001, 1 - rest / 0.35);
        else {
          tmpP.copy(slots[r.slot]!);
          scale = rest < 2.4 ? 1 : Math.max(0.0001, 1 - (rest - 2.4) / 0.5);
        }
      } else {
        moving++;
        // mechanism triggers: crossing a mark index fires the mechanism exactly once
        const marks = r.route === "short" ? bellMarks : r.route === "main" ? bellMain : [];
        marks.forEach((mk, bi) => {
          if (r.prev < mk && fi >= mk) {
            strike(bi, live);
            ctx.cue("mb_clack", { rate: 0.95 + hash(live + bi) * 0.25, gain: 0.35 });
          }
        });
        if (r.route === "main") {
          if (r.prev < helixStart - 6 && fi >= helixStart - 6) gateHit = live;
          if (r.prev < helixEnd && fi >= helixEnd) pendHit = live;
        }
      }
      r.prev = fi;
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.setScalar(scale));
      marbles.setMatrixAt(i, tmpM);
      marbles.setColorAt(i, col.setHex(KIND_COLOR[r.kind]));
    }
    // drop finished + settled runs
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i]!;
      if (r.doneAt >= 0 && live - r.doneAt > (r.route === "short" ? 0.4 : 3)) runs.splice(i, 1);
    }
    marbles.instanceMatrix.needsUpdate = true;
    if (marbles.instanceColor) marbles.instanceColor.needsUpdate = true;

    // gears: idle = integer revolutions per loop (seamless); boosted by marbles in flight + finale
    const boost = Math.min(3.5, moving * 0.35 + fin * 2.5) * (0.6 + 0.4 * inten);
    gearAngle += dt * boost * 1.2;
    gears.forEach((g) => {
      g.m.rotation.z = g.dir * ((W * 2 * t) * g.ratio + gearAngle * g.ratio);
    });
    wheelAngle += dt * (0.3 + boost * 0.6);
    wheel.rotation.z = -(W * 1 * t) * 1 + -wheelAngle;

    // mechanisms (damped swings from their last hit)
    bells.forEach((b, i) => {
      const τ = live - b.hit;
      b.g.rotation.z = τ < 2.5 ? Math.sin(τ * 14) * Math.exp(-τ * 2.6) * 0.5 * (i % 2 ? -1 : 1) : 0;
    });
    const gτ = live - gateHit;
    gate.rotation.z = gτ < 1 ? -1.1 * Math.exp(-gτ * 4) * Math.min(1, gτ * 25) : 0;
    const pτ = live - pendHit;
    pendulum.rotation.z = pτ < 3 ? Math.sin(pτ * 7) * Math.exp(-pτ * 1.4) * 0.8 : Math.sin(W * 3 * t) * 0.05; // idle: tiny seamless sway
    // finale: sequential bell strikes + light + sparks
    if (fin > 0) {
      const step = Math.floor(fin * 9);
      if (step > lastSpecialLight && step < 9) {
        lastSpecialLight = step;
        strike(step % 3, live);
      }
    } else lastSpecialLight = 0;
    const glowSp = s.active && s.level === 4 ? 0.9 : 0.03;
    goldRail.emissiveIntensity += (glowSp + fin * 0.8 - goldRail.emissiveIntensity) * Math.min(1, dt * 4);
    bowlLight.intensity += ((fin * 22 + (s.active && s.level >= 3 ? 4 : 0)) * (0.5 + 0.5 * inten) - bowlLight.intensity) * Math.min(1, dt * 5);
    const nSp = quality ? SPARKS : 24;
    sGeo.setDrawRange(0, nSp);
    const burst = s.active && s.level >= 3 ? Math.min(1, fin > 0 ? fin : 0) : 0;
    for (let i = 0; i < nSp; i++) {
      const a = hash(i + 1) * TAU, sp = 0.6 + hash(i + 9) * 1.8;
      const tt = (fin * 2.2 + hash(i + 4)) % 1;
      sPos[i * 3] = Math.cos(a) * sp * tt * 1.4;
      sPos[i * 3 + 1] = -3.6 + Math.sin(a * 0.5 + 0.8) * sp * tt * 1.6 - 2.2 * tt * tt;
      sPos[i * 3 + 2] = 0.3 + Math.sin(a) * sp * tt * 0.6;
    }
    (sGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    sMat.opacity = burst * 0.9 * (0.5 + 0.5 * inten);
    // launcher "kick" visual: key light flicker (cheap) so the launch is noticeable
    key.intensity = 1.5 + Math.max(0, 1 - (live - launchKick) * 4) * 0.7;
  }

  return {
    update,
    setQuality(q) {
      quality = q;
    },
    dispose() {
      brushed.dispose();
      glowTex.dispose();
      [steel, dark, brass, goldRail, marbleMat, sMat].forEach((m) => m.dispose());
      scene.remove(root, key);
    },
  };
};
