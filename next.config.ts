import type { NextConfig } from "next";

/**
 * Content-Security-Policy (production only; the dev server needs eval).
 * connect-src is limited to this origin + the configured Supabase project (https + wss), so injected script could not
 * exfiltrate to arbitrary hosts. 'unsafe-inline' stays for scripts/styles because Next inlines its bootstrap code.
 * No frame-ancestors on purpose: a streaming app's web view might embed the overlay (unknown, see docs/SECURITY.md).
 */
function csp(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  let remote = "";
  try {
    const u = new URL(raw);
    remote = `${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
  } catch { /* remote link not configured */ }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self' ${remote}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // lets the E2E suite build a second variant (with a local realtime URL) without touching .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp() }] : []),
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // overlay/control hold live state: never serve a stale shell from a CDN/webview cache
      { source: "/overlay", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/control", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
