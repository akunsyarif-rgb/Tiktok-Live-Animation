import { memo } from "react";
import type { AtmEvent } from "../../lib/events.ts";
import { formatRupiah, type DispensePlan } from "../../lib/dispense.ts";
import { DEFAULT_TIMING, type Phase } from "../../lib/controller.ts";
import { Avatar } from "./Avatar.tsx";

interface Props {
  phase: Phase;
  event: AtmEvent | null;
  plan: DispensePlan | null;
  runKey: number;
}

function describe(e: AtmEvent): string {
  if (e.type === "VIEWER_JOIN") return "PENARIKAN: PENONTON BARU";
  const g = e.gift;
  return `HADIAH: ${(g?.name ?? "GIFT").toUpperCase()}${g && g.count > 1 ? ` x${g.count}` : ""}`;
}

export const TransactionDisplay = memo(function TransactionDisplay({ phase, event, plan, runKey }: Props) {
  return (
    <div className="screen-text" style={{ position: "absolute", inset: 0, padding: "20px 22px", display: "flex", flexDirection: "column", fontSize: 18, lineHeight: 1.35 }}>
      {phase === "standby" || !event ? (
        <div key="standby" className="fade-in" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>SELAMAT DATANG</div>
          <div className="screen-dim" style={{ fontSize: 15 }}>WELCOME</div>
          <div className="blink" style={{ marginTop: 22, fontSize: 18 }}>SILAKAN MASUKKAN KARTU</div>
          <div className="screen-dim" style={{ fontSize: 13 }}>PLEASE INSERT YOUR CARD</div>
        </div>
      ) : (
        <div key={`${runKey}-${phase === "processing" ? "p" : "d"}`} className="fade-in" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar url={event.avatarUrl} name={event.username} size={56} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{event.username}</div>
              <div className="screen-dim" style={{ fontSize: 13 }}>{describe(event)}</div>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
            {phase === "processing" && (
              <>
                <div>MEMPROSES TRANSAKSI<span className="blink">...</span></div>
                <div className="screen-dim" style={{ fontSize: 13 }}>PROCESSING TRANSACTION</div>
                <div style={{ height: 12, border: "1px solid #3fd16e", padding: 2, marginTop: 6 }}>
                  <div className="progress-bar" style={{ height: "100%", background: "#3fd16e", ["--dur" as string]: `${(event.type === "VIEWER_JOIN" ? DEFAULT_TIMING.processingJoinMs : DEFAULT_TIMING.processingGiftMs) / 1000}s` }} />
                </div>
              </>
            )}
            {phase === "dispensing" && plan && (
              <>
                <div>TRANSAKSI DISETUJUI</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{formatRupiah(plan.total)}</div>
                <div className="screen-dim" style={{ fontSize: 13 }}>{plan.notes.length > 1 && plan.kind === "bundle" ? `1 BUNDLE · ${plan.notes.length} LEMBAR` : `${plan.notes.length} LEMBAR`} · UANG VIRTUAL</div>
                <div className="blink">MOHON TUNGGU...</div>
              </>
            )}
            {phase === "complete" && plan && (
              <>
                <div style={{ fontSize: 24, fontWeight: 700 }}>SILAKAN AMBIL UANG ANDA</div>
                <div className="screen-dim" style={{ fontSize: 13 }}>PLEASE TAKE YOUR CASH · {formatRupiah(plan.total)}</div>
                <div style={{ marginTop: 8 }}>TERIMA KASIH, @{event.username}</div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="screen-dim" style={{ borderTop: "1px solid #1d4d30", paddingTop: 6, fontSize: 10.5, textAlign: "center" }}>
        UANG HIBURAN VIRTUAL · BUKAN ALAT PEMBAYARAN YANG SAH
      </div>
    </div>
  );
});
