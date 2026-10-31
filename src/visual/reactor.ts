import * as THREE from "three";
import { brushedTexture, glowTexture, glass, metal } from "./materials.ts";
import { ARCS, REACTOR_LOOP_S, RINGS_DRIVEN, reactorFrame } from "./reactor-curve.ts";
import type { SceneApi, SceneCtx, SceneFactory } from "./types.ts";

const TAU = Math.PI * 2;
const W = TAU / REACTOR_LOOP_S;
const CYAN = new THREE.Color(0x5fe0f0);
const HOT = new THREE.Color(0xffe0b0);
const WHITE = new THREE.Color(1, 1, 1);
const hash = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

const CORE_VERT = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const CORE_FRAG = `uniform float uTime; uniform float uCharge; uniform float uHot; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
  float bands = 0.5 + 0.5 * sin(vP.y * 9.0 + uTime * 1.7 + sin(vP.x * 7.0 + uTime * 0.9) * 1.3);
  float cells = 0.5 + 0.5 * sin(vP.x * 13.0 + uTime) * sin(vP.z * 11.0 - uTime * 1.2);
  float e = 0.4 + uCharge * 0.85;
  vec3 cool = mix(vec3(0.03,0.33,0.40), vec3(0.55,0.95,1.0), clamp(uCharge * 0.85 + bands * 0.12, 0.0, 1.0));
  vec3 col = mix(cool, vec3(1.0,0.74,0.42), clamp(uHot * 1.3, 0.0, 1.0));
  col *= e * (0.78 + 0.22 * cells) + f * (0.5 + uCharge);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const RING_R = [1.2, 1.55, 1.95, 2.35, 2.75];
const RING_TILT: [number, number][] = [[1.25, 0.0], [0.35, 0.95], [-0.6, -0.5], [0.15, -1.1], [1.0, 0.6]];
const RING_K = [6, -4, 3, -2, 1]; // idle revolutions per loop: integers → seamless

export const createReactor: SceneFactory = (ctx: SceneCtx): SceneApi => {
  const { scene, env, camera } = ctx;
  let quality = ctx.quality;
  const brushed = brushedTexture();
  const glowTex = glowTexture();
  const root = new THREE.Group();
  root.position.set(0, 0.5, 0);
  scene.add(root);

  const steel = metal(0x7d8791, 0.42, env, brushed);
  const dark = metal(0x23282e, 0.5, env, brushed, 0.85);
  const accent = new THREE.MeshBasicMaterial({ color: CYAN.clone() });

  // --- key light + core ---
  const light = new THREE.PointLight(0xbff4ff, 0, 16, 2);
  root.add(light);
  const coreMat = new THREE.ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: { uTime: { value: 0 }, uCharge: { value: 0.2 }, uHot: { value: 0 } } });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 3), coreMat);
  root.add(core);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 20), glass(0xaee8f2, 0.12, env));
  root.add(shell);
  const halos = [3.2, 6.4].map((size, i) => {
    const m = new THREE.SpriteMaterial({ map: glowTex, color: i ? 0x3fb8d0 : 0x9fefff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 });
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(size);
    root.add(sp);
    return { sp, m, size };
  });

  // --- rings with lit segments ---
  const ringLightMats: THREE.MeshBasicMaterial[] = [];
  const rings = RING_R.map((R, i) => {
    const g = new THREE.Group();
    g.rotation.set(RING_TILT[i]![0], RING_TILT[i]![1], 0);
    const spin = new THREE.Group();
    g.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.055 + i * 0.006, 10, 72), i % 2 ? dark : steel));
    const lm = new THREE.MeshBasicMaterial({ color: CYAN.clone() });
    ringLightMats.push(lm);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 6, 72), lm));
    const seg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.11, 0.1), lm, 16);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      m4.compose(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2), new THREE.Vector3(1, 1, 1));
      seg.setMatrixAt(k, m4);
    }
    spin.add(seg);
    root.add(g);
    return { g, spin, extra: 0 };
  });

  // --- turbine ---
  const turbine = new THREE.Group();
  turbine.position.set(0, -2.7, 0.2);
  turbine.rotation.x = -1.0;
  root.add(turbine);
  const tSpin = new THREE.Group();
  turbine.add(tSpin);
  tSpin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 20).rotateX(Math.PI / 2), steel));
  const blades = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.28, 0.035), steel, 14);
  const bm = new THREE.Matrix4();
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    bm.compose(new THREE.Vector3(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0, a)), new THREE.Vector3(1, 1, 1));
    blades.setMatrixAt(k, bm);
  }
  tSpin.add(blades);
  turbine.add(new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.07, 10, 56), dark));
  const turbGlowMat = new THREE.MeshBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
  const turbGlow = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), turbGlowMat);
  turbGlow.position.z = -0.05;
  turbine.add(turbGlow);
  let turbAngle = 0;

  // --- frame: pylons, crossbeams, base ---
  const stripMat = new THREE.MeshBasicMaterial({ color: CYAN.clone() });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.4, 18), steel);
    p.position.set(sx * 2.55, -0.45, 0.2);
    root.add(p);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 6.4, 0.03), stripMat);
    strip.position.set(sx * 2.55 - sx * 0.01, -0.45, 0.41);
    root.add(strip);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 18), dark);
    cap.position.set(sx * 2.55, 3.35, 0.2);
    root.add(cap);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), lampMat);
  lamp.position.set(-2.55, 3.57, 0.2);
  root.add(lamp);
  const beamTop = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.2, 0.3), dark);
  beamTop.position.set(0, 3.4, 0.2);
  root.add(beamTop);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.55, 48), dark);
  base.position.set(0, -4.4, 0);
  root.add(base);
  const baseRim = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.045, 6, 80).rotateX(Math.PI / 2), accent);
  baseRim.position.set(0, -4.12, 0);
  root.add(baseRim);
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), steel, 24);
  const blm = new THREE.Matrix4();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    blm.makeTranslation(Math.cos(a) * 3.0, -4.1, Math.sin(a) * 3.0);
    bolts.setMatrixAt(k, blm);
  }
  root.add(bolts);

  // --- particles ---
  const MAXP = 520;
  const pos = new Float32Array(MAXP * 3);
  const seeds = new Float32Array(MAXP * 5); // phase, radius, speed, y, outward
  for (let i = 0; i < MAXP; i++) {
    seeds[i * 5] = hash(i + 1) * TAU;
    seeds[i * 5 + 1] = 1.0 + hash(i + 7.3) * 2.3;
    seeds[i * 5 + 2] = (0.25 + hash(i + 3.1) * 0.55) * (hash(i + 9.1) > 0.5 ? 1 : -1);
    seeds[i * 5 + 3] = (hash(i + 5.5) - 0.5) * 3.4;
    seeds[i * 5 + 4] = 0.35 + hash(i + 2.2) * 0.9;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const pMat = new THREE.PointsMaterial({ map: glowTex, color: 0x9fefff, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  root.add(points);

  // --- arcs (pooled) ---
  const MAXARC = 9;
  const ARC_PTS = 14;
  const arcMat = new THREE.LineBasicMaterial({ color: 0xcff8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcs = Array.from({ length: MAXARC }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(geo, arcMat.clone());
    line.frustumCulled = false;
    line.visible = false;
    root.add(line);
    return line;
  });
  let lastZapAt = -1;

  // --- shockwaves ---
  const shocks = [0, 1].map(() => {
    const m = new THREE.MeshBasicMaterial({ color: 0xa8f2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 96), m);
    mesh.visible = false;
    root.add(mesh);
    return mesh;
  });

  const tmpC = new THREE.Color();

  function update(dt: number, t: number, s: Parameters<SceneApi["update"]>[2]): void {
    const f = reactorFrame(s, t);
    const inten = s.intensity;
    // camera: slow sway, seamless loop
    camera.position.x = Math.sin(W * 2 * t) * 0.22;
    camera.position.y = 0.2 + Math.sin(W * 3 * t) * 0.1;
    camera.lookAt(0, 0.45, 0);

    // core + glow
    coreMat.uniforms.uTime!.value = t;
    coreMat.uniforms.uCharge!.value = Math.min(1.4, f.charge + f.release * 0.5 + f.pulse * 0.25);
    coreMat.uniforms.uHot!.value = f.hot;
    core.scale.setScalar(1 + f.charge * 0.1 + f.release * 0.14 + f.pulse * 0.05);
    light.intensity = 3 + (f.charge + f.release + f.pulse * 0.4) * 40 * (0.7 + 0.3 * inten);
    tmpC.copy(CYAN).lerp(HOT, Math.min(1, f.hot));
    light.color.copy(tmpC);
    halos.forEach((h, i) => {
      h.sp.scale.setScalar(h.size * (0.8 + f.charge * 0.5 + f.release * 0.4));
      h.m.opacity = Math.min(0.9, (0.1 + f.charge * 0.35 + f.release * 0.5 + f.pulse * 0.2) * (i ? 0.6 : 1) * (0.6 + 0.4 * inten) * (quality ? 1 : 0.7));
      h.m.color.copy(tmpC);
    });

    // rings
    const driven = s.active ? RINGS_DRIVEN[s.level] : 0;
    rings.forEach((r, i) => {
      const idleAng = ((RING_K[i]! * W * t) % TAU);
      const isDriven = i < driven ? 1 : 0;
      r.extra += dt * (f.spin - 1) * (0.9 + 0.35 * i) * (0.4 + 0.6 * isDriven) * (RING_K[i]! > 0 ? 1 : -1);
      r.spin.rotation.z = idleAng + r.extra;
      const glowAmt = 0.28 + f.charge * 0.5 + isDriven * f.drive * 0.55 + f.pulse * 0.2 * (i === Math.floor((t * 2) % 5) ? 1 : 0.4);
      ringLightMats[i]!.color.copy(tmpC).multiplyScalar(Math.min(1.7, glowAmt));
    });

    // turbine
    turbAngle += dt * (0.8 + f.charge * 3.2 + (f.spin - 1) * 2.4);
    tSpin.rotation.z = turbAngle;
    turbGlowMat.opacity = 0.1 + f.charge * 0.25 + f.release * 0.3;

    // frame lights
    stripMat.color.copy(tmpC).multiplyScalar(0.35 + f.charge * 0.8);
    accent.color.copy(tmpC).multiplyScalar(0.35 + f.charge * 0.6);
    lampMat.color.setRGB(1, 0.55, 0.2).multiplyScalar(0.15 + f.lamp * 1.1 + (s.active && s.level >= 3 ? 0.5 * f.drive : 0));

    // particles
    const n = Math.floor(MAXP * (quality ? 1 : 0.45) * Math.min(1, 0.45 + 0.55 * inten));
    pGeo.setDrawRange(0, n);
    const conv = f.drive;
    for (let i = 0; i < n; i++) {
      const b = i * 5;
      const ph = seeds[b]! + t * seeds[b + 2]! * (1 + (f.spin - 1) * 0.7);
      const flow = 0.5 + 0.5 * Math.sin(t * 1.6 + seeds[b]! * 3);
      const R = seeds[b + 1]! * (1 - 0.72 * conv * flow) + f.release * seeds[b + 4]! * 5.4;
      const y = seeds[b + 3]! * (1 - 0.55 * conv) + Math.sin(ph * 1.3) * 0.25 + f.release * (seeds[b + 3]! > 0 ? 1.2 : -1.2) * seeds[b + 4]!;
      pos[i * 3] = Math.cos(ph) * R;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(ph) * R * 0.55;
    }
    (pGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    pMat.opacity = Math.min(0.95, (0.28 + f.charge * 0.45 + f.release * 0.4) * (0.55 + 0.45 * inten));
    pMat.color.copy(tmpC);

    // arcs
    const maxArcs = Math.round(ARCS[s.level] * (quality ? 1 : 0.5) * Math.min(1.2, 0.5 + 0.5 * inten));
    const tick = Math.floor(t * 14);
    for (let k = 0; k < MAXARC; k++) {
      const line = arcs[k]!;
      const on = s.active && k < maxArcs && f.arcEnv > 0.05;
      line.visible = on;
      if (!on) continue;
      const seed = k * 7.77 + tick * 1.31;
      const ring = 1 + ((k + Math.floor(hash(seed) * 3)) % 4);
      const a0 = hash(seed + 1) * TAU;
      const a1 = hash(seed + 2) * TAU;
      const R1 = RING_R[ring]!;
      const sx = Math.cos(a0) * 0.68, sy = Math.sin(a0) * 0.68, sz = (hash(seed + 3) - 0.5) * 0.6;
      const ex = Math.cos(a1) * R1, ey = Math.sin(a1) * R1 * 0.8, ez = (hash(seed + 4) - 0.5) * 1.4;
      const arr = (line.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      for (let j = 0; j < ARC_PTS; j++) {
        const u = j / (ARC_PTS - 1);
        const jit = Math.sin(u * Math.PI) * 0.28;
        arr[j * 3] = sx + (ex - sx) * u + (hash(seed + j * 3.1) - 0.5) * jit;
        arr[j * 3 + 1] = sy + (ey - sy) * u + (hash(seed + j * 5.3) - 0.5) * jit;
        arr[j * 3 + 2] = sz + (ez - sz) * u + (hash(seed + j * 7.9) - 0.5) * jit;
      }
      (line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (line.material as THREE.LineBasicMaterial).opacity = Math.min(1, f.arcEnv * (0.55 + 0.45 * hash(seed + 9)));
      (line.material as THREE.LineBasicMaterial).color.copy(tmpC).lerp(WHITE, 0.55);
    }
    // arc sound cue: throttled, tied to the same tick that re-seeds the arcs
    if (s.active && f.arcEnv > 0.35 && ARCS[s.level] > 0 && t - lastZapAt > 0.22) {
      lastZapAt = t;
      ctx.cue("rx_zap", { rate: 0.85 + hash(tick) * 0.5, gain: 0.35 });
    }

    // shockwaves
    shocks.forEach((m, i) => {
      const sw = f.shocks[i];
      m.visible = !!sw && sw.p > 0 && sw.p < 1;
      if (!m.visible || !sw) return;
      m.scale.setScalar(0.6 + sw.p * 7.5);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - sw.p, 1.6) * Math.min(1, sw.s) * 0.8 * (0.6 + 0.4 * inten);
      (m.material as THREE.MeshBasicMaterial).color.copy(tmpC);
    });
  }

  return {
    update,
    setQuality(q) {
      quality = q;
    },
    dispose() {
      brushed.dispose();
      glowTex.dispose();
      [steel, dark, accent, stripMat, lampMat, coreMat, pMat, arcMat, turbGlowMat, ...ringLightMats].forEach((m) => m.dispose());
      scene.remove(root);
    },
  };
};
