"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AtmStage } from "../../components/atm/AtmStage.tsx";
import { StageScaler } from "../../components/atm/StageScaler.tsx";
import { createSimEvent, EVENT_LABEL, type AtmEvent, type SimKind } from "../../lib/events.ts";
import { LEVEL_LABEL } from "../../lib/levels.ts";
import type { QueueMode } from "../../lib/queue.ts";
import { Outbox } from "../../lib/outbox.ts";
import { generateRoom } from "../../lib/config.ts";
import { DEFAULT_SETTINGS, type ListenerStatus, type Msg, type OverlayStatus, type Settings } from "../../lib/protocol.ts";
import { evaluateReadiness } from "../../lib/readiness.ts";
import { SOUND_IDS } from "../../lib/audio/manifest.ts";
import { applySettings, loadSettings, saveSettings, useAtm } from "../../lib/useAtm.ts";
import { REMOTE, resolveRoom, saveRoom, useLink } from "../../lib/useLink.ts";
import { clearControlKeys, createControlKeys, readControlKeys, useSignedSend, useSigner } from "../../lib/useSecurity.ts";

const MODES: { id: QueueMode; label: string }[] = [
  { id: "community", label: "Community" },
  { id: "gift-priority", label: "Gift Priority" },
  { id: "hybrid", label: "Hybrid" },
];
const HEARTBEAT_MS = 5000;
const STALE_MS = 15000;
const LS_LIVE = "atm:livemode:v1";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-white/10 bg-[#1d2125] p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#d8c08a]">{title}</h2>
      {children}
    </section>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">{label}
      <input type="checkbox" className="h-6 w-6" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (n: number) => string; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">{label}
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="h-10 flex-1" />
      <span className="w-14 text-right tabular-nums">{fmt(value)}</span>
    </label>
  );
}
const btn = "min-h-14 rounded-lg px-4 text-base font-semibold active:scale-[.98] disabled:opacity-40";
const small = "rounded bg-[#3a4047] px-3 py-2 text-sm";
const LEVEL_COLOR = { ok: "text-green-400", warn: "text-yellow-300", fail: "text-red-400" } as const;
const ICON = { ok: "●", warn: "▲", fail: "✕" } as const;

function policyText(mode: QueueMode, burst: number, waitMs: number): string {
  if (mode === "community") return "Strict first-come-first-served for joins and gifts.";
  if (mode === "gift-priority") return "Waiting gifts always go before waiting viewer joins.";
  return `Gifts first, but a waiting viewer join goes next after ${burst} gift(s) in a row or after ${Math.round(waitMs / 1000)} s.`;
}

