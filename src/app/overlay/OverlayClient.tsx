"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ThemeStage } from "../../components/themes/ThemeStage.tsx";
import { visualStats } from "../../visual/debug.ts";
import { StageScaler } from "../../components/atm/StageScaler.tsx";
import { createIngest } from "../../lib/ingest.ts";
import type { Msg } from "../../lib/protocol.ts";
import { resolveRoom, useLink } from "../../lib/useLink.ts";
import { saveVisual, useAtm } from "../../lib/useAtm.ts";
import { isThemeId } from "../../lib/levels.ts";

const STATUS_THROTTLE_MS = 700;

/**
 * Query params:  ?room=<code>   shared room code (from /control) for cross-device link
 *                ?clean=1       hide the "tap for sound" hint
 *                ?debug=1       show diagnostics HUD
 *                ?bg=dark|checker  preview backdrop (default transparent)
 */
export function OverlayClient() {
  const { controller, audio, diag } = useAtm("overlay");
  const audioSnap = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const atm = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const logs = useSyncExternalStore(diag.subscribe, diag.getSnapshot, diag.getSnapshot);
  const [params, setParams] = useState({ clean: false, debug: false, bg: "", fps: 30 });
  const stats = useSyncExternalStore(visualStats.subscribe, visualStats.get, visualStats.get);
  const [room, setRoom] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const autoAudio = useRef(false);
  const lastStatus = useRef(0);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ingestRef = useRef<ReturnType<typeof createIngest> | null>(null);
  const sendRef = useRef<(m: Msg) => boolean>(() => false);

  useEffect(() => {
    // browser-only state (URL / localStorage) can only be read after hydration
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search);
    setParams({ clean: q.get("clean") === "1", debug: q.get("debug") === "1", bg: q.get("bg") ?? "", fps: q.get("fps") === "60" ? 60 : 30 });
    const forced = q.get("theme"); // ?theme=reactor|marble|atm : handy for tests / OBS-style direct use
    if (isThemeId(forced)) controller.setVisual({ theme: forced });
    setRoom(resolveRoom(false));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    ingestRef.current = createIngest({ controller, log: diag.add });
    // embedded web views (e.g. a streaming app's widget) may allow audio without a tap
    void audio.autoActivate().then((ok) => {
      autoAudio.current = ok;
      diag.add("info", ok ? "audio auto-activated (no tap needed)" : "audio needs a tap (autoplay blocked)");
    });
  }, [controller, audio, diag]);

  const link = useLink(room, ready, diag, (m: Msg) => {
    if (m.t === "event") {
      const result = ingestRef.current?.(m.event) ?? "invalid";
      sendRef.current({ v: 1, t: "ack", id: m.event.id, result });
      // a new event is a chance to retry audio start if it was blocked earlier
      if (audio.getSnapshot().state !== "active") void audio.autoActivate();
    } else if (m.t === "settings") {
      const s = m.settings;
      controller.setMode(s.mode);
      controller.setPolicy({ hybridGiftBurst: s.hybridGiftBurst, hybridMaxJoinWaitMs: s.hybridMaxJoinWaitMs });
      controller.setVisual(s.visual);
      saveVisual(controller.getVisual());
      audio.setVolume(s.volume);
      audio.setMuted(s.muted);
    } else if (m.t === "clear") controller.clearPending();
    else if (m.t === "ping") publish(true);
  });
  useEffect(() => {
    sendRef.current = link.send;
  }, [link.send]);

  function publish(immediate = false) {
    const run = () => {
      statusTimer.current = null;
      lastStatus.current = Date.now();
      sendRef.current({ v: 1, t: "status", status: { atm: controller.getSnapshot(), audio: audio.getSnapshot(), autoAudio: autoAudio.current } });
    };
    if (immediate) return run();
    if (statusTimer.current) return;
    const wait = Math.max(0, STATUS_THROTTLE_MS - (Date.now() - lastStatus.current));
    statusTimer.current = setTimeout(run, wait);
  }

  useEffect(() => {
    if (!ready) return;
    const u1 = controller.subscribe(() => publish());
    const u2 = audio.subscribe(() => publish());
    publish(true);
    return () => {
      u1();
      u2();
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = null;
    };
    // publish is stable enough: it only reads refs and the two stores
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, controller, audio, link.local, link.remote]);

  const bg =
    params.bg === "dark" ? "#101418"
    : params.bg === "checker" ? "repeating-conic-gradient(#555 0% 25%, #777 0% 50%) 50% / 24px 24px"
    : "transparent";

  return (
    <div style={{ position: "fixed", inset: 0, background: bg }}>
      <StageScaler>
        <ThemeStage controller={controller} audio={audio} fpsCap={params.fps} expose={params.debug} />
      </StageScaler>
      {audioSnap.state !== "active" && !params.clean && (
        <button
          onClick={() => void audio.activate()}
          style={{ position: "fixed", right: 8, bottom: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #3fd16e", background: "#04110a", color: "#3fd16e", font: "700 14px ui-monospace, monospace" }}
        >
          TAP: ENABLE SOUND
        </button>
      )}
      {params.debug && (
        <pre style={{ position: "fixed", left: 4, top: 4, margin: 0, padding: 6, maxWidth: "60vw", maxHeight: "40vh", overflow: "hidden", background: "rgba(0,0,0,.75)", color: "#9fe3b4", font: "10px/1.3 ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
          {`theme:${atm.visual.theme} lvl:${atm.level} fps:${stats.fps} q:${stats.quality} dpr:${stats.dpr} gl:${stats.webgl} calls:${stats.drawCalls} tris:${stats.triangles} geo:${stats.geometries} tex:${stats.textures}\nlocal:${link.local} remote:${link.remote}${link.remoteReason ? ` (${link.remoteReason})` : ""} room:${room ? room.slice(0, 4) + "…" : "none"}\naudio:${audioSnap.state}${audioSnap.muted ? " muted" : ""} vol:${Math.round(audioSnap.volume * 100)} fail:${audioSnap.failures}\nphase:${atm.phase} wait:${atm.waitingTotal} done:${atm.processed} dup:${atm.duplicates} drop:${atm.dropped}\n` +
            logs.slice(-8).map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.msg}`).join("\n")}
        </pre>
      )}
    </div>
  );
}
