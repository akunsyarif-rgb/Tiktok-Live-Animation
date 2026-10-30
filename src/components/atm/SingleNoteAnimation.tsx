import { memo, type CSSProperties } from "react";
import type { Denomination } from "../../lib/dispense.ts";
import { NOTE_START_MS, NOTE_STAGGER_MS, NOTE_TRAVEL_MS } from "../../lib/dispense.ts";
import { Banknote, NOTE_W } from "./Banknote.tsx";

interface Props {
  denom: Denomination;
  index: number;
  total: number;
  /** Tray window width, px. */
  trayWidth: number;
}

/** One note sliding out of the slot into the tray; index/total fan multiple notes. */
export const SingleNoteAnimation = memo(function SingleNoteAnimation({ denom, index, total, trayWidth }: Props) {
  const mid = (total - 1) / 2;
  const spread = total > 1 ? Math.min(34, 130 / (total - 1)) : 0;
  const x = (trayWidth - NOTE_W) / 2 + (index - mid) * spread;
  const style = {
    "--x": `${x}px`,
    "--y": `${34 + (index % 2) * 5}px`,
    "--rot": `${(index - mid) * 2.5}deg`,
    "--delay": `${(NOTE_START_MS + index * NOTE_STAGGER_MS) / 1000}s`,
    "--travel": `${NOTE_TRAVEL_MS / 1000}s`,
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: index + 1,
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,.45))",
  } as CSSProperties;
  return (
    <div className="note-out" style={style}>
      <Banknote denom={denom} />
    </div>
  );
});
