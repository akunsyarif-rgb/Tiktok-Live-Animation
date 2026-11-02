"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateRoom, normalizeRoom, readRemoteConfig } from "./config.ts";
import { createLink, type Link, type LinkState } from "./transport.ts";
import type { Msg } from "./protocol.ts";
import type { DiagLog } from "./diag.ts";

const ROOM_KEY = "atm:room:v1";

/** Public by design (anon/publishable key). Read at build time by Next. */
export const REMOTE = readRemoteConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function store(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Room precedence: ?room= in URL → saved room → (control only) newly generated. */
export function resolveRoom(allowGenerate: boolean): string | null {
  const fromUrl = normalizeRoom(new URLSearchParams(window.location.search).get("room"));
  const saved = normalizeRoom(store()?.getItem(ROOM_KEY));
  const room = fromUrl ?? saved ?? (allowGenerate ? generateRoom() : null);
  if (room && room !== saved) {
    try { store()?.setItem(ROOM_KEY, room); } catch { /* not persisted */ }
  }
  return room;
}

export function saveRoom(room: string): boolean {
  const r = normalizeRoom(room);
  if (!r) return false;
  try { store()?.setItem(ROOM_KEY, r); } catch { /* not persisted */ }
  return true;
}

export interface LinkInfo {
  room: string | null;
  local: LinkState;
  remote: LinkState;
  remoteReason: string;
  send: (m: Msg) => boolean;
  canSend: () => boolean;
}

/** Opens local (BroadcastChannel) + remote (Supabase Broadcast, if configured) links for a room. */
export function useLink(room: string | null, ready: boolean, diag: DiagLog, onMessage: (m: Msg, via: string) => void): LinkInfo {
  const [states, setStates] = useState<{ local: LinkState; remote: LinkState }>({ local: "connecting", remote: "connecting" });
  const linkRef = useRef<Link | null>(null);
  const cb = useRef(onMessage);
  useEffect(() => {
    cb.current = onMessage;
  });

  useEffect(() => {
    if (!ready) return;
    const remoteCfg = REMOTE.ok && room ? REMOTE.config : null;
    if (!room && REMOTE.ok) diag.add("warn", "no valid room code: remote link disabled");
    const link = createLink(room ?? "local", remoteCfg, {
      onMessage: (m, via) => cb.current(m, via),
      onState: (name, s, d) => {
        diag.add(s === "offline" ? "warn" : "info", `link ${name}: ${s}${d ? ` (${d})` : ""}`);
        setStates((p) => ({ ...p, [name === "local" ? "local" : "remote"]: s }));
      },
    });
    linkRef.current = link;
    return () => {
      link.close();
      linkRef.current = null;
    };
  }, [room, ready, diag]);

  const send = useCallback((m: Msg) => linkRef.current?.send(m) ?? false, []);
  const canSend = useCallback(() => linkRef.current?.ready() ?? false, []);
  return { room, canSend, local: states.local, remote: states.remote, remoteReason: REMOTE.ok ? "" : REMOTE.reason, send };
}
