import { memo, type ReactNode } from "react";
import { DEFAULT_TIMING } from "../../lib/controller.ts";

export const TRAY_W = 400;
export const TRAY_H = 150;

interface Props {
  active: boolean;
  /** true during the last part of the "complete" phase → customer takes the cash */
  children: ReactNode;
  taking: boolean;
}

/** Slot lip + recessed tray. The tray window clips notes so they appear to emerge from the slot. */
export const CashSlot = memo(function CashSlot({ active, taking, children }: Props) {
  return (
    <div className="atm-idle-mech" style={{ width: TRAY_W + 24, margin: "0 auto" }}>
      <div className="atm-panel" style={{ height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "86%", height: 7, borderRadius: 3, background: "#14171a", position: "relative" }}>
          <div
            className={active ? "slot-active" : undefined}
            style={{ position: "absolute", inset: "0 6px", top: 5, height: 2, background: active ? "#3fd16e" : "#2f3a33", borderRadius: 1 }}
          />
        </div>
      </div>
      <div
        style={{
          position: "relative", width: TRAY_W, height: TRAY_H, margin: "0 12px", overflow: "hidden",
          background: "linear-gradient(180deg,#050607,#15181b)", boxShadow: "inset 0 6px 10px rgba(0,0,0,.8)", borderRadius: "0 0 6px 6px",
        }}
      >
        <div
          className={taking ? "cash-taken" : undefined}
          style={{ position: "absolute", inset: 0, ["--take-delay" as string]: `${(DEFAULT_TIMING.completeHoldMs - 500) / 1000}s` }}
        >
          {children}
        </div>
        {/* front lip of the tray */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 26, zIndex: 20 }} className="atm-metal" />
      </div>
    </div>
  );
});
