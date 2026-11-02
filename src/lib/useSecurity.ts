"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateSigningKeys, importPrivate, importPublic, needsSignature, signMessage, type KeyPairB64 } from "./sign.ts";
import type { Msg } from "./protocol.ts";

const SK = "atm:sign:v1"; // control: {publicKey, privateKey}   (private key never leaves this browser except by explicit copy to the listener)
const PK = "atm:pk:v1"; // overlay: host public key

const ls = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

export function readControlKeys(): KeyPairB64 | null {
  try {
    const k = JSON.parse(ls()?.getItem(SK) ?? "null") as KeyPairB64 | null;
    return k && typeof k.publicKey === "string" && typeof k.privateKey === "string" ? k : null;
  } catch { return null; }
}
export async function createControlKeys(): Promise<KeyPairB64> {
  const k = await generateSigningKeys();
  try { ls()?.setItem(SK, JSON.stringify(k)); } catch { /* not persisted */ }
  return k;
}
export function clearControlKeys(): void {
  try { ls()?.removeItem(SK); } catch { /* ignore */ }
}

/** Overlay: public key from ?pk= (then remembered) or from the last visit. */
export function resolvePublicKey(): string | null {
  const q = new URLSearchParams(window.location.search).get("pk");
  const ok = (v: string | null) => (v && /^[A-Za-z0-9_-]{60,120}$/.test(v) ? v : null);
  const fromUrl = ok(q);
  if (fromUrl) { try { ls()?.setItem(PK, fromUrl); } catch { /* not persisted */ } }
  return fromUrl ?? ok(ls()?.getItem(PK) ?? null);
}

/** Control: signing key (CryptoKey) derived from the stored private key. */
export function useSigner(version: number): { signKey: CryptoKey | null; publicKey: string | null } {
  const [state, setState] = useState<{ signKey: CryptoKey | null; publicKey: string | null }>({ signKey: null, publicKey: null });
  useEffect(() => {
    let cancelled = false;
    const k = readControlKeys();
    if (!k) { setState({ signKey: null, publicKey: null }); return; } // eslint-disable-line react-hooks/set-state-in-effect -- browser-only storage
    importPrivate(k.privateKey).then((signKey) => { if (!cancelled) setState({ signKey, publicKey: k.publicKey }); }).catch(() => { if (!cancelled) setState({ signKey: null, publicKey: null }); });
    return () => { cancelled = true; };
  }, [version]);
  return state;
}

/** Wraps a raw send: control-plane messages are signed first when a key exists. */
export function useSignedSend(raw: (m: Msg) => boolean, ready: () => boolean, signKey: CryptoKey | null): (m: Msg) => boolean {
  const keyRef = useRef(signKey);
  useEffect(() => { keyRef.current = signKey; }, [signKey]);
  return useCallback((m: Msg) => {
    const k = keyRef.current;
    if (!k || !needsSignature(m.t)) return raw(m);
    void signMessage(m as never, k).then((sm) => raw(sm as Msg));
    return ready();
  }, [raw, ready]);
}

export { importPublic };
