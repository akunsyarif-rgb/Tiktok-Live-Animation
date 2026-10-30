/**
 * TikTok LIVE listener — UNOFFICIAL integration (tiktok-live-connector, AGPL-3.0, reverse-engineered protocol).
 * Reads viewer joins + gifts from a LIVE room and forwards them to the ATM overlay via Supabase Realtime Broadcast.
 *
 * Needs a Node >= 22 process that stays running during the LIVE (your PC, a Codespace, a small VPS).
 * Vercel serverless cannot host it. See docs/TIKTOK_LIVE.md.
 *
 * Env (never commit):  TIKTOK_USERNAME  SUPABASE_URL  SUPABASE_ANON_KEY  ATM_ROOM
 * Optional:            EULER_API_KEY  ATM_LARGE_GIFT_DIAMONDS(1000)  ATM_MAX_JOINS_PER_MIN(30)
 */
import { createLink, type Link } from "../src/lib/transport.ts";
import { readRemoteConfig, normalizeRoom } from "../src/lib/config.ts";
import { Outbox } from "../src/lib/outbox.ts";
import { DiagLog } from "../src/lib/diag.ts";
import { mapGift, mapMember, DEFAULT_LARGE_GIFT_DIAMONDS } from "../src/lib/tiktok-map.ts";
import type { ListenerState, ListenerStatus, Msg } from "../src/lib/protocol.ts";

const env = process.env;
const username = (env.TIKTOK_USERNAME ?? "").replace(/^@/, "").trim();
const room = normalizeRoom(env.ATM_ROOM);
const remote = readRemoteConfig(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
const largeDiamonds = Number(env.ATM_LARGE_GIFT_DIAMONDS ?? DEFAULT_LARGE_GIFT_DIAMONDS);
const maxJoinsPerMin = Number(env.ATM_MAX_JOINS_PER_MIN ?? 30);

const diag = new DiagLog();
const log = (level: "info" | "warn" | "error", msg: string) => {
  diag.add(level, msg);
  console.log(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`);
};

if (!username) fatal("TIKTOK_USERNAME is required");
if (!room) fatal("ATM_ROOM missing or invalid (16-64 chars A-Z a-z 0-9 _ -). Copy it from /control.");
if (!remote.ok) fatal(`Supabase config: ${remote.reason}`);

function fatal(msg: string): never {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

let state: ListenerState = "idle";
let detail = "";
let attempts = 0;
let sent = 0;
let lastEventAt: number | null = null;
let stopping = false;

const outbox = new Outbox({
  from: "tiktok",
  log,
  send: (m) => link.send(m),
});

const link: Link = createLink(room!, remote.ok ? remote.config : null, {
  onState: (name, s, d) => log("info", `link ${name}: ${s}${d ? ` (${d})` : ""}`),
  onMessage: (m: Msg) => {
    if (m.t === "ack") outbox.ack(m.id, m.result);
    else if (m.t === "ping") publishStatus();
  },
});

function publishStatus(): void {
  const status: ListenerStatus = {
    state, target: username, detail, sent, undelivered: outbox.undelivered, lastEventAt, attempts,
  };
  link.send({ v: 1, t: "listener", status });
}
function setState(s: ListenerState, d = ""): void {
  state = s;
  detail = d;
  log(s === "error" ? "error" : "info", `tiktok ${s}${d ? `: ${d}` : ""}`);
  publishStatus();
}
const heartbeat = setInterval(publishStatus, 5000);

// join rate limit: protects Supabase quota and the queue in big rooms. Gifts are never limited.
let joinWindowStart = Date.now();
let joinsInWindow = 0;
function joinAllowed(): boolean {
  const now = Date.now();
  if (now - joinWindowStart > 60_000) { joinWindowStart = now; joinsInWindow = 0; }
  joinsInWindow += 1;
  return joinsInWindow <= maxJoinsPerMin;
}

function forward(ev: NonNullable<ReturnType<typeof mapMember>>): void {
  outbox.submit(ev);
  sent += 1;
  lastEventAt = Date.now();
  log("info", `→ ${ev.type} @${ev.username}${ev.gift ? ` ${ev.gift.name}x${ev.gift.count} (${ev.gift.diamonds}💎)` : ""}`);
}

function backoffMs(attempt: number, base = 5000): number {
  const exp = Math.min(120_000, base * 2 ** Math.min(attempt, 5));
  return exp / 2 + Math.random() * (exp / 2);
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function run(): Promise<void> {
  const lib = await import("tiktok-live-connector");
  while (!stopping) {
    attempts += 1;
    setState(attempts > 1 ? "reconnecting" : "connecting", `attempt ${attempts}`);
    const conn = new lib.TikTokLiveConnection(username, env.EULER_API_KEY ? { signApiKey: env.EULER_API_KEY } : {});
    let waitMs = backoffMs(attempts);
    const closed = new Promise<void>((resolve) => {
      conn.on(lib.ControlEvent.DISCONNECTED, () => resolve());
      conn.on(lib.ControlEvent.ERROR, (err: unknown) => log("warn", `tiktok error event: ${(err as Error)?.message ?? err}`));
    });
    conn.on(lib.WebcastEvent.MEMBER, (data: unknown) => {
      const ev = mapMember(data);
      if (ev && joinAllowed()) forward(ev);
    });
    conn.on(lib.WebcastEvent.GIFT, (data: unknown) => {
      const ev = mapGift(data, { largeDiamonds });
      if (ev) forward(ev);
    });
    try {
      const s = await conn.connect();
      attempts = 0;
      setState("connected", `room ${(s as { roomId?: string })?.roomId ?? "?"}`);
      await closed;
      setState("reconnecting", "disconnected by TikTok");
      waitMs = 3000;
    } catch (err) {
      const name = (err as Error)?.constructor?.name ?? "Error";
      const msg = (err as Error)?.message ?? String(err);
      if (name === "UserOfflineError") { setState("offline", "streamer is not LIVE yet; retrying"); waitMs = 30_000 + Math.random() * 30_000; }
      else if (name === "SignatureRateLimitError") { setState("error", "sign server rate limited; backing off (consider EULER_API_KEY)"); waitMs = 120_000; }
      else setState("error", `${name}: ${msg}`.slice(0, 160));
    } finally {
      try { await conn.disconnect(); } catch { /* already closed */ }
    }
    if (!stopping) { log("info", `retry in ${Math.round(waitMs / 1000)}s`); await sleep(waitMs); }
  }
}

function shutdown(): void {
  stopping = true;
  clearInterval(heartbeat);
  outbox.stop();
  setState("idle", "stopped");
  setTimeout(() => { link.close(); process.exit(0); }, 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("info", `listener start: target @${username}, large gift ≥ ${largeDiamonds} diamonds, joins ≤ ${maxJoinsPerMin}/min (UNOFFICIAL TikTok integration)`);
run().catch((e) => { log("error", `fatal: ${(e as Error).message}`); process.exit(1); });
