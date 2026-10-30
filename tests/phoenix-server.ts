import { WebSocketServer, type WebSocket } from "ws";

/**
 * Minimal Phoenix-channel server (the wire protocol Supabase Realtime speaks) so the REAL
 * @supabase/realtime-js client can be exercised locally. It does NOT emulate Supabase's
 * auth, quotas or rate limits: those remain PENDING EXTERNAL VALIDATION.
 */
export async function startPhoenixServer() {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  const port = (wss.address() as { port: number }).port;
  const topics = new Map<WebSocket, Set<string>>();
  const urls: string[] = [];
  let accepting = true;

  // realtime-js (vsn 2.0.0) sends user broadcasts as binary frames: kind 3 in, kind 4 out
  const relayBinary = (from: WebSocket, buf: Buffer) => {
    if (buf[0] !== 3) return;
    const [, jrLen, refLen, topicLen, evLen, metaLen, enc] = buf as unknown as number[];
    let o = 7 + (jrLen as number) + (refLen as number);
    const topic = buf.subarray(o, o + (topicLen as number)); o += topicLen as number;
    const ev = buf.subarray(o, o + (evLen as number)); o += evLen as number;
    const meta = buf.subarray(o, o + (metaLen as number)); o += metaLen as number;
    const payload = buf.subarray(o);
    const out = Buffer.concat([Buffer.from([4, topic.length, ev.length, meta.length, enc as number]), topic, ev, meta, payload]);
    for (const [other, set] of topics) {
      if (other !== from && set.has(topic.toString()) && other.readyState === other.OPEN) other.send(out, { binary: true });
    }
  };

  wss.on("connection", (ws, req) => {
    if (!accepting) return ws.terminate();
    urls.push(req.url ?? "");
    topics.set(ws, new Set());
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return relayBinary(ws, raw as Buffer);
      let msg: unknown;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!Array.isArray(msg)) return;
      const [joinRef, ref, topic, event, payload] = msg as [string | null, string | null, string, string, unknown];
      if (event === "phx_join") {
        topics.get(ws)?.add(topic);
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
      } else if (event === "heartbeat") {
        ws.send(JSON.stringify([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }]));
      } else if (event === "phx_leave") {
        topics.get(ws)?.delete(topic);
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      } else if (event === "broadcast") {
        for (const [other, set] of topics) {
          if (other !== ws && set.has(topic) && other.readyState === other.OPEN) {
            other.send(JSON.stringify([null, null, topic, "broadcast", payload]));
          }
        }
      }
    });
    ws.on("close", () => topics.delete(ws));
  });

  return {
    url: `http://127.0.0.1:${port}`,
    urls,
    dropAll: () => wss.clients.forEach((c) => c.terminate()),
    pause: (v: boolean) => { accepting = !v; },
    close: () => new Promise<void>((r) => { wss.clients.forEach((c) => c.terminate()); wss.close(() => r()); }),
  };
}
