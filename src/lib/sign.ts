/**
 * Message authentication so a room code alone cannot inject events or change settings.
 * ECDSA P-256 / SHA-256 (WebCrypto: available in Safari, Chrome and Node ≥ 20).
 * The host keeps the PRIVATE key (control page + listener env). The overlay only needs the PUBLIC key (in its URL):
 * knowing the room code, the Supabase URL and the anon key is not enough to forge an event.
 */
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIG = { name: "ECDSA", hash: "SHA-256" } as const;

export const b64u = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(t);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Deterministic JSON (sorted keys) so both sides sign/verify the same bytes. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}

export interface KeyPairB64 {
  /** raw uncompressed P-256 point, base64url (≈ 87 chars): safe to put in the overlay URL */
  publicKey: string;
  /** PKCS#8, base64url: SECRET (control browser + listener env only) */
  privateKey: string;
}

export async function generateSigningKeys(): Promise<KeyPairB64> {
  const kp = await subtle().generateKey(ALG, true, ["sign", "verify"]);
  return { publicKey: b64u(await subtle().exportKey("raw", kp.publicKey)), privateKey: b64u(await subtle().exportKey("pkcs8", kp.privateKey)) };
}

export async function importPrivate(b64: string): Promise<CryptoKey> {
  return subtle().importKey("pkcs8", unb64u(b64), ALG, false, ["sign"]);
}
export async function importPublic(b64: string): Promise<CryptoKey> {
  return subtle().importKey("raw", unb64u(b64), ALG, false, ["verify"]);
}

type Signable = Record<string, unknown> & { sig?: string };

/** Types that can change what the overlay shows or does. Everything else (ack/status/ping/listener) is informational. */
export const SIGNED_TYPES = ["event", "settings", "clear"] as const;
export const needsSignature = (t: unknown): boolean => (SIGNED_TYPES as readonly unknown[]).includes(t);

export async function signMessage<T extends Signable>(msg: T, key: CryptoKey, now: number = Date.now()): Promise<T & { ts: number; sig: string }> {
  const body = { ...msg, ts: now };
  delete (body as Signable).sig;
  const sig = await subtle().sign(SIG, key, new TextEncoder().encode(stableStringify(body)));
  return { ...body, sig: b64u(sig) } as T & { ts: number; sig: string };
}

export const MAX_SKEW_MS = 10 * 60 * 1000;

export type VerifyResult = "ok" | "unsigned" | "bad-signature" | "stale";

export async function verifyMessage(msg: Signable, key: CryptoKey, now: number = Date.now()): Promise<VerifyResult> {
  if (typeof msg.sig !== "string" || typeof msg.ts !== "number") return "unsigned";
  if (Math.abs(now - msg.ts) > MAX_SKEW_MS) return "stale";
  const { sig, ...body } = msg;
  try {
    const ok = await subtle().verify(SIG, key, unb64u(sig), new TextEncoder().encode(stableStringify(body)));
    return ok ? "ok" : "bad-signature";
  } catch {
    return "bad-signature";
  }
}
