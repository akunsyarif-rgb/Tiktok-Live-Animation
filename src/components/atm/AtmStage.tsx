"use client";

import { useSyncExternalStore, memo } from "react";
import type { AtmController, AtmSnapshot } from "../../lib/controller.ts";
import { ATMBody } from "./ATMBody.tsx";
import { ATMScreen } from "./ATMScreen.tsx";
import { ATMKeypad } from "./ATMKeypad.tsx";
import { CardReader } from "./CardReader.tsx";
import { CashSlot, TRAY_W } from "./CashSlot.tsx";
import { TransactionDisplay } from "./TransactionDisplay.tsx";
import { SingleNoteAnimation } from "./SingleNoteAnimation.tsx";
import { CashBundleAnimation } from "./CashBundleAnimation.tsx";

export const STAGE_W = 540;
export const STAGE_H = 960;

const Notes = memo(function Notes({ snap }: { snap: AtmSnapshot }) {
  const { plan, runKey } = snap;
  if (!plan) return null;
  if (plan.kind === "bundle") {
    return <CashBundleAnimation key={runKey} denom={plan.notes[0] ?? 100000} total={plan.total} trayWidth={TRAY_W} />;
  }
  return (
    <>
      {plan.notes.map((d, i) => (
        <SingleNoteAnimation key={`${runKey}-${i}`} denom={d} index={i} total={plan.notes.length} trayWidth={TRAY_W} />
      ))}
    </>
  );
});

/** 540×960 portrait ATM. Scale it with <StageScaler>. */
export function AtmStage({ controller }: { controller: AtmController }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const dispensing = snap.phase === "dispensing" || snap.phase === "complete";
  return (
    <div style={{ position: "relative", width: STAGE_W, height: STAGE_H }}>
      <ATMBody>
        <ATMScreen>
          <TransactionDisplay phase={snap.phase} event={snap.current} plan={snap.plan} runKey={snap.runKey} />
        </ATMScreen>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <ATMKeypad active={snap.phase === "processing"} />
          <CardReader active={snap.phase === "processing"} />
        </div>
        <CashSlot active={snap.phase === "dispensing"} taking={snap.phase === "complete"}>
          {dispensing ? <Notes snap={snap} /> : null}
        </CashSlot>
        <div style={{ textAlign: "center", font: "700 11px Arial, sans-serif", letterSpacing: 1, color: "#3a3f45" }}>
          UANG HIBURAN VIRTUAL · BUKAN ALAT PEMBAYARAN YANG SAH
        </div>
      </ATMBody>
    </div>
  );
}
