"use client";

import { useEffect, useState } from "react";
import { AtmController } from "./controller.ts";
import { AudioEngine } from "./audio/engine.ts";

function safeSession(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Creates a controller + audio engine pair and runs it while mounted. */
export function useAtm(storageKey: string): { controller: AtmController; audio: AudioEngine } {
  const [audio] = useState(() => new AudioEngine());
  const [controller] = useState(() => new AtmController({ audio, storage: safeSession(), storageKey }));
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return { controller, audio };
}
