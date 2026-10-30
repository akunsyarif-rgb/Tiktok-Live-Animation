"use client";

import { useEffect, useState } from "react";
import { AtmController } from "./controller.ts";
import { AudioEngine } from "./audio/engine.ts";
import { DiagLog } from "./diag.ts";

function safeLocal(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

const PREFS_KEY = "atm:prefs:v1";

export function loadPrefs(): { volume: number; muted: boolean } {
  try {
    const p = JSON.parse(safeLocal()?.getItem(PREFS_KEY) ?? "{}") as { volume?: unknown; muted?: unknown };
    return {
      volume: typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1 ? p.volume : 0.8,
      muted: p.muted === true,
    };
  } catch {
    return { volume: 0.8, muted: false };
  }
}

export function savePrefs(p: { volume: number; muted: boolean }): void {
  try {
    safeLocal()?.setItem(PREFS_KEY, JSON.stringify(p));
  } catch { /* private mode: preference just isn't remembered */ }
}

/** Creates diag log + audio engine + controller and runs the controller while mounted. */
export function useAtm(storageKey: string): { controller: AtmController; audio: AudioEngine; diag: DiagLog } {
  const [diag] = useState(() => new DiagLog());
  const [audio] = useState(() => new AudioEngine());
  const [controller] = useState(() => new AtmController({ audio, storage: safeLocal(), storageKey, log: diag.add }));
  useEffect(() => {
    const p = loadPrefs();
    audio.setVolume(p.volume);
    audio.setMuted(p.muted);
    controller.start();
    return () => controller.stop();
  }, [controller, audio]);
  return { controller, audio, diag };
}
