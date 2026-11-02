"use client";

import { useEffect, useState } from "react";
import { AtmController } from "./controller.ts";
import { AudioEngine } from "./audio/engine.ts";
import { DiagLog } from "./diag.ts";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./protocol.ts";

function safeLocal(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

const SETTINGS_KEY = "atm:settings:v2";

/** Every setting (mode, policy, volume, visual, rules) lives in ONE record, so an overlay that reloads without the control page
 *  open (autonomous LIVE) comes back exactly as configured. */
export function loadSettings(): Settings {
  try {
    return parseSettings(JSON.parse(safeLocal()?.getItem(SETTINGS_KEY) ?? "null")) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    safeLocal()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* private mode: not remembered */ }
}

export function applySettings(s: Settings, controller: AtmController, audio: AudioEngine): void {
  audio.setVolume(s.volume);
  audio.setMuted(s.muted);
  controller.setMode(s.mode);
  controller.setPolicy({ hybridGiftBurst: s.hybridGiftBurst, hybridMaxJoinWaitMs: s.hybridMaxJoinWaitMs });
  controller.setVisual(s.visual);
  controller.setRules(s.rules);
}

/** Creates diag log + audio engine + controller and runs the controller while mounted. */
export function useAtm(storageKey: string): { controller: AtmController; audio: AudioEngine; diag: DiagLog } {
  const [diag] = useState(() => new DiagLog());
  const [audio] = useState(() => new AudioEngine());
  const [controller] = useState(() => new AtmController({ audio, storage: safeLocal(), storageKey, log: diag.add }));
  useEffect(() => {
    applySettings(loadSettings(), controller, audio); // after mount: no hydration mismatch
    controller.start();
    return () => controller.stop();
  }, [controller, audio]);
  return { controller, audio, diag };
}
