import { memo } from "react";
import type { AtmSnapshot } from "../../lib/controller.ts";
import { LEVEL_LABEL, displayName, groupWelcomeText, hashSeed, welcomeText, type ThemeId } from "../../lib/levels.ts";

const ACCENT: Record<ThemeId, { c: string; label: string }> = {
  atm: { c: "#3fd16e", label: "VIRTUAL BANK" },
  reactor: { c: "#5fe0f0", label: "REACTOR CORE 01" },
  marble: { c: "#e0b050", label: "KINETIC MACHINE" },
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Names are DOM/CSS text (crisp, selectable by tests, no font download). Sits above the canvas. */
export const ThemeHud = memo(function ThemeHud({ snap }: { snap: AtmSnapshot }) {
  const theme = snap.visual.theme;
  const a = ACCENT[theme];
  const ev = snap.current;
  const active = snap.phase !== "standby" && ev;
  const seed = ev ? hashSeed(ev.id) : 0;
  const isJoin = snap.level === 0;
  const title = !ev
    ? ""
    : snap.group.length > 1
      ? groupWelcomeText(snap.group)
      : isJoin
        ? welcomeText(ev.username, seed)
        : `@${displayName(ev.username)}`;
  const sub = !ev ? "" : isJoin ? (snap.group.length > 1 ? `${snap.group.length} NEW VISITORS` : "NEW VISITOR") : `${ev.gift?.name ?? "Gift"}${ev.gift && ev.gift.count > 1 ? ` ×${ev.gift.count}` : ""}`;
  const recent = snap.recent.slice(0, 5);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: FONT, color: "#eef4f7" }}>
      <div style={{ position: "absolute", left: 22, top: 22, display: "flex", alignItems: "center", gap: 8, font: "600 11px/1 " + FONT, letterSpacing: 2.2, color: a.c, opacity: 0.85 }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: a.c, boxShadow: `0 0 6px ${a.c}` }} />
        {a.label}
      </div>
      {active && (
        <div
          key={`${snap.runKey}`}
          className="hud-in"
          data-testid="hud-welcome"
          style={{ position: "absolute", left: 22, right: 22, top: 56, padding: "14px 18px", background: "rgba(8,12,16,.66)", borderLeft: `3px solid ${a.c}`, borderRadius: 4 }}
        >
          <div style={{ font: "600 11px/1 " + FONT, letterSpacing: 2.4, color: a.c, marginBottom: 8 }}>
            {LEVEL_LABEL[snap.level].toUpperCase()}
            <span style={{ marginLeft: 10, letterSpacing: 3 }}>{"●".repeat(snap.level + 1)}<span style={{ opacity: 0.25 }}>{"●".repeat(4 - snap.level)}</span></span>
          </div>
          <div style={{ font: "700 26px/1.15 " + FONT, overflowWrap: "anywhere" }}>{title}</div>
          <div style={{ font: "500 14px/1.3 " + FONT, color: "#aab6bd", marginTop: 6 }}>{sub}</div>
        </div>
      )}
      {snap.visual.showRecent && recent.length > 0 && (
        <div data-testid="hud-recent" style={{ position: "absolute", left: 22, bottom: 22, maxWidth: 300, padding: "8px 12px", background: "rgba(8,12,16,.5)", borderLeft: `2px solid ${a.c}`, borderRadius: 3 }}>
          <div style={{ font: "600 10px/1 " + FONT, letterSpacing: 2.2, color: a.c, marginBottom: 6 }}>RECENT VISITORS</div>
          {recent.map((r) => (
            <div key={r.name} style={{ font: "500 13px/1.45 " + FONT, color: r.kind === "gift" ? "#ffe2a8" : "#dfe8ec", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.kind === "gift" ? "★ " : ""}@{r.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
