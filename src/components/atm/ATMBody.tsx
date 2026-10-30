import { memo, type ReactNode } from "react";

/** Metal casing: header plate + stacked sections. Body is 480×900 inside the 540×960 stage. */
export const ATMBody = memo(function ATMBody({ children }: { children: ReactNode }) {
  return (
    <div className="atm-metal" style={{ position: "absolute", left: 30, top: 30, width: 480, height: 900, borderRadius: 18, padding: "22px 24px", boxSizing: "border-box" }}>
      <div style={{ height: 44, borderRadius: 6, background: "#2b3036", color: "#d9dde1", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", font: "700 18px Arial, sans-serif", letterSpacing: 3 }}>
        <span>VIRTUAL BANK</span>
        <span style={{ fontSize: 14, letterSpacing: 2, color: "#8fd7a6" }}>ATM 24 JAM</span>
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </div>
  );
});
