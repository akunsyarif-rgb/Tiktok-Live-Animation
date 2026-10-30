export interface RemoteConfig {
  url: string;
  key: string;
}

export type RemoteConfigResult = { ok: true; config: RemoteConfig } | { ok: false; reason: string };

/**
 * Supabase URL + anon/publishable key. Both are PUBLIC by design (shipped to the browser).
 * Never put a service_role / secret key here: it is rejected.
 */
export function readRemoteConfig(url: string | undefined, key: string | undefined): RemoteConfigResult {
  if (!url && !key) return { ok: false, reason: "not configured" };
  if (!url || !key) return { ok: false, reason: "incomplete: need both URL and key" };
  const u = url.replace(/\/+$/, "");
  // plain http only for a local test server (127.0.0.1 / localhost), never for a real project
  const okUrl = /^https:\/\/[a-z0-9.-]+$/i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u);
  if (!okUrl) return { ok: false, reason: "URL must be https://<project>.supabase.co" };
  if (/^sb_secret_/.test(key) || jwtRole(key) === "service_role") return { ok: false, reason: "secret/service_role key refused (use the anon/publishable key)" };
  if (key.length < 20) return { ok: false, reason: "key looks invalid" };
  return { ok: true, config: { url: url.replace(/\/+$/, ""), key } };
}

function jwtRole(key: string): string | null {
  const part = key.split(".")[1];
  if (!part) return null;
  try {
    const json = typeof atob === "function" ? atob(part.replace(/-/g, "+").replace(/_/g, "/")) : Buffer.from(part, "base64url").toString();
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

const ROOM_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** The room code is the shared secret that separates your overlay from everyone else's. */
export function normalizeRoom(s: string | null | undefined): string | null {
  return s && ROOM_RE.test(s) ? s : null;
}

export function generateRoom(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
