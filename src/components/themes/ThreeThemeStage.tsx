"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AtmController, AtmSnapshot } from "../../lib/controller.ts";
import type { AudioEngine } from "../../lib/audio/engine.ts";
import { hashSeed, type ThemeId } from "../../lib/levels.ts";
import { visualStats } from "../../visual/debug.ts";
import { detectWebGL } from "../../visual/webgl.ts";
import type { VisualState } from "../../visual/types.ts";
import { FallbackStage } from "./FallbackStage.tsx";
import { ThemeHud } from "./ThemeHud.tsx";

export function toVisualState(snap: AtmSnapshot, now: number = Date.now()): VisualState {
  const active = snap.phase !== "standby";
  return {
    theme: snap.visual.theme,
    phase: snap.phase,
    level: snap.level,
    active,
    txMs: active ? Math.max(0, now - snap.txStartedAt) : 0,
    timeline: snap.timeline,
    seed: snap.current ? hashSeed(snap.current.id) : 0,
    intensity: snap.visual.intensity,
    idleEnabled: snap.visual.idleEnabled,
  };
}

interface TestHook {
  loseContext: () => void;
  restoreContext: () => void;
  state: () => string;
}

/** One WebGL scene for a theme + DOM HUD. Falls back to CSS/DOM when WebGL is missing, fails, or keeps getting lost. */
export function ThreeThemeStage({ controller, audio, theme, paused, fpsCap, expose }: {
  controller: AtmController;
  audio: AudioEngine;
  theme: Exclude<ThemeId, "atm">;
  paused: boolean;
  fpsCap: number;
  /** expose test hooks on window.__visual (debug mode only) */
  expose: boolean;
}) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const mount = useRef<HTMLDivElement>(null);
  const [gl, setGl] = useState<"pending" | "ok" | "fallback">("pending");

  useEffect(() => {
    if (paused) return;
    let host: { dispose(): void; loseContextForTest(): void; restoreContextForTest(): void } | null = null;
    let cancelled = false;
    if (!detectWebGL().ok) {
      visualStats.set({ webgl: "unavailable" });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection result is only known in the browser
      setGl("fallback");
      return;
    }
    // debounce: flipping through themes quickly must not build (and immediately tear down) a WebGL context per click
    const startTimer = setTimeout(() => void start(), 150);
    const start = async () => {
      try {
        const [hostMod, factory] = await Promise.all([
          import("../../visual/host.ts"),
          theme === "reactor" ? import("../../visual/reactor.ts").then((m) => m.createReactor) : import("../../visual/marble.ts").then((m) => m.createMarble),
        ]);
        if (cancelled || !mount.current) return;
        const h = new hostMod.ThreeHost({
          container: mount.current,
          factory,
          getState: () => toVisualState(controller.getSnapshot()),
          cue: (id, o) => audio.playSfx(id, o),
          fpsCap,
          label: theme,
          onStatus: (s) => {
            if (s === "unavailable") setGl("fallback");
          },
        });
        host = h;
        if (expose) {
          const w = window as unknown as { __visual?: TestHook };
          w.__visual = { loseContext: () => h.loseContextForTest(), restoreContext: () => h.restoreContextForTest(), state: () => visualStats.get().webgl };
        }
        setGl("ok");
      } catch {
        visualStats.set({ webgl: "unavailable" });
        if (!cancelled) setGl("fallback");
      }
    };
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      host?.dispose();
      host = null;
      if (expose) delete (window as unknown as { __visual?: TestHook }).__visual;
    };
  }, [theme, paused, controller, audio, fpsCap, expose]);

  return (
    <div data-testid="three-stage" data-theme={theme} data-gl={paused ? "paused" : gl} style={{ position: "relative", width: 540, height: 960 }}>
      <div ref={mount} style={{ position: "absolute", inset: 0 }} />
      {gl === "fallback" && !paused && <FallbackStage theme={theme} snap={snap} />}
      {paused && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a949b", font: "600 18px system-ui", textAlign: "center", padding: 40 }}>
          Preview paused while the overlay is live
        </div>
      )}
      <ThemeHud snap={snap} />
    </div>
  );
}
