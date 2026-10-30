import { memo, type CSSProperties } from "react";
import { BUNDLE_START_MS, BUNDLE_TRAVEL_MS, formatRupiah, type Denomination } from "../../lib/dispense.ts";
import { Banknote, NOTE_H, NOTE_W } from "./Banknote.tsx";

interface Props {
  denom: Denomination;
  total: number;
  trayWidth: number;
}

/** Strapped stack of notes. Strap states the total and that it is virtual. */
export const CashBundleAnimation = memo(function CashBundleAnimation({ denom, total, trayWidth }: Props) {
  const style = {
    "--x": `${(trayWidth - NOTE_W) / 2}px`,
    "--y": "30px",
    "--rot": "0deg",
    "--delay": `${BUNDLE_START_MS / 1000}s`,
    "--travel": `${BUNDLE_TRAVEL_MS / 1000}s`,
    position: "absolute",
    left: 0,
    top: 0,
    width: NOTE_W,
    height: NOTE_H + 10,
    zIndex: 5,
    filter: "drop-shadow(0 3px 3px rgba(0,0,0,.5))",
  } as CSSProperties;
  return (
    <div className="note-out" style={style}>
      {[8, 6, 4, 2].map((o) => (
        <div key={o} style={{ position: "absolute", left: 0, top: o, width: NOTE_W, height: NOTE_H, borderRadius: 3, background: "#7d2e2e", boxShadow: "inset 0 0 0 1px #5a1f1f" }} />
      ))}
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <Banknote denom={denom} />
      </div>
      <div
        style={{
          position: "absolute", left: NOTE_W * 0.5, top: -2, width: NOTE_W * 0.17, height: NOTE_H + 12,
          background: "#e9dfc4", boxShadow: "inset 0 0 0 1px #b7a984",
          color: "#4a3f22", font: "700 7px/1.2 Arial, sans-serif", textAlign: "center",
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}
      >
        <span>{formatRupiah(total)}</span>
        <span style={{ fontWeight: 400 }}>VIRTUAL</span>
      </div>
    </div>
  );
});
