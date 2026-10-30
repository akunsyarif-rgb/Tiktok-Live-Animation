import { memo, useId } from "react";
import type { Denomination } from "../../lib/dispense.ts";
import { formatRupiah } from "../../lib/dispense.ts";

const PALETTE: Record<Denomination, { base: string; dark: string; light: string }> = {
  100000: { base: "#c25a5a", dark: "#7d2e2e", light: "#e8b3b3" },
  50000: { base: "#4f86b8", dark: "#264a70", light: "#b4d0e8" },
  20000: { base: "#5b9a6c", dark: "#2b5b3a", light: "#b7dcc1" },
  10000: { base: "#8a63a8", dark: "#4a2d63", light: "#d3bde3" },
  5000: { base: "#a88255", dark: "#5e4425", light: "#e0cba9" },
  2000: { base: "#8b939c", dark: "#454c54", light: "#cfd4d9" },
};

export const NOTE_W = 200;
export const NOTE_H = Math.round((NOTE_W * 140) / 300);

/** Virtual entertainment note, rupiah-inspired palette. Deliberately not a reproduction of any real banknote. */
export const Banknote = memo(function Banknote({ denom }: { denom: Denomination }) {
  const uid = useId().replace(/:/g, "");
  const c = PALETTE[denom];
  const num = String(denom / 1000);
  return (
    <svg viewBox="0 0 300 140" width={NOTE_W} height={NOTE_H} role="img" aria-label={`Virtual banknote ${formatRupiah(denom)}`}>
      <defs>
        <pattern id={`g${uid}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 7 Q3.5 0 7 7 T14 7" fill="none" stroke={c.dark} strokeOpacity=".22" strokeWidth=".8" />
        </pattern>
        <clipPath id={`c${uid}`}><rect x="0" y="0" width="300" height="140" rx="6" /></clipPath>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width="300" height="140" fill={c.base} />
        <rect width="300" height="140" fill={`url(#g${uid})`} />
        <rect x="8" y="8" width="284" height="124" rx="3" fill="none" stroke={c.light} strokeOpacity=".8" strokeWidth="1.5" />
        <rect x="14" y="14" width="272" height="112" rx="2" fill="none" stroke={c.dark} strokeOpacity=".5" strokeWidth=".8" />
        {/* abstract seal */}
        <g transform="translate(232 70)">
          {[38, 30, 22, 14].map((r) => (
            <circle key={r} r={r} fill="none" stroke={c.light} strokeOpacity=".75" strokeWidth="1.2" />
          ))}
          <path d="M0 -12 L3.5 -3.5 L12 0 L3.5 3.5 L0 12 L-3.5 3.5 L-12 0 L-3.5 -3.5Z" fill={c.light} fillOpacity=".85" />
        </g>
        <text x="22" y="52" fontFamily="Georgia, serif" fontWeight="700" fontSize="34" fill={c.light}>{num}.000</text>
        <text x="22" y="76" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" letterSpacing="1.5" fill={c.light}>RUPIAH VIRTUAL</text>
        <text x="22" y="98" fontFamily="Arial, sans-serif" fontSize="8.5" fill={c.light} fillOpacity=".9">UANG HIBURAN VIRTUAL</text>
        <text x="22" y="109" fontFamily="Arial, sans-serif" fontSize="8.5" fill={c.light} fillOpacity=".9">BUKAN ALAT PEMBAYARAN YANG SAH</text>
        <text x="22" y="122" fontFamily="ui-monospace, monospace" fontSize="8" fill={c.light} fillOpacity=".8">VRT 0{num}2026 · NOT LEGAL TENDER</text>
        <text x="270" y="30" textAnchor="end" fontFamily="Georgia, serif" fontWeight="700" fontSize="20" fill={c.light}>{num}</text>
      </g>
    </svg>
  );
});
