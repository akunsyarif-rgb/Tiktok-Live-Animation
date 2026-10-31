import { memo } from "react";
import type { AtmSnapshot } from "../../lib/controller.ts";
import type { ThemeId } from "../../lib/levels.ts";

/** DOM/CSS stand-in used when WebGL is unavailable or keeps failing. Same state, much simpler look. */
export const FallbackStage = memo(function FallbackStage({ theme, snap }: { theme: Exclude<ThemeId, "atm">; snap: AtmSnapshot }) {
  const active = snap.phase !== "standby";
  const lvl = active ? snap.level : -1;
  return (
    <div data-testid="fallback-stage" data-theme={theme} style={{ position: "absolute", inset: 0 }}>
      {theme === "reactor" ? (
        <div className={`fb-reactor ${active ? `fb-active fb-l${lvl}` : ""} ${snap.visual.idleEnabled ? "" : "fb-still"}`}>
          <i className="fb-ring r1" /><i className="fb-ring r2" /><i className="fb-ring r3" /><i className="fb-core" />
        </div>
      ) : (
        <div className={`fb-marble ${active ? `fb-active fb-l${lvl}` : ""} ${snap.visual.idleEnabled ? "" : "fb-still"}`}>
          <i className="fb-rail" /><i className="fb-ball" /><i className="fb-ball b2" /><i className="fb-gear" />
        </div>
      )}
    </div>
  );
});
