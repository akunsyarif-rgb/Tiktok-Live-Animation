import { memo } from "react";
import type { AtmEvent } from "../../lib/events.ts";
import { formatRupiah, type DispensePlan } from "../../lib/dispense.ts";
import { LEVEL_LABEL, displayName, groupWelcomeText, hashSeed, welcomeText, type GiftLevel } from "../../lib/levels.ts";
import type { RecentItem } from "../../lib/controller.ts";
import { DEFAULT_TIMING, type Phase } from "../../lib/controller.ts";
import { Avatar } from "./Avatar.tsx";

interface Props {
  phase: Phase;
  event: AtmEvent | null;
  plan: DispensePlan | null;
  runKey: number;
  level: GiftLevel;
  group: string[];
  recent: RecentItem[];
}

function describe(e: AtmEvent, level: GiftLevel): string {
  if (e.type === "VIEWER_JOIN") return "PENONTON BARU · NEW VISITOR";
  const g = e.gift;
  return `${LEVEL_LABEL[level].toUpperCase()}: ${(g?.name ?? "GIFT").toUpperCase()}${g && g.count > 1 ? ` x${g.count}` : ""}`;
}

export const TransactionDisplay = memo(function TransactionDisplay({ phase, event, plan, runKey, level, group, recent }: Props) {
  return (
    <div className="screen-text" style={{ position: "absolute", inset: 0, padding: "20px 22px", display: "flex", flexDirection: "column", fontSize: 18, lineHeight: 1.35 }}>
      {phase === "standby" || !event ? (
        <div key="standby" data-testid="atm-idle" style={{ flex: 1, position: "relative" }}>
          <div className="idle-msg" style={{ ["--k" as string]: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>SELAMAT DATANG</div>
            <div className="screen-dim" style={{ fontSize: 15 }}>WELCOME</div>
            <div className="blink" style={{ marginTop: 22, fontSize: 18 }}>SILAKAN MASUKKAN KARTU</div>
            <div className="screen-dim" style={{ fontSize: 13 }}>PLEASE INSERT YOUR CARD</div>
          </div>
          <div className="idle-msg" style={{ ["--k" as string]: 1 }}>
            <div className="screen-dim" style={{ fontSize: 13 }}>SELF TEST</div>
            <div style={{ fontSize: 20 }}>PEMERIKSAAN SISTEM</div>
            <div style={{ fontSize: 15 }}>ROLLER ......... OK</div>
            <div style={{ fontSize: 15 }}>SENSOR ......... OK</div>
            <div style={{ fontSize: 15 }}>JARINGAN ....... OK</div>
          </div>
          <div className="idle-msg" style={{ ["--k" as string]: 2 }}>
            <div className="screen-dim" style={{ fontSize: 13 }}>KASET UANG · CASH CASSETTE</div>
            <div style={{ fontSize: 18 }}>KASET 1 ▮▮▮▮▮▮▮▮▮▮ 100%</div>
            <div style={{ fontSize: 18 }}>KASET 2 ▮▮▮▮▮▮▮▮▮▯ 92%</div>
            <div className="screen-dim" style={{ fontSize: 13 }}>UANG HIBURAN VIRTUAL</div>
          </div>
          <div className="idle-msg" style={{ ["--k" as string]: 3 }}>
            <div className="screen-dim" style={{ fontSize: 13 }}>PENGUNJUNG TERAKHIR · RECENT VISITORS</div>
            {recent.length === 0 ? <div style={{ fontSize: 18 }}>MENUNGGU PENGUNJUNG…</div> : recent.slice(0, 4).map((r) => (
              <div key={r.name} style={{ fontSize: 17 }}>{r.kind === "gift" ? "★ " : "› "}@{r.name}</div>
            ))}
          </div>
        </div>
      ) : (
        <div key={`${runKey}-${phase === "processing" ? "p" : "d"}`} className="fade-in" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar url={event.avatarUrl} name={event.username} size={56} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{displayName(event.username)}</div>
              <div className="screen-dim" style={{ fontSize: 13 }}>{describe(event, level)}</div>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
            {phase === "processing" && (
              <>
                {level === 0 ? (
                  <div data-testid="atm-welcome" style={{ fontSize: 21, fontWeight: 700 }}>{group.length > 1 ? groupWelcomeText(group, 4) : welcomeText(event.username, hashSeed(event.id))}</div>
                ) : (
                  <div>MEMPROSES TRANSAKSI<span className="blink">...</span></div>
                )}
                <div className="screen-dim" style={{ fontSize: 13 }}>{level === 0 ? "TRANSAKSI SELAMAT DATANG" : "PROCESSING TRANSACTION"}</div>
                <div style={{ height: 12, border: "1px solid #3fd16e", padding: 2, marginTop: 6 }}>
                  <div className="progress-bar" style={{ height: "100%", background: "#3fd16e", ["--dur" as string]: `${(event.type === "VIEWER_JOIN" ? DEFAULT_TIMING.processingJoinMs : DEFAULT_TIMING.processingGiftMs) / 1000}s` }} />
                </div>
              </>
            )}
            {phase === "dispensing" && plan && (
              <>
                <div className={level === 4 ? "special-screen" : undefined} style={level === 4 ? { padding: 6, fontWeight: 700 } : undefined}>{level === 4 ? "★ SPECIAL TRANSACTION ★" : "TRANSAKSI DISETUJUI"}</div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{formatRupiah(plan.total)}</div>
                <div className="screen-dim" style={{ fontSize: 13 }}>{plan.kind === "bundle" ? `1 BUNDLE · ${plan.notes.length} LEMBAR` : plan.kind === "double" ? `2 BUNDLE · ${plan.notes.length} LEMBAR` : `${plan.notes.length} LEMBAR`} · UANG VIRTUAL</div>
                <div className="blink">MOHON TUNGGU...</div>
              </>
            )}
            {phase === "complete" && plan && (
              <>
                <div style={{ fontSize: 24, fontWeight: 700 }}>SILAKAN AMBIL UANG ANDA</div>
                <div className="screen-dim" style={{ fontSize: 13 }}>PLEASE TAKE YOUR CASH · {formatRupiah(plan.total)}</div>
                <div style={{ marginTop: 8 }}>TERIMA KASIH, @{displayName(event.username)}</div>
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
