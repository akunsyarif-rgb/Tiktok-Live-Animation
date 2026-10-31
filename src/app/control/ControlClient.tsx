"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ThemeStage } from "../../components/themes/ThemeStage.tsx";
import { StageScaler } from "../../components/atm/StageScaler.tsx";
import { createSimEvent, EVENT_LABEL, type AtmEvent, type SimKind } from "../../lib/events.ts";
import { DEFAULT_VISUAL, LEVEL_LABEL, THEMES, type VisualSettings } from "../../lib/levels.ts";
import { DEFAULT_POLICY, type QueueMode } from "../../lib/queue.ts";
import { Outbox } from "../../lib/outbox.ts";
import { generateRoom } from "../../lib/config.ts";
import type { ListenerStatus, Msg, OverlayStatus, Settings } from "../../lib/protocol.ts";
import { SOUND_IDS } from "../../lib/audio/manifest.ts";
import { loadPrefs, loadVisual, savePrefs, saveVisual, useAtm } from "../../lib/useAtm.ts";
import { REMOTE, resolveRoom, saveRoom, useLink } from "../../lib/useLink.ts";

const MODES: { id: QueueMode; label: string }[] = [
  { id: "community", label: "Community" },
  { id: "gift-priority", label: "Gift Priority" },
  { id: "hybrid", label: "Hybrid" },
];

const HEARTBEAT_MS = 5000;
const STALE_MS = 15000;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-white/10 bg-[#1d2125] p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8fd7a6]">{title}</h2>
      {children}
    </section>
  );
}

const btn = "min-h-14 rounded-lg px-4 text-base font-semibold active:scale-[.98] disabled:opacity-40";
const small = "rounded bg-[#3a4047] px-3 py-2 text-sm";

function policyText(mode: QueueMode, burst: number, waitMs: number): string {
  if (mode === "community") return "Strict first-come-first-served. Gifts get no priority.";
  if (mode === "gift-priority") return "Waiting gifts always go before waiting viewer joins. Joins can wait a long time while gifts keep coming.";
  return `Gifts go first, but a waiting viewer join is never starved: it goes next after ${burst} gift(s) in a row, or once it has waited ${Math.round(waitMs / 1000)} s, whichever comes first.`;
}

const LISTENER_COLOR: Record<string, string> = { connected: "text-green-400", connecting: "text-yellow-300", reconnecting: "text-yellow-300", offline: "text-orange-300", error: "text-red-400", idle: "text-white/60" };

