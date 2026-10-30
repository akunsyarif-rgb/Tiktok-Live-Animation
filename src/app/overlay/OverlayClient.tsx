"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AtmStage } from "../../components/atm/AtmStage.tsx";
import { StageScaler } from "../../components/atm/StageScaler.tsx";
import { openBus, type Bus } from "../../lib/bus.ts";
import { useAtm } from "../../lib/useAtm.ts";

/**
 * Query params:  ?clean=1  hide the "tap for sound" hint
 *                ?bg=dark|checker  preview backdrop (default transparent)
 */
export function OverlayClient() {
  const { controller, audio } = useAtm("overlay");
  const audioSnap = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const [params, setParams] = useState({ clean: false, bg: "" });
  const busRef = useRef<Bus | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ clean: q.get("clean") === "1", bg: q.get("bg") ?? "" });
  }, []);

  useEffect(() => {
    const publish = () => busRef.current?.post({ t: "status", status: { atm: controller.getSnapshot(), audio: audio.getSnapshot() } });
    const bus = openBus((m) => {
      if (m.t === "event") controller.enqueue(m.event);
      else if (m.t === "mode") controller.setMode(m.mode);
      else if (m.t === "volume") audio.setVolume(m.volume);
      else if (m.t === "clear") controller.clearPending();
      else if (m.t === "ping") publish();
    });
    busRef.current = bus;
    const unsubA = controller.subscribe(publish);
    const unsubB = audio.subscribe(publish);
    publish();
    return () => {
      unsubA();
      unsubB();
      bus?.close();
      busRef.current = null;
    };
  }, [controller, audio]);

  const bg =
    params.bg === "dark" ? "#101418"
    : params.bg === "checker" ? "repeating-conic-gradient(#555 0% 25%, #777 0% 50%) 50% / 24px 24px"
    : "transparent";

  return (
    <div style={{ position: "fixed", inset: 0, background: bg }}>
      <StageScaler>
        <AtmStage controller={controller} />
      </StageScaler>
      {audioSnap.state !== "active" && !params.clean && (
        <button
          onClick={() => void audio.activate()}
          style={{ position: "fixed", right: 8, bottom: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #3fd16e", background: "#04110a", color: "#3fd16e", font: "700 14px ui-monospace, monospace" }}
        >
          TAP: ENABLE SOUND
        </button>
      )}
    </div>
  );
}
