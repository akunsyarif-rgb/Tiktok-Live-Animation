import { memo } from "react";
import type { AmbientSnapshot } from "../../lib/director.ts";

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** Ambient lane display: comments (max 3), aggregated likes, follow/share toast. Separate area → can never overlap the dispenser. */
export const AmbientHud = memo(function AmbientHud({ a }: { a: AmbientSnapshot }) {
  const hasTop = a.like || a.toast;
  return (
    <div data-testid="ambient-hud" style={{ position: "absolute", left: 18, right: 18, top: 10, pointerEvents: "none", fontFamily: FONT, color: "#f1ece0", display: "flex", flexDirection: "column", gap: 6 }}>
      {hasTop && (
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", minHeight: 26 }}>
          {a.toast ? (
            <div key={a.toast.id} className="hud-in" data-testid="ambient-toast" style={{ padding: "4px 12px", borderRadius: 14, background: "rgba(20,16,10,.78)", border: "1px solid rgba(216,192,138,.6)", font: "600 13px/1.2 " + FONT, color: "#f3e3b8" }}>
              {a.toast.kind === "follow" ? "＋ " : "↗ "}{a.toast.text}
            </div>
          ) : <span />}
          {a.like && (
            <div key={a.like.until} className="hud-in" data-testid="ambient-likes" style={{ padding: "4px 10px", borderRadius: 14, background: "rgba(20,16,10,.78)", font: "600 13px/1.2 " + FONT, color: "#ffb3c1" }}>
              ♥ +{a.like.count.toLocaleString("en-US")} <span style={{ color: "#c9b99a", fontWeight: 500 }}>· {a.like.total.toLocaleString("en-US")}</span>
            </div>
          )}
        </div>
      )}
      {a.comments.map((c) => (
        <div key={c.id} className="hud-in" data-testid="ambient-comment" style={{ padding: "5px 12px", borderRadius: 4, background: "rgba(10,12,18,.74)", borderLeft: "3px solid #d8c08a", font: "500 14px/1.3 " + FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b style={{ color: "#d8c08a", fontWeight: 600 }}>@{c.name}</b> {c.text}
        </div>
      ))}
      {a.moreComments > 0 && a.comments.length > 0 && <div style={{ font: "500 11px/1 " + FONT, color: "#b8aa8c", paddingLeft: 4 }}>+{a.moreComments} more comments</div>}
    </div>
  );
});
