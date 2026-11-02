/**
 * LIVE listener process: event source → normalize → sign → realtime backend → overlay (ack + retry).
 * Needs Node >= 22 running during the LIVE (your PC, a Codespace, a small VPS). Vercel serverless / iPad cannot host it.
 *
 * Env (never commit):  ATM_SOURCE=tiktok|replay (default tiktok)  SUPABASE_URL  SUPABASE_ANON_KEY  ATM_ROOM
 *   tiktok:  TIKTOK_USERNAME  [EULER_API_KEY]  [ATM_LARGE_GIFT_DIAMONDS=1000]  [ATM_MAX_JOINS_PER_MIN=30]  [ATM_MAX_COMMENTS_PER_MIN=60]
 *   replay:  ATM_REPLAY_FILE=path.jsonl
 * Strongly recommended: ATM_SIGNING_KEY (private key from /control → Security). Without it a secured overlay refuses everything.
 */
import { createLink } from "../src/lib/transport.ts";
import { readRemoteConfig, normalizeRoom } from "../src/lib/config.ts";
import { Outbox } from "../src/lib/outbox.ts";
import { DiagLog } from "../src/lib/diag.ts";
import { DEFAULT_LARGE_GIFT_DIAMONDS } from "../src/lib/tiktok-map.ts";
import { importPrivate, needsSignature, signMessage } from "../src/lib/sign.ts";
import type { AtmEvent } from "../src/lib/events.ts";
import type { ListenerState, ListenerStatus, Msg } from "../src/lib/protocol.ts";
import type { EventSourceAdapter } from "../src/lib/source.ts";
import { tiktokSource } from "./sources/tiktok.ts";
import { replaySource } from "./sources/replay.ts";

const env = process.env;
const diag = new DiagLog();
const log = (level: "info" | "warn" | "error", msg: string) => {
  diag.add(level, msg);
  console.log(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`);
};
function fatal(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

const room = normalizeRoom(env.ATM_ROOM);
const remote = readRemoteConfig(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
if (!room) fatal("ATM_ROOM missing or invalid (16-64 chars A-Z a-z 0-9 _ -). Copy it from /control.");
if (!remote.ok) fatal(`Supabase config: ${remote.reason}`);

const which = (env.ATM_SOURCE ?? "tiktok").toLowerCase();
let source: EventSourceAdapter;
if (which === "replay") {
  if (!env.ATM_REPLAY_FILE) fatal("ATM_REPLAY_FILE is required for ATM_SOURCE=replay");
  source = replaySource(env.ATM_REPLAY_FILE);
} else if (which === "tiktok") {
  const username = (env.TIKTOK_USERNAME ?? "").replace(/^@/, "").trim();
  if (!username) fatal("TIKTOK_USERNAME is required");
  source = tiktokSource({
    username,
    signApiKey: env.EULER_API_KEY,
    largeDiamonds: Number(env.ATM_LARGE_GIFT_DIAMONDS ?? DEFAULT_LARGE_GIFT_DIAMONDS),
    maxJoinsPerMin: Number(env.ATM_MAX_JOINS_PER_MIN ?? 30),
    maxCommentsPerMin: Number(env.ATM_MAX_COMMENTS_PER_MIN ?? 60),
  });
} else fatal(`unknown ATM_SOURCE "${which}" (tiktok | replay)`);

// message authentication: control-plane messages are signed with the host private key (the overlay only holds the public key)
let signKey: CryptoKey | null = null;
if (env.ATM_SIGNING_KEY) {
  try { signKey = await importPrivate(env.ATM_SIGNING_KEY); } catch { fatal("ATM_SIGNING_KEY is invalid (copy it again from /control → Security)"); }
} else console.warn("WARNING: ATM_SIGNING_KEY not set. Events are UNSIGNED: a secured overlay will refuse them.");

let state: ListenerState = "idle";
let detail = "";
let attempts = 0;
let sent = 0;
let lastEventAt: number | null = null;

const outbox = new Outbox({
  from: "tiktok",
  log,
  send: (m) => {
    if (signKey && needsSignature(m.t)) {
      void signMessage(m as never, signKey).then((sm) => link.send(sm as Msg));
      return link.ready();
    }
    return link.send(m);
  },
});

const link = createLink(room, remote.config, {
  onState: (name, s, d) => log("info", `link ${name}: ${s}${d ? ` (${d})` : ""}`),
  onMessage: (m: Msg) => {
    if (m.t === "ack") outbox.ack(m.id, m.result);
    else if (m.t === "ping") publishStatus();
  },
});

function publishStatus(): void {
  const status: ListenerStatus = {
    state, target: source.kind === "replay" ? "REPLAY (not LIVE)" : source.name.replace(/^tiktok:@/, ""), detail, sent, undelivered: outbox.undelivered, lastEventAt, attempts,
  };
  link.send({ v: 1, t: "listener", status });
}
const heartbeat = setInterval(publishStatus, 5000);

const ac = new AbortController();
const handlers = {
  log,
  state(s: ListenerState, d = "") {
    state = s;
    detail = d;
    if (s === "connecting" || s === "reconnecting") attempts += 1;
    if (s === "connected") attempts = 0;
    log(s === "error" ? "error" : "info", `source ${s}${d ? `: ${d}` : ""}`);
    publishStatus();
  },
  emit(ev: AtmEvent) {
    outbox.submit(ev);
    sent += 1;
    lastEventAt = Date.now();
    log("info", `→ ${ev.type} @${ev.username}${ev.text ? ` "${ev.text.slice(0, 30)}"` : ""}${ev.count ? ` x${ev.count}` : ""}${ev.gift ? ` ${ev.gift.name}x${ev.gift.count} (${ev.gift.diamonds}💎)` : ""}`);
  },
};

function shutdown(): void {
  ac.abort();
  clearInterval(heartbeat);
  outbox.stop();
  state = "idle";
  detail = "stopped";
  publishStatus();
  setTimeout(() => { link.close(); process.exit(0); }, 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("info", `listener start: source ${source.name} [${source.kind}], signed: ${signKey ? "yes" : "NO"}${source.kind === "tiktok-unofficial" ? " (UNOFFICIAL TikTok integration)" : " (REHEARSAL, not a real LIVE)"}`);
source.run(handlers, ac.signal).catch((e) => { log("error", `fatal: ${(e as Error).message}`); process.exit(1); });
