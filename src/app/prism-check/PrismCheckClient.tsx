"use client";

import { useEffect, useState } from "react";
import { generateSigningKeys, importPrivate, importPublic, signMessage, verifyMessage } from "../../lib/sign.ts";
import { saveKeys, loadKeys, clearKeys } from "../../lib/keystore.ts";
import { REMOTE, resolveRoom } from "../../lib/useLink.ts";
import { createLink } from "../../lib/transport.ts";
import { redact } from "../../lib/diag.ts";

type Row = { id: string; label: string; level: "pass" | "fail" | "info" | "wait"; detail: string };

/**
 * Open this page INSIDE the PRISM Web widget (and in iPad Safari) to see what that web view really supports.
 * It changes nothing and sends nothing except one probe message to your own room (if configured).
 * Results are what the device reports: the transparency and aspect lines still need your eyes on the stream.
 */
export function PrismCheckClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tapAudio, setTapAudio] = useState("not tested (tap the button)");

  useEffect(() => {
    let alive = true;
    const out: Row[] = [];
    const add = (r: Row) => { out.push(r); if (alive) setRows([...out]); };
    void (async () => {
      add({ id: "ua", label: "User agent", level: "info", detail: navigator.userAgent });
      add({ id: "view", label: "Viewport", level: "info", detail: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x, ratio ${(window.innerWidth / window.innerHeight).toFixed(3)} (9:16 = 0.563)` });
      add({ id: "ratio", label: "9:16 portrait", level: Math.abs(window.innerWidth / window.innerHeight - 9 / 16) < 0.03 ? "pass" : "info", detail: "the overlay letterboxes any size; set the widget to a 9:16 canvas for the full-size ATM" });
      add({ id: "secure", label: "Secure context (https)", level: window.isSecureContext ? "pass" : "fail", detail: String(window.isSecureContext) });
      try {
        const k = await generateSigningKeys();
        const priv = await importPrivate(k.privateKey), pub = await importPublic(k.publicKey);
        const m = await signMessage({ v: 1, t: "clear" }, priv);
        const ok = await verifyMessage(m, pub);
        const bad = await verifyMessage({ ...m, t: "settings" }, pub);
        add({ id: "crypto", label: "WebCrypto ECDSA P-256 sign + verify", level: ok === "ok" && bad === "bad-signature" ? "pass" : "fail", detail: `verify=${ok}, tampered=${bad}` });
        let extractable = true;
        try { await crypto.subtle.exportKey("pkcs8", priv); } catch { extractable = false; }
        add({ id: "nonex", label: "Imported private key is non-extractable", level: extractable ? "fail" : "pass", detail: extractable ? "exportKey succeeded: the key can be read by scripts" : "exportKey refused (good)" });
        await saveKeys({ publicKey: "probe", signKey: priv });
        const back = await loadKeys();
        add({ id: "idb", label: "IndexedDB stores a CryptoKey", level: back?.signKey ? "pass" : "fail", detail: back?.signKey ? "stored and read back (survives reloads)" : "not persisted: the host key would live in memory only" });
        await clearKeys();
      } catch (e) {
        add({ id: "crypto", label: "WebCrypto ECDSA / IndexedDB", level: "fail", detail: (e as Error).message });
      }
      try { localStorage.setItem("atm:probe", "1"); add({ id: "ls", label: "localStorage", level: localStorage.getItem("atm:probe") === "1" ? "pass" : "fail", detail: "write/read" }); localStorage.removeItem("atm:probe"); } catch (e) { add({ id: "ls", label: "localStorage", level: "fail", detail: (e as Error).message }); }
      add({ id: "bc", label: "BroadcastChannel (same-browser link)", level: typeof BroadcastChannel !== "undefined" ? "pass" : "fail", detail: "only links tabs of the SAME browser, never Safari ↔ PRISM" });
      const c2 = document.createElement("canvas").getContext("2d");
      add({ id: "canvas", label: "Canvas 2D (night-window backdrop)", level: c2 ? "pass" : "fail", detail: c2 ? "ok" : "unavailable" });
      add({ id: "rm", label: "prefers-reduced-motion", level: "info", detail: String(matchMedia("(prefers-reduced-motion: reduce)").matches) });
      add({ id: "ac", label: "Web Audio API present", level: typeof AudioContext !== "undefined" || "webkitAudioContext" in window ? "pass" : "fail", detail: "starting it needs a tap (button below)" });
      if (REMOTE.ok) {
        add({ id: "rt", label: "Realtime link to your Supabase", level: "wait", detail: "connecting…" });
        const room = resolveRoom(false);
        if (!room) { out[out.length - 1] = { id: "rt", label: "Realtime link to your Supabase", level: "fail", detail: "no room in the URL (open this page with ?room=…)" }; if (alive) setRows([...out]); return; }
        const link = createLink(room, REMOTE.config, { onMessage: () => undefined, onState: (n, s, d) => {
          if (n !== "remote") return;
          const i = out.findIndex((r) => r.id === "rt");
          out[i] = { id: "rt", label: "Realtime link to your Supabase (WebSocket)", level: s === "connected" ? "pass" : s === "connecting" ? "wait" : "fail", detail: redact(`${s}${d ? ` (${d})` : ""}`) };
          if (alive) setRows([...out]);
        } });
        setTimeout(() => link.close(), 15000);
      } else add({ id: "rt", label: "Realtime link to your Supabase", level: "fail", detail: `not configured in this build: ${REMOTE.reason}` });
    })();
    return () => { alive = false; };
  }, []);

  const color = { pass: "#4ade80", fail: "#f87171", info: "#9ca3af", wait: "#fbbf24" } as const;
  const report = () => redact(rows.map((r) => `${r.level.toUpperCase()} ${r.label}: ${r.detail}`).join("\n"));
  return (
    <main style={{ minHeight: "100dvh", padding: 16, background: "#0b0d12", color: "#e5e7eb", font: "14px/1.5 ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>PRISM / device check</h1>
      <p style={{ margin: "0 0 12px", color: "#9ca3af", fontSize: 12 }}>Open inside the PRISM Web widget and in Safari. Nothing is stored; no secret is shown.</p>
      <ul data-testid="prism-rows" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li key={r.id} data-level={r.level} style={{ padding: "6px 0", borderBottom: "1px solid #1f2430" }}>
            <b style={{ color: color[r.level] }}>{r.level === "pass" ? "PASS" : r.level === "fail" ? "FAIL" : r.level === "wait" ? "…" : "INFO"}</b> {r.label}
            <div style={{ color: "#9ca3af", fontSize: 12, overflowWrap: "anywhere" }}>{r.detail}</div>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>Transparency test (look at the stream, not the code): the two squares must show your camera/scene through them.</div>
        <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
          <div style={{ width: 90, height: 60, background: "rgba(255,255,255,0.0)", border: "2px dashed #d8c08a" }} />
          <div style={{ width: 90, height: 60, background: "rgba(255,0,80,0.35)" }} />
        </div>
        <button style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d8c08a", background: "#0b0d12", color: "#d8c08a" }} data-testid="audio-tap" onClick={async () => {
          try { const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const c = new C(); await c.resume(); setTapAudio(`AudioContext ${c.state} after a tap`); void c.close(); } catch (e) { setTapAudio("failed: " + (e as Error).message); }
        }}>Test audio start (tap)</button>
        <span style={{ marginLeft: 8, fontSize: 12 }} data-testid="audio-result">{tapAudio}</span>
        <button style={{ marginLeft: 8, padding: "10px 14px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#e5e7eb" }} onClick={() => void navigator.clipboard?.writeText(report())}>Copy report</button>
      </div>
    </main>
  );
}
