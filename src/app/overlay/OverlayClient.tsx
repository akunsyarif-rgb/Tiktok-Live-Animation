"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AtmStage } from "../../components/atm/AtmStage.tsx";
import { StageScaler } from "../../components/atm/StageScaler.tsx";
import { createIngest } from "../../lib/ingest.ts";
import type { Msg } from "../../lib/protocol.ts";
import { resolveRoom, useLink } from "../../lib/useLink.ts";
import { applySettings, saveSettings, useAtm } from "../../lib/useAtm.ts";
import { importPublic, resolvePublicKey } from "../../lib/useSecurity.ts";
import { needsSignature, verifyMessage } from "../../lib/sign.ts";
import { ReplayGuard } from "../../lib/replay.ts";

const REPLAY_KEY = "atm:replay:v1";

const STATUS_THROTTLE_MS = 700;

/**
 * Overlay = autonomous. It needs only its URL: the room code (link), the host public key (message authentication) and the
 * settings it remembered. Nobody has to touch a dashboard during LIVE.
 * Query: ?room=<code> ?pk=<host public key> ?clean=1 (no sound button) ?debug=1 (HUD) ?bg=dark|checker ?backdrop=night|transparent
 */
export function OverlayClient() {
  const { controller, audio, diag } = useAtm("overlay");
  const audioSnap = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const atm = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const logs = useSyncExternalStore(diag.subscribe, diag.getSnapshot, diag.getSnapshot);
  const [params, setParams] = useState({ clean: false, debug: false, bg: "" });
  const [room, setRoom] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [secured, setSecured] = useState(false);
  const autoAudio = useRef(false);
  const lastStatus = useRef(0);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ingestRef = useRef<ReturnType<typeof createIngest> | null>(null);
  const sendRef = useRef<(m: Msg) => boolean>(() => false);
  const verifyKey = useRef<Promise<CryptoKey> | null>(null);
  const rejected = useRef(0);
  const guard = useRef(new ReplayGuard());

  useEffect(() => {
    // browser-only state (URL / localStorage) can only be read after hydration
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search);
    setParams({ clean: q.get("clean") === "1", debug: q.get("debug") === "1", bg: q.get("bg") ?? "" });
    const b = q.get("backdrop");
    if (b === "night" || b === "transparent") controller.setVisual({ backdrop: b });
    const pk = resolvePublicKey();
    if (pk) {
      verifyKey.current = importPublic(pk);
      verifyKey.current.catch(() => { diag.add("error", "host public key invalid: control messages will be refused"); });
    }
    try { guard.current = new ReplayGuard(JSON.parse(window.localStorage.getItem(REPLAY_KEY) ?? "{}")); } catch { /* fresh guard */ }
    setSecured(!!pk);
    setRoom(resolveRoom(false));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    ingestRef.current = createIngest({ controller, log: diag.add });
    void audio.autoActivate().then((ok) => {
      autoAudio.current = ok;
      diag.add("info", ok ? "audio auto-activated" : "audio needs a tap (autoplay blocked)");
    });
  }, [controller, audio, diag]);

  const handle = (m: Msg) => {
    if (m.t === "event") {
      const result = ingestRef.current?.(m.event) ?? "invalid";
      sendRef.current({ v: 1, t: "ack", id: m.event.id, result });
      if (audio.getSnapshot().state !== "active") void audio.autoActivate();
    } else if (m.t === "settings") {
      applySettings(m.settings, controller, audio);
      saveSettings(m.settings);
    } else if (m.t === "clear") controller.clearPending();
    else if (m.t === "ping") publish(); // throttled: a ping flood cannot make the overlay flood the channel
  };

  const link = useLink(room, ready, diag, (m: Msg) => {
    if (!needsSignature(m.t) || !verifyKey.current) return handle(m); // legacy room without a host key: unsecured (readiness says so)
    void verifyKey.current.then((key) => verifyMessage(m as never, key)).then((res) => {
      if (res === "ok") {
        if (m.t === "settings" || m.t === "clear") {
          // a captured control message cannot be replayed: its timestamp must be newer than the last accepted one
          if (!guard.current.accept(m.t, m.ts ?? 0)) {
            rejected.current += 1;
            diag.add("warn", `refused replayed ${m.t} message`);
            return;
          }
          try { window.localStorage.setItem(REPLAY_KEY, JSON.stringify(guard.current.snapshot())); } catch { /* memory only */ }
        }
        return handle(m);
      }
      rejected.current += 1;
      diag.add("warn", `refused ${m.t} message: ${res}`);
      if (m.t === "event") sendRef.current({ v: 1, t: "ack", id: m.event.id, result: "invalid" });
    }, () => { rejected.current += 1; });
  });
  useEffect(() => {
    sendRef.current = link.send;
  }, [link.send]);

  function publish(immediate = false) {
    const run = () => {
      statusTimer.current = null;
      lastStatus.current = Date.now();
      sendRef.current({ v: 1, t: "status", status: { atm: controller.getSnapshot(), audio: audio.getSnapshot(), autoAudio: autoAudio.current, rejected: rejected.current, secured } });
    };
    if (immediate) return run();
    if (statusTimer.current) return;
    statusTimer.current = setTimeout(run, Math.max(0, STATUS_THROTTLE_MS - (Date.now() - lastStatus.current)));
  }

  useEffect(() => {
    if (!ready) return;
    // restore the last configuration BEFORE anything arrives: a reloaded overlay is complete on its own
    const u1 = controller.subscribe(() => publish());
    const u2 = audio.subscribe(() => publish());
    publish(true);
    return () => {
      u1();
      u2();
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = null;
    };
    // publish only reads refs and the two stores
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, controller, audio, link.local, link.remote, secured]);

  // connection watchdog: log long outages once per minute (the client library reconnects by itself)
  useEffect(() => {
    if (!ready || link.remote === "connected" || link.remote === "disabled") return;
    const id = setInterval(() => diag.add("warn", `realtime link still ${link.remote}: overlay keeps animating, events resume on reconnect`), 60_000);
    return () => clearInterval(id);
  }, [ready, link.remote, diag]);

  const bg = params.bg === "dark" ? "#101418" : params.bg === "checker" ? "repeating-conic-gradient(#555 0% 25%, #777 0% 50%) 50% / 24px 24px" : "transparent";

  return (
    <div style={{ position: "fixed", inset: 0, background: bg }}>
      <StageScaler>
        <AtmStage controller={controller} />
      </StageScaler>
      {audioSnap.state !== "active" && !params.clean && (
        <button
          onClick={() => void audio.activate()}
          style={{ position: "fixed", right: 8, bottom: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #d8c08a", background: "#0b0d12", color: "#d8c08a", font: "700 14px ui-monospace, monospace" }}
        >
          TAP: ENABLE SOUND
        </button>
      )}
      {params.debug && (
        <pre style={{ position: "fixed", left: 4, top: 4, margin: 0, padding: 6, maxWidth: "60vw", maxHeight: "40vh", overflow: "hidden", background: "rgba(0,0,0,.75)", color: "#9fe3b4", font: "10px/1.3 ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
          {`local:${link.local} remote:${link.remote}${link.remoteReason ? ` (${link.remoteReason})` : ""} room:${room ? room.slice(0, 4) + "…" : "none"} secured:${secured} refused:${rejected.current}\naudio:${audioSnap.state}${audioSnap.muted ? " muted" : ""} vol:${Math.round(audioSnap.volume * 100)} fail:${audioSnap.failures}\nphase:${atm.phase} wait:${atm.waitingTotal} done:${atm.processed} dup:${atm.duplicates} drop:${atm.dropped} lvl:${atm.level} rx:${atm.pipeline.received} filt:${atm.pipeline.filtered} amb:${atm.pipeline.ambient}\n` +
            logs.slice(-8).map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.msg}`).join("\n")}
        </pre>
      )}
    </div>
  );
}