export function ControlClient() {
  const { controller, audio, diag } = useAtm("preview");
  const local = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const localAudio = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const logs = useSyncExternalStore(diag.subscribe, diag.getSnapshot, diag.getSnapshot);

  const [settings, setSettings] = useState<Settings>({ mode: "hybrid", hybridGiftBurst: DEFAULT_POLICY.hybridGiftBurst, hybridMaxJoinWaitMs: DEFAULT_POLICY.hybridMaxJoinWaitMs, volume: 0.8, muted: false, visual: DEFAULT_VISUAL });
  const [route, setRoute] = useState<"auto" | "local">("auto");
  const [room, setRoom] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [overlay, setOverlay] = useState<{ status: OverlayStatus; seenAt: number } | null>(null);
  const [listener, setListener] = useState<{ status: ListenerStatus; seenAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const outboxRef = useRef<Outbox | null>(null);
  const lastEvent = useRef<AtmEvent | null>(null);
  const wasConnected = useRef(false);
  const settingsRef = useRef(settings);
  const sendRef = useRef<(m: Msg) => boolean>(() => false);

  const addLog = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 8)), []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    // browser-only state (localStorage / URL) can only be read after hydration
    /* eslint-disable react-hooks/set-state-in-effect */
    const p = loadPrefs();
    setSettings((s) => ({ ...s, volume: p.volume, muted: p.muted, visual: loadVisual() }));
    setRoom(resolveRoom(true));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const link = useLink(room, ready, diag, (m, via) => {
    if (m.t === "status") setOverlay({ status: m.status, seenAt: Date.now() });
    else if (m.t === "listener") setListener({ status: m.status, seenAt: Date.now() });
    else if (m.t === "ack") outboxRef.current?.ack(m.id, m.result);
    else if (m.t === "event" && m.from !== "control") addLog(`← ${via} ${m.from}: ${EVENT_LABEL[m.event.type]} @${m.event.username} [${m.event.source ?? "?"}]`);
  });
  useEffect(() => {
    sendRef.current = link.send;
  }, [link.send]);

  useEffect(() => {
    const ob = new Outbox({ from: "control", send: (m) => sendRef.current(m), log: diag.add });
    outboxRef.current = ob;
    return () => {
      ob.stop();
      outboxRef.current = null;
    };
  }, [diag]);

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      setNow(Date.now());
      sendRef.current({ v: 1, t: "ping", from: "control" });
    };
    tick();
    const hb = setInterval(tick, HEARTBEAT_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(hb);
      clearInterval(clock);
    };
  }, [ready]);

  const overlayConnected = overlay !== null && now - overlay.seenAt < STALE_MS;
  const listenerSeen = listener !== null && now - listener.seenAt < STALE_MS;
  const useOverlay = route === "auto" && overlayConnected;

  const pushSettings = useCallback((s: Settings) => {
    sendRef.current({ v: 1, t: "settings", settings: s });
  }, []);

  // a freshly (re)connected overlay does not know the current settings
  useEffect(() => {
    if (overlayConnected && !wasConnected.current) pushSettings(settingsRef.current);
    wasConnected.current = overlayConnected;
  }, [overlayConnected, pushSettings]);

  const update = (patch: Partial<Settings>) => {
    const s = { ...settingsRef.current, ...patch };
    setSettings(s);
    controller.setMode(s.mode);
    controller.setPolicy({ hybridGiftBurst: s.hybridGiftBurst, hybridMaxJoinWaitMs: s.hybridMaxJoinWaitMs });
    audio.setVolume(s.volume);
    audio.setMuted(s.muted);
    controller.setVisual(s.visual);
    saveVisual(s.visual);
    savePrefs({ volume: s.volume, muted: s.muted });
    pushSettings(s);
  };
  const updateVisual = (patch: Partial<VisualSettings>) => update({ visual: { ...settingsRef.current.visual, ...patch } });

  const dispatch = useCallback(
    (ev: AtmEvent) => {
      lastEvent.current = ev;
      if (useOverlay) {
        outboxRef.current?.submit(ev);
        addLog(`→ overlay: ${EVENT_LABEL[ev.type]} @${ev.username} [simulator]`);
      } else {
        addLog(`${controller.enqueue(ev)}: ${EVENT_LABEL[ev.type]} @${ev.username} [simulator, preview]`);
      }
    },
    [useOverlay, controller, addLog],
  );

  const send = (k: SimKind) => dispatch(createSimEvent(k));
  const resendDuplicate = () => (lastEvent.current ? dispatch(lastEvent.current) : addLog("nothing to duplicate yet"));
  const burst = () => (["join", "join", "small", "join", "big", "medium"] as const).forEach(send);
  const joins20 = () => Array.from({ length: 20 }).forEach(() => send("join"));
  const clearQueue = () => {
    controller.clearPending();
    sendRef.current({ v: 1, t: "clear" });
  };

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("copy blocked: select the text manually");
    }
    setTimeout(() => setCopied(""), 2500);
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const overlayUrl = room ? `${origin}/overlay?room=${room}&clean=1` : `${origin}/overlay?clean=1`;
  const diagText = () =>
    diag.toText(
      [
        `ATM diagnostics ${new Date().toISOString()}`,
        `ua: ${navigator.userAgent}`,
        `remote: ${REMOTE.ok ? link.remote : `disabled (${REMOTE.reason})`} local: ${link.local} room: ${room ? room.slice(0, 4) + "…" : "none"}`,
        `audio: ${localAudio.state} failures:${localAudio.failures} lastError:${localAudio.lastError ?? "-"}`,
        `overlay: ${overlayConnected ? "connected" : "not detected"} listener: ${listenerSeen ? listener?.status.state : "not detected"}`,
      ].join("\n"),
    );

  const view = useOverlay && overlay ? overlay.status.atm : local;
  const loaded = SOUND_IDS.filter((id) => localAudio.assets[id] === "buffer" || localAudio.assets[id] === "element").length;
  const missing = SOUND_IDS.filter((id) => localAudio.assets[id] === "missing");
  const audioActive = localAudio.state === "active";

  return (
    <main className="control-bg min-h-dvh p-4 md:p-6">
      <h1 className="mb-1 text-xl font-bold">ATM Control</h1>
      <p className="mb-4 text-sm text-white/60">Virtual entertainment currency. Events can be simulated here or come from the optional TikTok listener.</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-4">
          <Panel title="Audio">
            <div className="flex flex-wrap items-center gap-3">
              <button className={`${btn} bg-[#2f7d4a] text-white`} onClick={() => void audio.activate()} disabled={audioActive}>
                {audioActive ? "Audio Active ✓" : "Activate Audio"}
              </button>
              <button className={`${btn} bg-[#3a4047]`} onClick={() => void audio.test()} disabled={!audioActive}>Audio Test</button>
              <button className={`${btn} ${settings.muted ? "bg-[#a33] text-white" : "bg-[#3a4047]"}`} aria-pressed={settings.muted} onClick={() => update({ muted: !settings.muted })}>
                {settings.muted ? "Muted" : "Mute"}
              </button>
              <label className="flex min-w-60 flex-1 items-center gap-3 text-sm">
                Volume
                <input type="range" min={0} max={1} step={0.01} value={settings.volume} onChange={(e) => update({ volume: Number(e.target.value) })} className="h-10 flex-1" aria-label="Master volume" />
                <span className="w-10 text-right tabular-nums">{Math.round(settings.volume * 100)}%</span>
              </label>
            </div>
            <p className="mt-3 text-xs text-white/60">
              Sounds are original synthesized placeholders, not real ATM recordings. Volume/mute apply to this page and to the overlay.
              The overlay needs its own audio start (it tries automatically; otherwise tap the hint there). iPad silent switch mutes Web Audio.
            </p>
          </Panel>

          <Panel title="Theme & visuals">
            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Theme">
              {THEMES.map((t) => (
                <button key={t.id} data-testid={`theme-${t.id}`} onClick={() => updateVisual({ theme: t.id })} aria-pressed={settings.visual.theme === t.id}
                  className={`${btn} ${settings.visual.theme === t.id ? "bg-[#2f7d4a] text-white" : "bg-[#3a4047]"}`}>{t.label}</button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-2 text-sm">Idle / attract animation
                <input type="checkbox" className="h-6 w-6" checked={settings.visual.idleEnabled} onChange={(e) => updateVisual({ idleEnabled: e.target.checked })} aria-label="Idle animation" />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">Show recent visitors
                <input type="checkbox" className="h-6 w-6" checked={settings.visual.showRecent} onChange={(e) => updateVisual({ showRecent: e.target.checked })} aria-label="Show recent visitors" />
              </label>
              <label className="flex items-center gap-3 text-sm">Welcome (s)
                <input type="range" min={2} max={12} step={0.5} value={settings.visual.welcomeMs / 1000} onChange={(e) => updateVisual({ welcomeMs: Number(e.target.value) * 1000 })} className="h-10 flex-1" aria-label="Welcome duration" />
                <span className="w-10 text-right tabular-nums">{(settings.visual.welcomeMs / 1000).toFixed(1)}</span>
              </label>
              <label className="flex items-center gap-3 text-sm">Intensity
                <input type="range" min={0.5} max={1.5} step={0.05} value={settings.visual.intensity} onChange={(e) => updateVisual({ intensity: Number(e.target.value) })} className="h-10 flex-1" aria-label="Animation intensity" />
                <span className="w-10 text-right tabular-nums">{Math.round(settings.visual.intensity * 100)}%</span>
              </label>
            </div>
            <div className="mt-3 text-xs text-white/60">Gift level by value (diamonds). Small = below Medium. A second Special within {Math.round(settings.visual.specialCooldownMs / 1000)} s is shown as Big.</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {([["giftMediumDiamonds", "Medium ≥"], ["giftBigDiamonds", "Big ≥"], ["giftSpecialDiamonds", "Special ≥"]] as const).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-2 text-sm">{label}
                  <input type="number" min={1} value={settings.visual[k]} aria-label={`${label} diamonds`} data-testid={`thr-${k}`}
                    onChange={(e) => updateVisual({ [k]: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    className="h-11 w-28 rounded bg-[#2a2f34] px-2 text-right" />
                </label>
              ))}
            </div>
            {settings.visual.showRecent && (
              <div className="mt-3 text-sm" data-testid="recent-list">
                <div className="text-white/60">Recent visitors</div>
                {view.recent?.length ? view.recent.map((r) => <span key={r.name} className="mr-3">{r.kind === "gift" ? "★" : "›"} @{r.name}</span>) : <span className="text-white/40">none yet</span>}
              </div>
            )}
          </Panel>

          <Panel title="Queue mode">
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button key={m.id} onClick={() => update({ mode: m.id })} aria-pressed={settings.mode === m.id}
                  className={`${btn} ${settings.mode === m.id ? "bg-[#2f7d4a] text-white" : "bg-[#3a4047]"}`}>{m.label}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/70">{policyText(settings.mode, settings.hybridGiftBurst, settings.hybridMaxJoinWaitMs)}</p>
            {settings.mode === "hybrid" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-2 text-sm">Join turn after N gifts
                  <input type="number" min={1} max={20} value={settings.hybridGiftBurst} aria-label="Hybrid gift burst"
                    onChange={(e) => update({ hybridGiftBurst: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
                    className="h-11 w-20 rounded bg-[#2a2f34] px-2 text-right" />
                </label>
                <label className="flex items-center justify-between gap-2 text-sm">Max join wait (seconds)
                  <input type="number" min={3} max={300} value={Math.round(settings.hybridMaxJoinWaitMs / 1000)} aria-label="Hybrid max join wait seconds"
                    onChange={(e) => update({ hybridMaxJoinWaitMs: Math.min(300, Math.max(3, Number(e.target.value) || 3)) * 1000 })}
                    className="h-11 w-20 rounded bg-[#2a2f34] px-2 text-right" />
                </label>
              </div>
            )}
          </Panel>

          <Panel title="Simulate events (not TikTok)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <button className={`${btn} bg-[#2d5f8a] text-white`} onClick={() => send("join")}>Viewer Join<br /><span className="text-xs font-normal">level 0</span></button>
              <button className={`${btn} bg-[#4f7a3a] text-white`} onClick={() => send("small")}>Gift Small<br /><span className="text-xs font-normal">level 1</span></button>
              <button className={`${btn} bg-[#8a6a2d] text-white`} onClick={() => send("medium")}>Gift Medium<br /><span className="text-xs font-normal">level 2</span></button>
              <button className={`${btn} bg-[#8a2d4a] text-white`} onClick={() => send("big")}>Gift Big<br /><span className="text-xs font-normal">level 3</span></button>
              <button className={`${btn} bg-[#6a2d8a] text-white`} onClick={() => send("special")}>Gift Special<br /><span className="text-xs font-normal">level 4</span></button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <button className={`${btn} bg-[#3a4047]`} onClick={burst}>Burst ×6 (mixed)</button>
              <button className={`${btn} bg-[#3a4047]`} onClick={joins20}>Join ×20</button>
              <button className={`${btn} bg-[#3a4047]`} onClick={resendDuplicate}>Resend last (duplicate test)</button>
              <button className={`${btn} bg-[#4a2f2f]`} onClick={clearQueue}>Clear waiting queue</button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-white/70" aria-label="Activity log">
              {log.length === 0 ? <li>No events yet.</li> : log.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </Panel>

          <Panel title="Event queue">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-white/60">Phase</dt><dd data-testid="phase">{view.phase}</dd>
              <dt className="text-white/60">Waiting</dt><dd data-testid="waiting">{view.waitingTotal}</dd>
              <dt className="text-white/60">Processed</dt><dd data-testid="processed">{view.processed}</dd>
              <dt className="text-white/60">Duplicates blocked</dt><dd data-testid="duplicates">{view.duplicates}</dd>
              <dt className="text-white/60">Dropped (queue full)</dt><dd data-testid="dropped">{view.dropped}</dd>
              <dt className="text-white/60">Watchdog recoveries</dt><dd>{view.recovered}</dd>
              <dt className="text-white/60">Mode</dt><dd>{view.mode}</dd>
              <dt className="text-white/60">Theme</dt><dd data-testid="theme-active">{view.visual?.theme ?? "atm"}</dd>
            </dl>
            <div className="mt-2 text-sm" data-testid="now">Now: {view.current ? `${LEVEL_LABEL[view.level ?? 0]} — @${view.current.username}${view.group?.length > 1 ? ` (+${view.group.length - 1} group)` : ""}` : "idle"}</div>
            <ol className="mt-2 space-y-1 text-sm text-white/80">
              {view.waiting.map((w) => <li key={w.id}>{EVENT_LABEL[w.type]} — @{w.username}</li>)}
              {view.waitingTotal > view.waiting.length && <li>… +{view.waitingTotal - view.waiting.length} more</li>}
            </ol>
          </Panel>

          <Panel title="Connections">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-white/60">Overlay page</dt>
              <dd data-testid="overlay-status">{overlayConnected ? `connected · audio ${overlay?.status.audio.state}${overlay?.status.audio.muted ? " (muted)" : ""}` : "not detected"}</dd>
              <dt className="text-white/60">Event route</dt>
              <dd>
                {useOverlay ? "→ overlay (acknowledged delivery)" : "→ this page (preview)"}{" "}
                <button className={`ml-2 ${small}`} onClick={() => setRoute(route === "auto" ? "local" : "auto")}>{route === "auto" ? "Force preview" : "Auto"}</button>
              </dd>
              <dt className="text-white/60">Same-browser link</dt><dd>{link.local}</dd>
              <dt className="text-white/60">Cross-device link</dt>
              <dd data-testid="remote-status">{REMOTE.ok ? link.remote : `disabled — ${REMOTE.reason}`}</dd>
              <dt className="text-white/60">TikTok listener</dt>
              <dd data-testid="listener-status">
                {listenerSeen && listener ? (
                  <span className={LISTENER_COLOR[listener.status.state]}>
                    {listener.status.state} @{listener.status.target} · sent {listener.status.sent} · undelivered {listener.status.undelivered}
                    {listener.status.detail ? ` · ${listener.status.detail}` : ""}
                  </span>
                ) : "not running / not detected (real events: NOT active)"}
              </dd>
            </dl>
            <div className="mt-3 space-y-2 text-sm">
              <div className="text-white/60">Room code (secret, links this control to your overlay and listener)</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-black/40 px-2 py-2 text-xs break-all" data-testid="room">{room ? (showRoom ? room : `${room.slice(0, 4)}${"•".repeat(12)}`) : "none"}</code>
                <button className={small} onClick={() => setShowRoom(!showRoom)}>{showRoom ? "Hide" : "Show"}</button>
                <button className={small} onClick={() => room && void copy("overlay URL copied", overlayUrl)}>Copy overlay URL</button>
                <button className={small} onClick={() => room && void copy("room copied", room)}>Copy room</button>
                <button className={small} onClick={() => { const r = generateRoom(); saveRoom(r); setRoom(r); addLog("new room code generated: update overlay URL + listener"); }}>New room</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={roomInput} onChange={(e) => setRoomInput(e.target.value.trim())} placeholder="paste existing room code" aria-label="Room code input" className="h-11 flex-1 rounded bg-[#2a2f34] px-2 text-xs" />
                <button className={small} onClick={() => { if (saveRoom(roomInput)) { setRoom(roomInput); setRoomInput(""); } else addLog("invalid room code (16-64 chars A-Z a-z 0-9 _ -)"); }}>Use</button>
              </div>
              {copied && <div className="text-xs text-green-400">{copied}</div>}
            </div>
          </Panel>

          <Panel title="System status & diagnostics">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-white/60">This page audio</dt>
              <dd>{localAudio.state}{localAudio.muted ? " · muted" : ""}{audioActive && localAudio.playing ? ` · playing ${localAudio.playing}` : ""}</dd>
              <dt className="text-white/60">Samples</dt>
              <dd data-testid="samples">{audioActive ? `${loaded}/${SOUND_IDS.length} loaded${missing.length ? ` · MISSING: ${missing.join(", ")} (fallback tone)` : ""}` : "not loaded (activate audio)"}</dd>
              <dt className="text-white/60">Audio failures</dt><dd>{localAudio.failures}{localAudio.lastError ? ` · ${localAudio.lastError}` : ""}</dd>
              <dt className="text-white/60">Event source</dt><dd>{listenerSeen ? "TikTok listener (unofficial) + simulator" : "simulator only"}</dd>
            </dl>
            <div className="mt-3 flex gap-2">
              <button className={small} onClick={() => void copy("diagnostics copied (secrets redacted)", diagText())}>Copy diagnostics</button>
            </div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11px] leading-snug text-white/70" aria-label="Diagnostics log">
              {logs.length === 0 ? "no entries" : logs.slice(-40).map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.level} ${l.msg}`).join("\n")}
            </pre>
          </Panel>
        </div>

        <div className="mx-auto w-full max-w-[300px] md:sticky md:top-4 md:self-start">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Preview {useOverlay ? "(idle: events go to overlay)" : "(live)"}</div>
          <div className="aspect-[9/16] w-full rounded-lg bg-[#101418]">
            <StageScaler>
              <ThemeStage controller={controller} audio={audio} paused={useOverlay && settings.visual.theme !== "atm"} />
            </StageScaler>
          </div>
        </div>
      </div>
    </main>
  );
}
