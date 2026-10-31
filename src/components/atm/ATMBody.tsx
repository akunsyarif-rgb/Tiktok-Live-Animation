import { memo, type ReactNode } from "react";

export type LedMode = "idle" | "work" | "fast";

const LED_IDX = [0, 1, 2, 3, 4, 5, 6, 7];

/** Metal casing: header plate + stacked sections. Body is 480×900 inside the 540×960 stage. */
export const ATMBody = memo(function ATMBody({ children, ledMode = "idle", still = false }: { children: ReactNode; ledMode?: LedMode; still?: boolean }) {
  return (
    <div className={`atm-metal${still ? " atm-still" : ""}`} data-testid="atm-body" style={{ position: "absolute", left: 30, top: 30, width: 480, height: 900, borderRadius: 18, padding: "22px 24px", boxSizing: "border-box" }}>
      <div style={{ height: 44, borderRadius: 6, background: "#2b3036", color: "#d9dde1", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", font: "700 18px Arial, sans-serif", letterSpacing: 3 }}>
        <span>VIRTUAL BANK</span>
        <span style={{ fontSize: 14, letterSpacing: 2, color: "#8fd7a6" }}>ATM 24 JAM</span>
      </div>
      <div className="atm-leds" data-mode={ledMode} data-testid="atm-leds" style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, height: 8 }} aria-hidden>
        {LED_IDX.map((i) => <i key={i} style={{ ["--i" as string]: i }} />)}
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 15 }}>{children}</div>
    </div>
  );
});