export function ControlClient() {
  const { controller, audio, diag } = useAtm("preview");
  const local = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const localAudio = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const logs = useSyncExternalStore(diag.subscribe, diag.getSnapshot, diag.getSnapshot);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [live, setLive] = useState(false);
  const [route, setRoute] = useState<"auto" | "local">("auto");
  const [room, setRoom] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [keyVersion, setKeyVersion] = useState(0);
  const [blocklistText, setBlocklistText] = useState("");
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

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    // browser-only state (localStorage / URL) can only be read after hydration
    /* eslint-disable react-hooks/set-state-in-effect */
    const s = loadSettings();
    setSettings(s);
    setBlocklistText(s.rules.blocklist.join(", "));
    try { setLive(window.localStorage.getItem(LS_LIVE) === "1"); } catch { /* ignore */ }
    setRoom(resolveRoom(true));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const { signKey, publicKey } = useSigner(keyVersion);
  const link = useLink(room, ready, diag, (m) => {
    if (m.t === "status") setOverlay({ status: m.status, seenAt: Date.now() });
    else if (m.t === "listener") setListener({ status: m.status, seenAt: Date.now() });
    else if (m.t === "ack") outboxRef.current?.ack(m.id, m.result);
    else if (m.t === "event" && m.from !== "control") addLog(`← ${m.from}: ${EVENT_LABEL[m.event.type]} @${m.event.username} [${m.event.source ?? "?"}]`);
  });
  const signedSend = useSignedSend(link.send, link.canSend, signKey);
  useEffect(() => { sendRef.current = signedSend; }, [signedSend]);

  useEffect(() => {
    const ob = new Outbox({ from: "control", send: (m) => sendRef.current(m), log: diag.add });
    outboxRef.current = ob;
    return () => { ob.stop(); outboxRef.current = null; };
  }, [diag]);

  useEffect(() => {
    if (!ready) return;
    const tick = () => { setNow(Date.now()); sendRef.current({ v: 1, t: "ping", from: "control" }); };
    tick();
    const hb = setInterval(tick, HEARTBEAT_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(hb); clearInterval(clock); };
  }, [ready]);

  const overlayConnected = overlay !== null && now - overlay.seenAt < STALE_MS;
  const listenerSeen = listener !== null && now - listener.seenAt < STALE_MS;
  const useOverlay = route === "auto" && overlayConnected;

  useEffect(() => {
    if (overlayConnected && !wasConnected.current) sendRef.current({ v: 1, t: "settings", settings: settingsRef.current });
    wasConnected.current = overlayConnected;
  }, [overlayConnected]);

  /** one place that changes any setting: local controller + audio, storage, overlay */
  const commit = (s: Settings) => {
    setSettings(s);
    applySettings(s, controller, audio);
    saveSettings(s);
    sendRef.current({ v: 1, t: "settings", settings: s });
  };
  const update = (p: Partial<Omit<Settings, "visual" | "rules">>) => commit({ ...settingsRef.current, ...p });
  const updateVisual = (p: Partial<Settings["visual"]>) => commit({ ...settingsRef.current, visual: { ...settingsRef.current.visual, ...p } });
  const updateRules = (p: Partial<Settings["rules"]>) => commit({ ...settingsRef.current, rules: { ...settingsRef.current.rules, ...p } });
  const setLiveMode = (v: boolean) => { setLive(v); try { window.localStorage.setItem(LS_LIVE, v ? "1" : "0"); } catch { /* ignore */ } };

  const dispatch = useCallback((ev: AtmEvent) => {
    lastEvent.current = ev;
    if (useOverlay) {
      outboxRef.current?.submit(ev);
      addLog(`→ overlay: ${EVENT_LABEL[ev.type]} @${ev.username} [simulator]`);
    } else addLog(`${controller.enqueue(ev)}: ${EVENT_LABEL[ev.type]} @${ev.username} [simulator, preview]`);
  }, [useOverlay, controller, addLog]);
  const send = (k: SimKind) => dispatch(createSimEvent(k));
  const burst = () => (["join", "comment", "small", "like", "join", "big", "follow", "medium", "share", "comment"] as const).forEach(send);
  const joins20 = () => Array.from({ length: 20 }).forEach(() => send("join"));
  const clearQueue = () => { controller.clearPending(); sendRef.current({ v: 1, t: "clear" }); };

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied("copy blocked: select the text manually"); }
    setTimeout(() => setCopied(""), 2500);
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const overlayUrl = `${origin}/overlay?${room ? `room=${room}&` : ""}clean=1${publicKey ? `&pk=${publicKey}` : ""}`;
  const view = useOverlay && overlay ? overlay.status.atm : local;
  const ovStatus = overlayConnected ? overlay?.status : undefined;
  const readiness = evaluateReadiness({
    overlayConnected, remoteConfigured: REMOTE.ok, remoteState: link.remote, listenerSeen, listenerState: listener?.status.state ?? null,
    listenerLastEventAt: listener?.status.lastEventAt ?? null, now, undelivered: (listener?.status.undelivered ?? 0), secured: !!publicKey && !!ovStatus?.secured,
    rejected: ovStatus?.rejected ?? 0, watchdogRecoveries: view.recovered,
  });
  const loaded = SOUND_IDS.filter((id) => localAudio.assets[id] === "buffer" || localAudio.assets[id] === "element").length;
  const missing = SOUND_IDS.filter((id) => localAudio.assets[id] === "missing");
  const audioActive = localAudio.state === "active";
  const diagText = () => diag.toText([`ATM diagnostics ${new Date().toISOString()}`, `ua: ${navigator.userAgent}`, `readiness: ${readiness.overall} ` + readiness.checks.map((c) => `${c.id}=${c.level}`).join(" "), `audio: ${localAudio.state} failures:${localAudio.failures}`].join("\n"));
  return (
    <main className="control-bg min-h-dvh p-4 md:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ATM LIVE — Control</h1>
        <button className={`${small} ${live ? "bg-[#7a2d2d]" : "bg-[#2f7d4a]"}`} data-testid="live-toggle" aria-pressed={live} onClick={() => setLiveMode(!live)}>
          {live ? "LIVE AUTONOMOUS · tap to open setup" : "PRE-LIVE SETUP · tap to enter LIVE mode"}
        </button>
      </div>
      <p className="mb-4 text-sm text-white/60">
        {live ? "Autonomous: events arrive from the listener and are shown by the overlay. Nothing here needs to be touched. Simulator is hidden." : "Setup and checks. During LIVE the overlay + listener work without this page."}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-4">
          <Panel title="Readiness">
            <div className="mb-3 text-lg font-bold" data-testid="readiness-overall">
              <span className={readiness.overall === "READY" ? "text-green-400" : readiness.overall === "DEGRADED" ? "text-yellow-300" : "text-red-400"}>{readiness.overall}</span>
            </div>
            <ul className="space-y-1 text-sm" data-testid="readiness-list">
              {readiness.checks.map((c) => (
                <li key={c.id} data-testid={`ready-${c.id}`} data-level={c.level}><span className={LEVEL_COLOR[c.level]}>{ICON[c.level]}</span> <b>{c.label}</b> <span className="text-white/60">· {c.detail}</span></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-white/50">Each line is judged from real evidence. A working simulator never turns the TikTok line green.</p>
          </Panel>

          {live && (
            <Panel title="Live counters (read-only)">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-white/60">Processed</dt><dd data-testid="processed">{view.processed}</dd>
                <dt className="text-white/60">Waiting</dt><dd data-testid="waiting">{view.waitingTotal}</dd>
                <dt className="text-white/60">Comments</dt><dd>{view.ambient?.totals.comments ?? 0}</dd>
                <dt className="text-white/60">Likes</dt><dd>{view.ambient?.totals.likes ?? 0}</dd>
                <dt className="text-white/60">Follows / shares</dt><dd>{view.ambient?.totals.follows ?? 0} / {view.ambient?.totals.shares ?? 0}</dd>
                <dt className="text-white/60">Filtered</dt><dd>{view.pipeline?.filtered ?? 0}</dd>
              </dl>
            </Panel>
          )}

          {!live && (<>
            <Panel title="Security (signed messages)">
              <p className="mb-2 text-xs text-white/60">Without keys, anyone who knows the room code can inject events. With keys, the overlay accepts only messages signed by you (ECDSA P-256). The overlay needs the PUBLIC key (inside its URL); the PRIVATE key stays here and in the listener&apos;s environment.</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span data-testid="sec-status">{publicKey ? (ovStatus?.secured ? "keys created · overlay enforcing ✓" : "keys created · overlay NOT using the new URL yet") : "no keys: room is NOT secured"}</span>
                {!publicKey ? <button className={small} data-testid="sec-create" onClick={async () => { await createControlKeys(); setKeyVersion((v) => v + 1); addLog("signing keys created: copy the NEW overlay URL and the listener key"); }}>Create signing keys</button> : (<>
                  <button className={small} onClick={() => { const k = readControlKeys(); if (k) void copy("listener key copied (SECRET: paste into the listener env as ATM_SIGNING_KEY, never share)", k.privateKey); }}>Copy listener key (secret)</button>
                  <button className={small} onClick={() => { clearControlKeys(); setKeyVersion((v) => v + 1); }}>Remove keys</button>
                </>)}
              </div>
            </Panel>

            <Panel title="Automatic response rules">
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="Show comments" checked={settings.rules.commentsEnabled} onChange={(v) => updateRules({ commentsEnabled: v })} />
                <Toggle label="Show likes" checked={settings.rules.likesEnabled} onChange={(v) => updateRules({ likesEnabled: v })} />
                <Toggle label="Show follows" checked={settings.rules.followsEnabled} onChange={(v) => updateRules({ followsEnabled: v })} />
                <Toggle label="Show shares" checked={settings.rules.sharesEnabled} onChange={(v) => updateRules({ sharesEnabled: v })} />
                <Slider label="Comment length" value={settings.rules.commentMaxLen} min={20} max={140} step={5} fmt={(n) => `${n}`} onChange={(n) => updateRules({ commentMaxLen: n })} />
                <Slider label="Same-user gap (s)" value={settings.rules.commentUserGapMs / 1000} min={0} max={20} step={0.5} fmt={(n) => n.toFixed(1)} onChange={(n) => updateRules({ commentUserGapMs: n * 1000 })} />
                <Slider label="Like pulse every (s)" value={settings.rules.likeWindowMs / 1000} min={1} max={15} step={1} fmt={(n) => `${n}`} onChange={(n) => updateRules({ likeWindowMs: n * 1000 })} />
              </div>
              <label className="mt-3 block text-sm">Blocked words (comma separated)
                <textarea value={blocklistText} aria-label="Blocked words" onChange={(e) => { setBlocklistText(e.target.value); updateRules({ blocklist: e.target.value.split(",").map((w) => w.trim()).filter(Boolean) }); }} className="mt-1 h-16 w-full rounded bg-[#2a2f34] p-2 text-sm" />
              </label>
              <p className="mt-1 text-xs text-white/50">Links, empty and repeated-character spam are always hidden. Comments are shortened, never lengthened. Joins/gifts are never filtered.</p>
            </Panel>

            <Panel title="Look & timing">
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="Idle animation" checked={settings.visual.idleEnabled} onChange={(v) => updateVisual({ idleEnabled: v })} />
                <Toggle label="Show recent visitors" checked={settings.visual.showRecent} onChange={(v) => updateVisual({ showRecent: v })} />
                <Slider label="Welcome (s)" value={settings.visual.welcomeMs / 1000} min={2} max={12} step={0.5} fmt={(n) => n.toFixed(1)} onChange={(n) => updateVisual({ welcomeMs: n * 1000 })} />
                <label className="flex items-center justify-between gap-2 text-sm">Background
                  <select aria-label="Background" data-testid="backdrop-select" value={settings.visual.backdrop} onChange={(e) => updateVisual({ backdrop: e.target.value === "night" ? "night" : "transparent" })} className="h-11 rounded bg-[#2a2f34] px-2">
                    <option value="transparent">Transparent (over camera)</option>
                    <option value="night">Night window room</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 text-xs text-white/60">Gift level by value (diamonds). Small = below Medium. A second Special within {Math.round(settings.visual.specialCooldownMs / 1000)} s is shown as Big.</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {([["giftMediumDiamonds", "Medium ≥"], ["giftBigDiamonds", "Big ≥"], ["giftSpecialDiamonds", "Special ≥"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2 text-sm">{label}
                    <input type="number" min={1} value={settings.visual[k]} aria-label={`${label} diamonds`} onChange={(e) => updateVisual({ [k]: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="h-11 w-28 rounded bg-[#2a2f34] px-2 text-right" />
                  </label>
                ))}
              </div>
            </Panel>

            <Panel title="Queue policy (joins & gifts)">
              <div className="grid gap-2 sm:grid-cols-3">
                {MODES.map((m) => (
                  <button key={m.id} onClick={() => update({ mode: m.id })} aria-pressed={settings.mode === m.id} className={`${btn} ${settings.mode === m.id ? "bg-[#2f7d4a] text-white" : "bg-[#3a4047]"}`}>{m.label}</button>
                ))}
              </div>
              <p className="mt-2 text-xs text-white/70">{policyText(settings.mode, settings.hybridGiftBurst, settings.hybridMaxJoinWaitMs)}</p>
              {settings.mode === "hybrid" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-2 text-sm">Join turn after N gifts
                    <input type="number" min={1} max={20} value={settings.hybridGiftBurst} aria-label="Hybrid gift burst" onChange={(e) => update({ hybridGiftBurst: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} className="h-11 w-20 rounded bg-[#2a2f34] px-2 text-right" />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-sm">Max join wait (s)
                    <input type="number" min={3} max={300} value={Math.round(settings.hybridMaxJoinWaitMs / 1000)} aria-label="Hybrid max join wait seconds" onChange={(e) => update({ hybridMaxJoinWaitMs: Math.min(300, Math.max(3, Number(e.target.value) || 3)) * 1000 })} className="h-11 w-20 rounded bg-[#2a2f34] px-2 text-right" />
                  </label>
                </div>
              )}
            </Panel>

            <Panel title="ATM sound effects (music & mic are NOT handled here)">
              <div className="flex flex-wrap items-center gap-3">
                <button className={`${btn} bg-[#2f7d4a] text-white`} onClick={() => void audio.activate()} disabled={audioActive}>{audioActive ? "Audio Active ✓" : "Activate Audio"}</button>
                <button className={`${btn} bg-[#3a4047]`} onClick={() => void audio.test()} disabled={!audioActive}>Audio Test</button>
                <button className={`${btn} ${settings.muted ? "bg-[#a33] text-white" : "bg-[#3a4047]"}`} aria-pressed={settings.muted} onClick={() => update({ muted: !settings.muted })}>{settings.muted ? "Muted" : "Mute"}</button>
                <Slider label="Volume" value={settings.volume} min={0} max={1} step={0.01} fmt={(n) => `${Math.round(n * 100)}%`} onChange={(n) => update({ volume: n })} />
              </div>
              <p className="mt-2 text-xs text-white/60">Only the ATM&apos;s own dispenser sounds. Play music from another app and speak into the mic as usual; see docs/AUDIO_ROUTING.md. Synthesized placeholders, not recordings.</p>
            </Panel>

            <Panel title="Simulator — TEST ONLY (not used during LIVE)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([["join", "Viewer Join", "bg-[#2d5f8a]"], ["small", "Gift Small", "bg-[#4f7a3a]"], ["medium", "Gift Medium", "bg-[#8a6a2d]"], ["big", "Gift Big", "bg-[#8a2d4a]"], ["special", "Gift Special", "bg-[#6a2d8a]"]] as const).map(([k, label, c]) => (
                  <button key={k} className={`${btn} ${c} text-white`} onClick={() => send(k)}>{label}</button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([["comment", "Comment"], ["like", "Likes"], ["follow", "Follow"], ["share", "Share"]] as const).map(([k, label]) => <button key={k} className={`${btn} bg-[#3a4047]`} onClick={() => send(k)}>{label}</button>)}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <button className={`${btn} bg-[#3a4047]`} onClick={burst}>Burst ×10 (mixed)</button>
                <button className={`${btn} bg-[#3a4047]`} onClick={joins20}>Join ×20</button>
                <button className={`${btn} bg-[#3a4047]`} onClick={() => (lastEvent.current ? dispatch(lastEvent.current) : addLog("nothing to duplicate yet"))}>Resend last (duplicate test)</button>
                <button className={`${btn} bg-[#4a2f2f]`} onClick={clearQueue}>Clear waiting queue</button>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-white/70" aria-label="Activity log">{log.length === 0 ? <li>No events yet.</li> : log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </Panel>

            <Panel title="Event queue">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-white/60">Phase</dt><dd data-testid="phase">{view.phase}</dd>
                <dt className="text-white/60">Waiting</dt><dd data-testid="waiting">{view.waitingTotal}</dd>
                <dt className="text-white/60">Processed</dt><dd data-testid="processed">{view.processed}</dd>
                <dt className="text-white/60">Duplicates blocked</dt><dd data-testid="duplicates">{view.duplicates}</dd>
                <dt className="text-white/60">Dropped (queue full)</dt><dd data-testid="dropped">{view.dropped}</dd>
                <dt className="text-white/60">Watchdog recoveries</dt><dd>{view.recovered}</dd>
                <dt className="text-white/60">Received / filtered</dt><dd data-testid="pipeline">{view.pipeline?.received ?? 0} / {view.pipeline?.filtered ?? 0}</dd>
              </dl>
              <div className="mt-2 text-sm" data-testid="now">Now: {view.current ? `${LEVEL_LABEL[view.level ?? 0]} — @${view.current.username}${view.group?.length > 1 ? ` (+${view.group.length - 1} group)` : ""}` : "idle"}</div>
              <ol className="mt-2 space-y-1 text-sm text-white/80">
                {view.waiting.map((w) => <li key={w.id}>{EVENT_LABEL[w.type]} — @{w.username}</li>)}
                {view.waitingTotal > view.waiting.length && <li>… +{view.waitingTotal - view.waiting.length} more</li>}
              </ol>
              {settings.visual.showRecent && <div className="mt-3 text-sm" data-testid="recent-list"><div className="text-white/60">Recent visitors</div>{view.recent?.length ? view.recent.map((r) => <span key={r.name} className="mr-3">{r.kind === "gift" ? "★" : "›"} @{r.name}</span>) : <span className="text-white/40">none yet</span>}</div>}
            </Panel>
          </>)}

          <Panel title="Connections">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-white/60">Overlay page</dt>
              <dd data-testid="overlay-status">{overlayConnected ? `connected · audio ${overlay?.status.audio.state}` : "not detected"}</dd>
              <dt className="text-white/60">Event route</dt>
              <dd>{useOverlay ? "→ overlay (acknowledged)" : "→ this page (preview)"} {!live && <button className={`ml-2 ${small}`} onClick={() => setRoute(route === "auto" ? "local" : "auto")}>{route === "auto" ? "Force preview" : "Auto"}</button>}</dd>
              <dt className="text-white/60">Cross-device link</dt><dd data-testid="remote-status">{REMOTE.ok ? link.remote : `disabled — ${REMOTE.reason}`}</dd>
              <dt className="text-white/60">TikTok listener</dt>
              <dd data-testid="listener-status">
                {listenerSeen && listener ? <span className={listener.status.state === "connected" ? "text-green-400" : listener.status.state === "error" ? "text-red-400" : "text-yellow-300"}>{listener.status.state} @{listener.status.target} · sent {listener.status.sent} · undelivered {listener.status.undelivered}{listener.status.detail ? ` · ${listener.status.detail}` : ""}</span> : "not running / not detected (real events: NOT active)"}
              </dd>
            </dl>
            {!live && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="text-white/60">Room code (links control, overlay and listener)</div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-black/40 px-2 py-2 text-xs break-all" data-testid="room">{room ? (showRoom ? room : `${room.slice(0, 4)}${"•".repeat(12)}`) : "none"}</code>
                  <button className={small} onClick={() => setShowRoom(!showRoom)}>{showRoom ? "Hide" : "Show"}</button>
                  <button className={small} data-testid="copy-overlay" onClick={() => room && void copy("overlay URL copied", overlayUrl)}>Copy overlay URL</button>
                  <button className={small} onClick={() => room && void copy("room copied", room)}>Copy room</button>
                  <button className={small} onClick={() => { const r = generateRoom(); saveRoom(r); setRoom(r); addLog("new room: update overlay URL + listener"); }}>New room</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={roomInput} onChange={(e) => setRoomInput(e.target.value.trim())} placeholder="paste existing room code" aria-label="Room code input" className="h-11 flex-1 rounded bg-[#2a2f34] px-2 text-xs" />
                  <button className={small} onClick={() => { if (saveRoom(roomInput)) { setRoom(roomInput); setRoomInput(""); } else addLog("invalid room code"); }}>Use</button>
                </div>
                {copied && <div className="text-xs text-green-400">{copied}</div>}
              </div>
            )}
          </Panel>

          <Panel title="Diagnostics">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-white/60">Audio (this page)</dt><dd>{localAudio.state}{localAudio.muted ? " · muted" : ""}{audioActive && localAudio.playing ? ` · playing ${localAudio.playing}` : ""}</dd>
              <dt className="text-white/60">Samples</dt><dd data-testid="samples">{audioActive ? `${loaded}/${SOUND_IDS.length} loaded${missing.length ? ` · MISSING: ${missing.join(", ")}` : ""}` : "not loaded (activate audio)"}</dd>
              <dt className="text-white/60">Event source</dt><dd>{listenerSeen && listener?.status.state === "connected" ? "TikTok listener (unofficial)" : "none live (simulator only)"}</dd>
            </dl>
            <div className="mt-3"><button className={small} onClick={() => void copy("diagnostics copied (secrets redacted)", diagText())}>Copy diagnostics</button></div>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11px] leading-snug text-white/70" aria-label="Diagnostics log">{logs.length === 0 ? "no entries" : logs.slice(-40).map((l) => `${new Date(l.t).toLocaleTimeString()} ${l.level} ${l.msg}`).join("\n")}</pre>
          </Panel>
        </div>

        <div className="mx-auto w-full max-w-[300px] md:sticky md:top-4 md:self-start">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/60">Preview {useOverlay ? "(idle: events go to overlay)" : "(live)"}</div>
          <div className="aspect-[9/16] w-full rounded-lg bg-[#101418]"><StageScaler><AtmStage controller={controller} /></StageScaler></div>
        </div>
      </div>
    </main>
  );
}
