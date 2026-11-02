"use client";

import { memo, useEffect, useRef } from "react";

const W = 540, H = 960;
const rnd = (seed: number) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

/** Static layers (sky, skyline, bokeh, window frame, vignette) are drawn ONCE into an offscreen canvas. */
function buildStatic(scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  const r = rnd(20261031);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#04060c"); sky.addColorStop(0.55, "#0b1322"); sky.addColorStop(1, "#171421");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // far + near skyline with lit windows
  for (const [layer, base, alpha, minW, maxW, minH, maxH] of [[0, 640, 0.55, 26, 58, 90, 320], [1, 700, 0.9, 40, 90, 120, 380]] as const) {
    let x = -10;
    while (x < W) {
      const w = minW + r() * (maxW - minW), h = minH + r() * (maxH - minH);
      g.fillStyle = layer ? "#090d16" : "#0e1524"; g.globalAlpha = alpha;
      g.fillRect(x, base - h, w, h + 300);
      g.globalAlpha = 1;
      for (let wy = base - h + 8; wy < base - 6; wy += layer ? 11 : 9) for (let wx = x + 5; wx < x + w - 6; wx += layer ? 9 : 7) {
        if (r() < (layer ? 0.28 : 0.2)) { g.fillStyle = r() < 0.7 ? `rgba(255,214,150,${0.35 + r() * 0.4})` : `rgba(150,200,255,${0.25 + r() * 0.35})`; g.fillRect(wx, wy, layer ? 4 : 3, layer ? 5 : 4); }
      }
      x += w + 2 + r() * 8;
    }
  }
  // distant bokeh (out-of-focus city lights)
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = 470 + r() * 230, rad = 5 + r() * 14;
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r() < 0.65;
    b.addColorStop(0, warm ? "rgba(255,200,130,0.35)" : "rgba(140,190,255,0.3)"); b.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = b; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // polished floor + warm light pool under the machine
  const floor = g.createLinearGradient(0, 800, 0, H);
  floor.addColorStop(0, "rgba(10,10,14,0)"); floor.addColorStop(1, "rgba(18,14,12,0.85)");
  g.fillStyle = floor; g.fillRect(0, 800, W, H - 800);
  const pool = g.createRadialGradient(W / 2, 905, 10, W / 2, 905, 250);
  pool.addColorStop(0, "rgba(255,196,120,0.22)"); pool.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = pool; g.fillRect(0, 700, W, 260);
  // window frame (mullions) with a metal highlight
  g.fillStyle = "#06080c";
  for (const x of [0, W - 16]) g.fillRect(x, 0, 16, 820);
  g.fillRect(0, 0, W, 14); g.fillRect(0, 806, W, 16);
  g.fillRect(W / 2 - 5, 0, 10, 806);
  g.fillStyle = "rgba(190,170,130,0.35)";
  for (const x of [14, W - 16, W / 2 - 5]) g.fillRect(x, 14, 1.5, 792);
  g.fillRect(0, 806, W, 1.5);
  const vg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}

/**
 * Night room behind the ATM: rain on a big window, city lights, slow light sweep, rare distant flash.
 * One canvas, one rAF loop capped at 24 fps, DPR ≤ 1.25, paused when hidden, single still frame under prefers-reduced-motion.
 * `transparent` renders nothing heavy (just a soft light pool) so the ATM can sit over a camera feed.
 */
export const Backdrop = memo(function Backdrop({ mode }: { mode: "transparent" | "night" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mode !== "night") return;
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dpr = Math.min(1.25, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d");
    if (!g) return;
    const bg = buildStatic(dpr);
    const r = rnd(77);
    const drops = Array.from({ length: 95 }, () => ({ x: r() * W, y: r() * H, v: 380 + r() * 520, l: 10 + r() * 22, a: 0.12 + r() * 0.22 }));
    const beads = Array.from({ length: 12 }, () => ({ x: 30 + r() * (W - 60), y: r() * 760, v: 6 + r() * 16, s: 1.6 + r() * 2.6, wob: r() * 6 }));
    let raf = 0, last = 0, t0 = 0, flashAt = 18_000 + r() * 40_000;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 1000 / 24) return;
      const dt = Math.min(0.1, (now - last) / 1000 || 0.04);
      last = now;
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(bg, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // rain intensity drifts slowly (incommensurate periods → never a visible loop)
      const k = 0.65 + 0.35 * Math.sin(t / 23.3) * Math.sin(t / 9.7 + 1);
      g.strokeStyle = "rgba(190,215,255,0.22)"; g.lineWidth = 1; g.beginPath();
      const n = Math.floor(drops.length * (0.5 + 0.5 * k));
      for (let i = 0; i < n; i++) {
        const d = drops[i]!;
        d.y += d.v * dt; d.x -= d.v * dt * 0.08;
        if (d.y > 800) { d.y = -d.l; d.x = r() * W; }
        g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.08, d.y + d.l);
      }
      g.stroke();
      // beads sliding on the glass
      for (const b of beads) {
        b.y += b.v * dt * (0.6 + k); if (b.y > 790) { b.y = -4; b.x = 30 + r() * (W - 60); }
        const x = b.x + Math.sin(b.y / 40 + b.wob) * 1.5;
        g.fillStyle = "rgba(210,225,255,0.28)"; g.beginPath(); g.ellipse(x, b.y, b.s * 0.7, b.s * 1.2, 0, 0, 6.3); g.fill();
        g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(x - 0.6, b.y - b.s * 0.6, 1.2, 1.2);
      }
      // slow diagonal light sweep (reflection on the glass)
      const sx = ((t / 26) % 1) * (W + 500) - 250;
      const sw = g.createLinearGradient(sx - 80, 0, sx + 80, 300);
      sw.addColorStop(0, "rgba(255,230,190,0)"); sw.addColorStop(0.5, "rgba(255,230,190,0.07)"); sw.addColorStop(1, "rgba(255,230,190,0)");
      g.fillStyle = sw; g.fillRect(0, 14, W, 790);
      // rare distant flash
      if (now - t0 > flashAt) {
        const f = (now - t0 - flashAt) / 220;
        if (f < 1) { g.fillStyle = `rgba(190,205,255,${0.1 * (1 - f)})`; g.fillRect(0, 14, W, 790); } else flashAt = now - t0 + 25_000 + r() * 70_000;
      }
    };
    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf && !reduced) { last = 0; raf = requestAnimationFrame(draw); }
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    if (!reduced) { raf = requestAnimationFrame(draw); document.addEventListener("visibilitychange", onVis); }
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
  }, [mode]);

  return mode === "night" ? (
    <canvas ref={ref} data-testid="backdrop-night" aria-hidden style={{ position: "absolute", inset: 0, width: W, height: H }} />
  ) : (
    <div data-testid="backdrop-transparent" aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 220, background: "radial-gradient(ellipse at 50% 100%, rgba(255,196,120,0.14), rgba(0,0,0,0) 70%)" }} />
  );
});
