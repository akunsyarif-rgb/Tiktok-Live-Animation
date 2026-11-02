/**
 * LIVE listener process: event source → normalize → sign → realtime backend → overlay (ack + retry).
 * Needs Node >= 22 running during the LIVE (your PC, a Codespace, a small VPS). Vercel serverless / iPad cannot host it.
 *
 * Env (never commit):  ATM_SOURCE=tiktok|replay (default tiktok)  SUPABASE_URL  SUPABASE_ANON_KEY  ATM_ROOM
 *   tiktok:  TIKTOK_USERNAME  [EULER_API_KEY]  [ATM_LARGE_GIFT_DIAMONDS=1000]  [ATM_MAX_JOINS_PER_MIN=30]  [ATM_MAX_COMMENTS_PER_MIN=60]
 *   replay:  ATM_REPLAY_FILE=path.jsonl
 * Ops:  ATM_HEALTH_PORT (+ATM_HEALTH_HOST, default 127.0.0.1) → GET /health JSON, 200 ok / 503 not ok · ATM_LINK_STALL_MS (default 300000): exit(2) if the
 *        realtime link stays down this long so the supervisor (systemd/Docker) restarts a fresh process · `--check`: validate config + realtime, then exit 0/1.
 * Strongly recommended: ATM_SIGNING_KEY (private key from /control → Security). Without it a secured overlay refuses everything.
 */
import { createServer } from "node:http";
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

const startedAt = Date.now();
let linkDownSince: number | null = null;
const stallMs = Number(env.ATM_LINK_STALL_MS ?? 300_000);
const watchdog = setInterval(() => {
  if (link.ready()) { linkDownSince = null; return; }
  linkDownSince ??= Date.now();
  if (Date.now() - linkDownSince > stallMs) {
    log("error", `realtime link down for ${Math.round((Date.now() - linkDownSince) / 1000)} s: exiting so the supervisor restarts a fresh process`);
    process.exit(2);
  }
}, 5000);

function health() {
  const sourceOk = state === "connected" || source.kind === "replay";
  const ok = link.ready() && sourceOk;
  return {
    ok, uptimeS: Math.round((Date.now() - startedAt) / 1000), source: source.kind, state, detail,
    link: { ready: link.ready(), remote: link.remoteState() }, signed: !!signKey,
    sent, undelivered: outbox.undelivered, pending: outbox.pending, lastEventAt, attempts,
  };
}
// optional health endpoint (loopback by default). Contains no secret and no room code.
const healthPort = Number(env.ATM_HEALTH_PORT ?? 0);
const healthServer = healthPort > 0
  ? createServer((req, res) => {
      if (req.method !== "GET" || (req.url ?? "").split("?")[0] !== "/health") { res.writeHead(404).end(); return; }
      const h = health();
      res.writeHead(h.ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(h));
    }).listen(healthPort, env.ATM_HEALTH_HOST ?? "127.0.0.1", () => log("info", `health endpoint on ${env.ATM_HEALTH_HOST ?? "127.0.0.1"}:${healthPort}/health`))
  : null;

let shuttingDown = false;
async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "shutting down: stopping the source, flushing pending events (max 4 s)");
  ac.abort();
  clearInterval(heartbeat);
  clearInterval(watchdog);
  state = "idle";
  detail = "stopped";
  publishStatus();
  const t0 = Date.now();
  while (outbox.pending > 0 && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100));
  if (outbox.pending > 0) log("warn", `${outbox.pending} event(s) not acknowledged before exit`);
  outbox.stop();
  healthServer?.close();
  link.close();
  setTimeout(() => process.exit(code), 200);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
// a crash must not leave a zombie that looks alive: log (redacted) and exit non-zero so the supervisor restarts it
process.on("unhandledRejection", (e) => { log("error", `unhandledRejection: ${(e as Error)?.message ?? e}`); process.exit(1); });
process.on("uncaughtException", (e) => { log("error", `uncaughtException: ${e.message}`); process.exit(1); });

if (process.argv.includes("--check")) {
  // config + realtime self-test; never starts the source, never prints secrets
  log("info", `config OK: source ${source.name} [${source.kind}], signed: ${signKey ? "yes" : "NO"}, room ${room!.slice(0, 4)}…`);
  const t0 = Date.now();
  while (!link.ready() && Date.now() - t0 < 12_000) await new Promise((r) => setTimeout(r, 200));
  const okLink = link.ready();
  log(okLink ? "info" : "error", okLink ? "realtime link: connected" : "realtime link: NOT connected after 12 s (check SUPABASE_URL/KEY, network)");
  link.close();
  setTimeout(() => process.exit(okLink ? 0 : 1), 300);
} else {
  log("info", `listener start: source ${source.name} [${source.kind}], signed: ${signKey ? "yes" : "NO"}${source.kind === "tiktok-unofficial" ? " (UNOFFICIAL TikTok integration)" : " (REHEARSAL, not a real LIVE)"}`);
  source.run(handlers, ac.signal).catch((e) => { log("error", `fatal: ${(e as Error).message}`); process.exit(1); });
}
