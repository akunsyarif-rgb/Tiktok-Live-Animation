import type { EventSourceAdapter, SourceHandlers } from "../../src/lib/source.ts";
import { backoffMs, sleepAbortable } from "../../src/lib/source.ts";
import { mapComment, mapFollow, mapGift, mapLikeBatch, likeCountOf, mapMember, mapShare } from "../../src/lib/tiktok-map.ts";

export interface TikTokConfig {
  username: string;
  signApiKey?: string;
  largeDiamonds: number;
  maxJoinsPerMin: number;
  maxCommentsPerMin: number;
}

function perMinute(limit: number): () => boolean {
  let start = Date.now();
  let n = 0;
  return () => {
    const now = Date.now();
    if (now - start > 60_000) { start = now; n = 0; }
    n += 1;
    return n <= limit;
  };
}

/**
 * UNOFFICIAL: tiktok-live-connector (AGPL-3.0) reverse-engineers TikTok's web LIVE protocol and depends on a third-party
 * signing service. It can break whenever TikTok changes anything. Supported events here: member (join), chat, gift, like,
 * follow, share. Payload shapes are read defensively and have NOT been verified against a real LIVE.
 */
export function tiktokSource(cfg: TikTokConfig): EventSourceAdapter {
  return {
    name: `tiktok:@${cfg.username}`,
    kind: "tiktok-unofficial",
    async run(h: SourceHandlers, signal: AbortSignal): Promise<void> {
      const lib = await import("tiktok-live-connector");
      const joinOk = perMinute(cfg.maxJoinsPerMin), chatOk = perMinute(cfg.maxCommentsPerMin), followOk = perMinute(60), shareOk = perMinute(60);
      let likeAcc = 0;
      // likes arrive in floods: sum them and emit ONE event per 2 s
      const likeTimer = setInterval(() => {
        const ev = likeAcc > 0 ? mapLikeBatch(likeAcc) : null;
        likeAcc = 0;
        if (ev) h.emit(ev);
      }, 2000);
      let attempts = 0;
      try {
        while (!signal.aborted) {
          attempts += 1;
          h.state(attempts > 1 ? "reconnecting" : "connecting", `attempt ${attempts}`);
          const conn = new lib.TikTokLiveConnection(cfg.username, cfg.signApiKey ? { signApiKey: cfg.signApiKey } : {});
          let waitMs = backoffMs(attempts);
          const closed = new Promise<void>((resolve) => {
            conn.on(lib.ControlEvent.DISCONNECTED, () => resolve());
            conn.on(lib.ControlEvent.ERROR, (err: unknown) => h.log("warn", `tiktok error event: ${(err as Error)?.message ?? err}`));
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
          conn.on(lib.WebcastEvent.MEMBER, (d: unknown) => { const e = mapMember(d); if (e && joinOk()) h.emit(e); });
          conn.on(lib.WebcastEvent.CHAT, (d: unknown) => { const e = mapComment(d); if (e && chatOk()) h.emit(e); });
          conn.on(lib.WebcastEvent.FOLLOW, (d: unknown) => { const e = mapFollow(d); if (e && followOk()) h.emit(e); });
          conn.on(lib.WebcastEvent.SHARE, (d: unknown) => { const e = mapShare(d); if (e && shareOk()) h.emit(e); });
          conn.on(lib.WebcastEvent.LIKE, (d: unknown) => { likeAcc += likeCountOf(d); });
          conn.on(lib.WebcastEvent.GIFT, (d: unknown) => { const e = mapGift(d, { largeDiamonds: cfg.largeDiamonds }); if (e) h.emit(e); });
          try {
            const s = await conn.connect();
            attempts = 0;
            h.state("connected", `room ${(s as { roomId?: string })?.roomId ?? "?"}`);
            await closed;
            if (!signal.aborted) { h.state("reconnecting", "disconnected by TikTok"); waitMs = 3000; }
          } catch (err) {
            const name = (err as Error)?.constructor?.name ?? "Error";
            const msg = (err as Error)?.message ?? String(err);
            if (name === "UserOfflineError") { h.state("offline", "streamer is not LIVE yet; retrying"); waitMs = 30_000 + Math.random() * 30_000; }
            else if (name === "SignatureRateLimitError") { h.state("error", "sign server rate limited; backing off (consider EULER_API_KEY)"); waitMs = 120_000; }
            else h.state("error", `${name}: ${msg}`.slice(0, 160));
          } finally {
            try { await conn.disconnect(); } catch { /* already closed */ }
          }
          if (!signal.aborted) { h.log("info", `retry in ${Math.round(waitMs / 1000)}s`); await sleepAbortable(waitMs, signal); }
        }
      } finally {
        clearInterval(likeTimer);
      }
    },
  };
}
