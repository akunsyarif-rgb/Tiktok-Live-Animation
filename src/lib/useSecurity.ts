"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateSigningKeys, importPrivate, importPublic, needsSignature, signMessage } from "./sign.ts";
import { clearKeys, loadKeys, saveKeys } from "./keystore.ts";
import type { Msg } from "./protocol.ts";

const SK_LEGACY = "atm:sign:v1"; // old format: PKCS#8 in localStorage (readable by any script): migrated away on first load
const PK = "atm:pk:v1"; // overlay: host public key

const ls = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

/** Creates a new host key pair. Returns the PRIVATE key bytes ONCE (for the listener); only a non-extractable key is stored. */
export async function createControlKeys(): Promise<{ publicKey: string; listenerKey: string; persisted: boolean }> {
  const k = await generateSigningKeys();
  const signKey = await importPrivate(k.privateKey); // extractable:false
  const persisted = await saveKeys({ publicKey: k.publicKey, signKey });
  return { publicKey: k.publicKey, listenerKey: k.privateKey, persisted };
}
export async function clearControlKeys(): Promise<void> {
  await clearKeys();
  try { ls()?.removeItem(SK_LEGACY); } catch { /* ignore */ }
}

/** One-time migration of a legacy localStorage key into the non-extractable store; the plaintext copy is deleted. */
async function migrateLegacy(): Promise<void> {
  try {
    const raw = ls()?.getItem(SK_LEGACY);
    if (!raw) return;
    const k = JSON.parse(raw) as { publicKey?: string; privateKey?: string };
    if (k.publicKey && k.privateKey) await saveKeys({ publicKey: k.publicKey, signKey: await importPrivate(k.privateKey) });
    ls()?.removeItem(SK_LEGACY);
  } catch { try { ls()?.removeItem(SK_LEGACY); } catch { /* ignore */ } }
}

/** Overlay: public key from ?pk= (then remembered) or from the last visit. */
export function resolvePublicKey(): string | null {
  const q = new URLSearchParams(window.location.search).get("pk");
  const ok = (v: string | null) => (v && /^[A-Za-z0-9_-]{60,120}$/.test(v) ? v : null);
  const fromUrl = ok(q);
  if (fromUrl) { try { ls()?.setItem(PK, fromUrl); } catch { /* not persisted */ } }
  return fromUrl ?? ok(ls()?.getItem(PK) ?? null);
}

/** Control: non-extractable signing key + public key from the key store. */
export function useSigner(version: number): { signKey: CryptoKey | null; publicKey: string | null } {
  const [state, setState] = useState<{ signKey: CryptoKey | null; publicKey: string | null }>({ signKey: null, publicKey: null });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await migrateLegacy();
      const k = await loadKeys();
      if (!cancelled) setState(k ? { signKey: k.signKey, publicKey: k.publicKey } : { signKey: null, publicKey: null });
    })();
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
