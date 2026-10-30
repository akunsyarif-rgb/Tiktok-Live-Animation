import { memo } from "react";

export const CardReader = memo(function CardReader({ active }: { active: boolean }) {
  return (
    <div className="atm-panel" style={{ width: 150, padding: 10, borderRadius: 6 }} aria-hidden>
      <div style={{ font: "700 10px Arial", color: "#2a2e33", letterSpacing: 1, textAlign: "center", marginBottom: 6 }}>KARTU / CARD</div>
      <div style={{ height: 14, borderRadius: 3, background: "#0b0d0f", boxShadow: "inset 0 2px 3px #000", position: "relative" }}>
        <div style={{ position: "absolute", left: 8, right: 8, top: 6, height: 2, background: "#262b30" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 14, color: "#2a2e33" }}>▶</span>
        <span
          className={active ? "led-pulse" : undefined}
          style={{ width: 10, height: 10, borderRadius: 5, background: active ? "#3fd16e" : "#2f3a33", boxShadow: "inset 0 0 0 1px #00000066" }}
        />
      </div>
    </div>
  );
});
