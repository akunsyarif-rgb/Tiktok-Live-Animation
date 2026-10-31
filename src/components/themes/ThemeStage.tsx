"use client";

import { useSyncExternalStore } from "react";
import type { AtmController } from "../../lib/controller.ts";
import type { AudioEngine } from "../../lib/audio/engine.ts";
import { AtmStage } from "../atm/AtmStage.tsx";
import { ThreeThemeStage } from "./ThreeThemeStage.tsx";

/** Picks the renderer for the active theme. Theme comes from the controller snapshot (single source of truth). */
export function ThemeStage({ controller, audio, paused = false, fpsCap = 30, expose = false }: {
  controller: AtmController;
  audio: AudioEngine;
  paused?: boolean;
  fpsCap?: number;
  expose?: boolean;
}) {
  const theme = useSyncExternalStore(controller.subscribe, () => controller.getSnapshot().visual.theme, () => "atm" as const);
  if (theme === "atm") return <AtmStage controller={controller} />;
  return <ThreeThemeStage key={theme} controller={controller} audio={audio} theme={theme} paused={paused} fpsCap={fpsCap} expose={expose} />;
}
