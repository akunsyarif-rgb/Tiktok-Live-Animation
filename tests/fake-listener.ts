// SIMULATED event source for tests: speaks the real protocol over the real transport with the real Outbox + signing,
// but the events are synthetic (source "simulator"). It proves the pipeline, NOT the TikTok connection.
// usage: node tests/fake-listener.ts <room> <realtimeUrl> <privateKey|none|forge>; stdin commands: join:3 comment:5 spam like:40 follow share small medium big special burst:200 dup forge stats
import { createLink } from "../src/lib/transport.ts";
import { Outbox } from "../src/lib/outbox.ts";
import { importPrivate, needsSignature, signMessage } from "../src/lib/sign.ts";
import { createSimEvent, type AtmEvent, type SimKind } from "../src/lib/events.ts";
import { DEFAULT_SETTINGS, type Msg } from "../src/lib/protocol.ts";
import { DEFAULT_VISUAL } from "../src/lib/levels.ts";

const [room, url, keyArg = "none"] = process.argv.slice(2) as [string, string, string?];
const key = keyArg && keyArg !== "none" && keyArg !== "forge" ? await importPrivate(keyArg) : null;
let sent = 0;
let lastAt: number | null = null;
let last: AtmEvent | null = null;
let savedClear: Msg | null = null;

const link = createLink(room, { url, key: "x".repeat(30) }, {
  onState: () => undefined,
  onMessage: (m: Msg) => { if (m.t === "ack") outbox.ack(m.id, m.result); },
});
const outbox: Outbox = new Outbox({
  from: "tiktok",
  paceMs: 40,
  send: (m) => {
    if (key && needsSignature(m.t)) { void signMessage(m as never, key).then((sm) => link.send(sm as Msg)); return link.ready(); }
    return link.send(m);
  },
});
setInterval(() => link.send({ v: 1, t: "listener", status: { state: "connected", target: "simulated_source", detail: "SIMULATED (test)", sent, undelivered: outbox.undelivered, lastEventAt: lastAt, attempts: 1 } }), 2000);

const submit = (e: AtmEvent) => { last = e; lastAt = Date.now(); sent++; outbox.submit(e); };
const KINDS = ["join", "small", "medium", "big", "special", "comment", "like", "follow", "share"] as const satisfies readonly SimKind[];

process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", (d: string) => {
  buf += d;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
    const [cmd = "", arg] = line.split(":");
    const n = Math.max(1, Number(arg) || 1);
    if ((KINDS as readonly string[]).includes(cmd)) for (let i = 0; i < n; i++) submit(createSimEvent(cmd as SimKind));
    else if (cmd === "spam") submit({ ...createSimEvent("comment"), text: "cek https://judi.example.com" });
    else if (cmd === "burst") for (let i = 0; i < n; i++) submit(createSimEvent((["join", "comment", "like", "follow", "share"] as const)[i % 5]!));
    else if (cmd === "dup" && last) outbox.submit({ ...last });
    else if (cmd === "forge") link.send({ v: 1, t: "event", from: "attacker", event: createSimEvent("special") }); // unsigned, bypasses signing
    else if (cmd === "stats") console.log(JSON.stringify({ stats: { sent, delivered: outbox.delivered, undelivered: outbox.undelivered, pending: outbox.pending } }));
    else if (cmd === "xss") {
      // markup in every user-controlled field, signed like a real event: must be displayed as inert text
      submit({ ...createSimEvent("comment"), username: "<img src=x onerror=window.__xss=1>", text: "<script>window.__xss=2</script><img src=x onerror=window.__xss=3>", avatarUrl: "javascript:window.__xss=4" });
      submit({ ...createSimEvent("join"), username: '"><svg onload=window.__xss=5>', avatarUrl: "data:text/html,<script>window.__xss=6</script>" });
    }
    else if (cmd === "forge-settings") link.send({ v: 1, t: "settings", settings: { ...DEFAULT_SETTINGS, muted: true, visual: { ...DEFAULT_VISUAL, backdrop: "night", idleEnabled: false } } }); // unsigned
    else if (cmd === "clear" && key) void signMessage({ v: 1, t: "clear" } as never, key).then((m) => { savedClear = m as Msg; link.send(m as Msg); });
    else if (cmd === "replay-clear" && savedClear) link.send(savedClear); // byte-identical re-send of a valid signed message
    else if (cmd === "quit") process.exit(0);
  }
});
console.log(JSON.stringify({ ready: true, signed: !!key }));
