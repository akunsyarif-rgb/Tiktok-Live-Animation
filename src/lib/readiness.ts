export type CheckLevel = "ok" | "warn" | "fail";
export interface Check { id: string; label: string; level: CheckLevel; detail: string }
export type Readiness = "READY" | "DEGRADED" | "NOT READY";

export interface ReadinessInput {
  overlayConnected: boolean;
  remoteConfigured: boolean;
  remoteState: string; // connected | connecting | reconnecting | offline | disabled
  listenerSeen: boolean;
  listenerState: string | null; // connecting | connected | reconnecting | offline | error | idle
  listenerLastEventAt: number | null;
  now: number;
  undelivered: number;
  secured: boolean;
  /** overlay-reported refusals (bad signature / unsigned) */
  rejected: number;
  watchdogRecoveries: number;
}

/**
 * Honest readiness: each layer is judged on its own evidence and a lower layer can never be shown green
 * because a higher one works (a simulator working proves nothing about TikTok).
 */
export function evaluateReadiness(i: ReadinessInput): { overall: Readiness; checks: Check[] } {
  const c: Check[] = [];
  c.push({ id: "overlay", label: "Overlay page", level: i.overlayConnected ? "ok" : "fail", detail: i.overlayConnected ? "responding" : "not detected (open the overlay URL in PRISM / a browser)" });
  c.push({
    id: "backend",
    label: "Backend link (Supabase Realtime)",
    level: !i.remoteConfigured ? "fail" : i.remoteState === "connected" ? "ok" : "fail",
    detail: !i.remoteConfigured ? "not configured: cross-device link unavailable (same-browser only)" : i.remoteState,
  });
  c.push({ id: "listener", label: "Listener process", level: i.listenerSeen ? "ok" : "fail", detail: i.listenerSeen ? "heartbeat received" : "no heartbeat (start it on its host)" });
  const src = i.listenerState;
  const quietMs = i.listenerLastEventAt ? i.now - i.listenerLastEventAt : null;
  c.push({
    id: "source",
    label: "TikTok LIVE event source",
    level: !i.listenerSeen ? "fail" : src === "connected" ? "ok" : src === "offline" ? "warn" : "fail",
    detail: !i.listenerSeen ? "unknown (no listener)" : src === "connected" ? (quietMs === null ? "connected, no event received yet" : `connected, last event ${Math.round(quietMs / 1000)} s ago`) : src === "offline" ? "streamer not LIVE yet (listener keeps retrying)" : `${src}`,
  });
  const pipelineBad = i.undelivered > 0 || i.watchdogRecoveries > 0;
  c.push({ id: "pipeline", label: "Event pipeline", level: pipelineBad ? "warn" : "ok", detail: pipelineBad ? `${i.undelivered} undelivered, ${i.watchdogRecoveries} watchdog recoveries` : "no undelivered events" });
  c.push({
    id: "security",
    label: "Room security",
    level: i.secured ? (i.rejected > 0 ? "warn" : "ok") : "warn",
    detail: i.secured ? (i.rejected > 0 ? `${i.rejected} forged/unsigned messages refused` : "signed messages enforced") : "NOT secured: anyone with the room code can inject events (create signing keys)",
  });
  const fails = c.filter((x) => x.level === "fail" && x.id !== "security").length;
  const critical = c.some((x) => (x.id === "overlay" || x.id === "backend") && x.level === "fail");
  const overall: Readiness = critical || fails >= 2 ? "NOT READY" : fails === 1 || c.some((x) => x.level === "warn") ? "DEGRADED" : "READY";
  return { overall, checks: c };
}
