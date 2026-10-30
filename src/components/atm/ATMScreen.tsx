import { memo, type ReactNode } from "react";

const SoftKeys = () => (
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", height: "100%", padding: "10px 0" }}>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="atm-key" style={{ width: 22, height: 14, borderRadius: 2, boxShadow: "0 2px 0 #6c7279, inset 0 1px 0 #eef0f2" }} />
    ))}
  </div>
);

/** Bezel + dark glass. Soft keys are decorative. */
export const ATMScreen = memo(function ATMScreen({ children }: { children: ReactNode }) {
  return (
    <div className="atm-panel" style={{ display: "flex", alignItems: "stretch", gap: 8, padding: "12px 10px", borderRadius: 8, height: 310 }} aria-hidden>
      <SoftKeys />
      <div className="screen-glass" style={{ position: "relative", flex: 1, borderRadius: 6, border: "3px solid #1b1e21", overflow: "hidden" }}>{children}</div>
      <SoftKeys />
    </div>
  );
});
