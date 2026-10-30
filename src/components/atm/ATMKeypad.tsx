import { memo } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/** Decorative: keys flash while a transaction is processing. */
export const ATMKeypad = memo(function ATMKeypad({ active }: { active: boolean }) {
  return (
    <div className="atm-panel" style={{ padding: 10, borderRadius: 6, display: "flex", gap: 8 }} aria-hidden>
      <div className={active ? "keypad-active" : undefined} style={{ display: "grid", gridTemplateColumns: "repeat(3, 46px)", gap: 7 }}>
        {KEYS.map((k) => (
          <div key={k} className="atm-key" style={{ height: 40, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>{k}</div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {[["#b5483f", "BATAL"], ["#c9a93d", "HAPUS"], ["#4c9a5e", "ENTER"]].map(([c, label]) => (
          <div key={label} style={{ width: 64, height: 40, borderRadius: 5, background: c, boxShadow: "0 2px 0 #00000055", font: "700 10px Arial", color: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>{label}</div>
        ))}
      </div>
    </div>
  );
});
