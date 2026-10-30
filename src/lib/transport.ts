import { parseMessage, type Msg } from "./protocol.ts";
import type { RemoteConfig } from "./config.ts";

export type LinkState = "disabled" | "connecting" | "connected" | "reconnecting" | "offline";

export interface Hooks {
  onMessage(m: Msg, via: string): void;
  onState(name: string, s: LinkState, detail?: string): void;
}

export interface Transport {
  name: string;
  /** true when handed to a live link (not a delivery guarantee). */
  send(m: Msg): boolean;
  state(): LinkState;
  close(): void;
}

/** Same-browser link (Safari tab ↔ Safari tab). Does NOT reach another browser or app. */
export function createBroadcastTransport(room: string, hooks: Hooks): Transport | null {
  if (typeof BroadcastChannel === "undefined") {
    hooks.onState("local", "disabled", "BroadcastChannel unavailable");
    return null;
  }
  const ch = new BroadcastChannel(`atm-${room}`);
  ch.onmessage = (e: MessageEvent) => {
    const m = parseMessage(e.data);
    if (m) hooks.onMessage(m, "local");
  };
  hooks.onState("local", "connected");
  return {
    name: "local",
    send: (m) => {
      try {
        ch.postMessage(m);
        return true;
      } catch {
        return false;
      }
    },
    state: () => "connected",
    close: () => ch.close(),
  };
}

/** Minimal surface of @supabase/realtime-js that we use (keeps tests and typing honest). */
interface RtChannel {
  on(type: "broadcast", filter: { event: string }, cb: (p: { payload?: unknown }) => void): RtChannel;
  subscribe(cb: (status: string, err?: Error) => void): RtChannel;
  send(args: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
}
interface RtClient {
  channel(topic: string, opts: { config: { broadcast: { self: boolean; ack: boolean } } }): RtChannel;
  removeAllChannels(): Promise<unknown>;
  disconnect(): void;
}

/**
 * Cross-device link via Supabase Realtime Broadcast (WebSocket, auto-reconnect, no database used).
 * Anyone who knows the room code can read/write this room: treat the room code as a password.
 */
export function createSupabaseTransport(cfg: RemoteConfig, room: string, hooks: Hooks): Transport {
  let state: LinkState = "connecting";
  let closed = false;
  let channel: RtChannel | null = null;
  let client: RtClient | null = null;
  const set = (s: LinkState, detail?: string) => {
    if (closed || s === state) return;
    state = s;
    hooks.onState("remote", s, detail);
  };
  hooks.onState("remote", "connecting");

  void (async () => {
    try {
      const { RealtimeClient } = await import("@supabase/realtime-js");
      if (closed) return;
      client = new RealtimeClient(`${cfg.url}/realtime/v1`, {
        params: { apikey: cfg.key, eventsPerSecond: 10 },
        heartbeatIntervalMs: 15_000,
      }) as unknown as RtClient;
      channel = client
        .channel(`atm:${room}`, { config: { broadcast: { self: false, ack: false } } })
        .on("broadcast", { event: "m" }, (p) => {
          const m = parseMessage(p.payload);
          if (m) hooks.onMessage(m, "remote");
        })
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") set("connected");
          else if (status === "CLOSED") set("offline", "channel closed");
          else set("reconnecting", err?.message ?? status); // TIMED_OUT / CHANNEL_ERROR: client retries by itself
        });
    } catch (err) {
      set("offline", `init failed: ${(err as Error)?.message ?? "error"}`);
    }
  })();

  return {
    name: "remote",
    send: (m) => {
      if (state !== "connected" || !channel) return false;
      channel.send({ type: "broadcast", event: "m", payload: m }).catch(() => set("reconnecting", "send failed"));
      return true;
    },
    state: () => state,
    close: () => {
      closed = true;
      void client?.removeAllChannels();
      client?.disconnect();
    },
  };
}

export interface Link {
  /** true if at least one transport accepted the message. */
  send(m: Msg): boolean;
  remoteState(): LinkState;
  close(): void;
}

export function createLink(room: string, remote: RemoteConfig | null, hooks: Hooks): Link {
  const transports: Transport[] = [];
  const local = createBroadcastTransport(room, hooks);
  if (local) transports.push(local);
  let remoteT: Transport | null = null;
  if (remote) {
    remoteT = createSupabaseTransport(remote, room, hooks);
    transports.push(remoteT);
  } else {
    hooks.onState("remote", "disabled", "not configured");
  }
  return {
    send: (m) => transports.map((t) => t.send(m)).some(Boolean),
    remoteState: () => remoteT?.state() ?? "disabled",
    close: () => transports.forEach((t) => t.close()),
  };
}
