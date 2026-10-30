"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AtmStage } from "../../components/atm/AtmStage.tsx";
import { StageScaler } from "../../components/atm/StageScaler.tsx";
import { openBus, type Bus, type OverlayStatus } from "../../lib/bus.ts";
import { createEvent, EVENT_LABEL, type AtmEvent, type AtmEventType } from "../../lib/events.ts";
import type { QueueMode } from "../../lib/queue.ts";
import { SOUND_IDS } from "../../lib/audio/manifest.ts";
import { useAtm } from "../../lib/useAtm.ts";

const MODES: { id: QueueMode; label: string; help: string }[] = [
  { id: "community", label: "Community", help: "Strict first-come-first-served. Gifts get no priority." },
  { id: "gift-priority", label: "Gift Priority", help: "Waiting gifts always go before waiting viewer joins." },
  { id: "hybrid", label: "Hybrid", help: "Gifts first, but a waiting viewer join is served after every 3 gifts in a row." },
];

const HEARTBEAT_MS = 2000;
const STALE_MS = 6000;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#1d2125] p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8fd7a6]">{title}</h2>
      {children}
    </section>
  );
}

const btn = "min-h-14 rounded-lg px-4 text-base font-semibold active:scale-[.98] disabled:opacity-40";

export function ControlClient() {
  const { controller, audio } = useAtm("preview");
  const local = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const localAudio = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);

  const [mode, setMode] = useState<QueueMode>("hybrid");
  const [volume, setVolume] = useState(0.8);
  const [route, setRoute] = useState<"auto" | "local">("auto");
  const [overlay, setOverlay] = useState<{ status: OverlayStatus; seenAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const busRef = useRef<Bus | null>(null);
  const lastEvent = useRef<AtmEvent | null>(null);
  const wasConnected = useRef(false);
  const modeRef = useRef(mode);
  const volumeRef = useRef(volume);
  modeRef.current = mode;
  volumeRef.current = volume;

  const overlayConnected = overlay !== null && now - overlay.seenAt < STALE_MS;
  const useOverlay = route === "auto" && overlayConnected;

  useEffect(() => {
    const bus = openBus((m) => {
      if (m.t === "status") setOverlay({ status: m.status, seenAt: Date.now() });
    });
    busRef.current = bus;
    const tick = () => {
      setNow(Date.now());
      bus?.post({ t: "ping" });
    };
    tick();
    const hb = setInterval(tick, HEARTBEAT_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(hb);
      clearInterval(clock);
      bus?.close();
      busRef.current = null;
    };
  }, []);

  // a freshly connected overlay does not know the current mode/volume
  useEffect(() => {
    if (overlayConnected && !wasConnected.current) {
      busRef.current?.post({ t: "mode", mode: modeRef.current });
      busRef.current?.post({ t: "volume", volume: volumeRef.current });
    }
    wasConnected.current = overlayConnected;
  }, [overlayConnected]);

  const addLog = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 6)), []);

  const dispatch = useCallback(
    (ev: AtmEvent) => {
      lastEvent.current = ev;
      if (useOverlay) {
        busRef.current?.post({ t: "event", event: ev });
        addLog(`→ overlay: ${EVENT_LABEL[ev.type]} @${ev.username}`);
      } else {
        const res = controller.enqueue(ev);
        addLog(`${res}: ${EVENT_LABEL[ev.type]} @${ev.username}`);
      }
    },
    [useOverlay, controller, addLog],
  );

  const send = (t: AtmEventType) => dispatch(createEvent(t));

  const resendDuplicate = () => {
    const ev = lastEvent.current;
    if (!ev) return addLog("nothing to duplicate yet");
    dispatch(ev);
  };

  const burst = () => {
    (["VIEWER_JOIN", "VIEWER_JOIN", "GIFT_SMALL", "VIEWER_JOIN", "GIFT_LARGE", "GIFT_SMALL"] as const).forEach(send);
  };

  const changeMode = (m: QueueMode) => {
    setMode(m);
    controller.setMode(m);
    busRef.current?.post({ t: "mode", mode: m });
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    audio.setVolume(v);
    busRef.current?.post({ t: "volume", volume: v });
  };

  const clearQueue = () => {
    controller.clearPending();
    busRef.current?.post({ t: "clear" });
  };

  const view = useOverlay && overlay ? overlay.status.atm : local;
  const loaded = SOUND_IDS.filter((id) => localAudio.assets[id] === "buffer" || localAudio.assets[id] === "element").length;
  const missing = SOUND_IDS.filter((id) => localAudio.assets[id] === "missing");
  const audioActive = localAudio.state === "active";

  return (
    <main className="control-bg min-h-dvh p-4 md:p-6">
      <h1 className="mb-1 text-xl font-bold">ATM Control — Phase 0 simulator</h1>
      <p className="mb-4 text-sm text-white/60">Local simulation only. No TikTok connection. Virtual entertainment currency.</p>

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="grid gap-4">
          <Panel title="Audio">
            <div className="flex flex-wrap items-center gap-3">
              <button className={`${btn} bg-[#2f7d4a] text-white`} onClick={() => void audio.activate()} disabled={audioActive}>
                {audioActive ? "Audio Active ✓" : "Activate Audio"}
              </button>
              <button className={`${btn} bg-[#3a4047]`} onClick={() => void audio.test()} disabled={!audioActive}>Audio Test</button>
              <label className="flex min-w-60 flex-1 items-center gap-3 text-sm">
                Master volume
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} className="h-10 flex-1" aria-label="Master volume" />
                <span className="w-10 text-right tabular-nums">{Math.round(volume * 100)}%</span>
              </label>
            </div>
            <p className="mt-3 text-xs text-white/60">
              Sounds are original synthesized placeholders (not real ATM recordings). iPad: turn off the silent switch; Web Audio is muted by it.
              The overlay page needs its own audio activation (tap the hint on /overlay).
            </p>
          </Panel>

          <Panel title="Queue mode">
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button key={m.id} onClick={() => changeMode(m.id)} aria-pressed={mode === m.id}
                  className={`${btn} ${mode === m.id ? "bg-[#2f7d4a] text-white" : "bg-[#3a4047]"}`}>{m.label}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/60">{MODES.find((m) => m.id === mode)?.help}</p>
          </Panel>

          <Panel title="Simulate events">
            <div className="grid gap-2 sm:grid-cols-3">
              <button className={`${btn} bg-[#2d5f8a] text-white`} onClick={() => send("VIEWER_JOIN")}>Viewer Join<br /><span className="text-xs font-normal">1 note</span></button>
              <button className={`${btn} bg-[#8a6a2d] text-white`} onClick={() => send("GIFT_SMALL")}>Gift Small<br /><span className="text-xs font-normal">several notes</span></button>
              <button className={`${btn} bg-[#8a2d4a] text-white`} onClick={() => send("GIFT_LARGE")}>Gift Large<br /><span className="text-xs font-normal">cash bundle</span></button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <button className={`${btn} bg-[#3a4047]`} onClick={burst}>Burst ×6 (mixed)</button>
              <button className={`${btn} bg-[#3a4047]`} onClick={resendDuplicate}>Resend last (duplicate test)</button>
              <button className={`${btn} bg-[#4a2f2f]`} onClick={clearQueue}>Clear waiting queue</button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-white/70" aria-label="Activity log">
              {log.length === 0 ? <li>No events sent yet.</li> : log.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </Panel>

          <Panel title="Event queue">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-white/60">Phase</dt><dd data-testid="phase">{view.phase}</dd>
              <dt className="text-white/60">Waiting</dt><dd data-testid="waiting">{view.waitingTotal}</dd>
              <dt className="text-white/60">Processed</dt><dd data-testid="processed">{view.processed}</dd>
              <dt className="text-white/60">Duplicates blocked</dt><dd data-testid="duplicates">{view.duplicates}</dd>
              <dt className="text-white/60">Recovered</dt><dd>{view.recovered}</dd>
              <dt className="text-white/60">Mode</dt><dd>{view.mode}</dd>
            </dl>
            <div className="mt-2 text-sm">Now: {view.current ? `${EVENT_LABEL[view.current.type]} — @${view.current.username}` : "idle"}</div>
            <ol className="mt-2 space-y-1 text-sm text-white/80">
              {view.waiting.map((w) => <li key={w.id}>{EVENT_LABEL[w.type]} — @{w.username}</li>)}
              {view.waitingTotal > view.waiting.length && <li>… +{view.waitingTotal - view.waiting.length} more</li>}
            </ol>
          </Panel>

          <Panel title="System status">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-white/60">This page audio</dt><dd>{localAudio.state}{audioActive && localAudio.playing ? ` · playing ${localAudio.playing}` : ""}</dd>
              <dt className="text-white/60">Samples</dt>
              <dd>{audioActive ? `${loaded}/${SOUND_IDS.length} loaded${missing.length ? ` · MISSING: ${missing.join(", ")} (oscillator fallback)` : ""}` : "not loaded (activate audio)"}</dd>
              <dt className="text-white/60">Overlay page</dt>
              <dd>{overlayConnected ? `connected · audio ${overlay?.status.audio.state}` : "not detected (open /overlay in this browser)"}</dd>
              <dt className="text-white/60">Event route</dt>
              <dd>
                {useOverlay ? "→ overlay" : "→ this page (preview)"}{" "}
                <button className="ml-2 rounded bg-[#3a4047] px-3 py-1" onClick={() => setRoute(route === "auto" ? "local" : "auto")}>
                  {route === "auto" ? "Force preview" : "Auto"}
                </button>
              </dd>
              <dt className="text-white/60">Event source</dt><dd>local simulator (no TikTok)</dd>
            </dl>
          </Panel>
        </div>

        <div className="mx-auto w-full max-w-[300px] md:sticky md:top-4 md:self-start">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Preview {useOverlay ? "(idle: events go to overlay)" : "(live)"}</div>
          <div className="aspect-[9/16] w-full rounded-lg bg-[#101418]">
            <StageScaler>
              <AtmStage controller={controller} />
            </StageScaler>
          </div>
        </div>
      </div>
    </main>
  );
}
