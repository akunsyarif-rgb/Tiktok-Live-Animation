// Fails (exit 1) if anything that looks like a secret is in the built bundle, public assets, or tracked files.
// Run after `npm run build`:  npm run security:scan
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(js|css|html|json|txt|map|rsc|wav)$/.test(e.name) && !e.name.endsWith(".wav")) files.push(f);
  }
})(".next/static"); // build output
for (const r of ["public"]) if (existsSync(r)) (function w(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) w(f); else if (!/\.wav$/.test(e.name)) files.push(f); } })(r);
if (existsSync(".next/server/app")) (function w(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) w(f); else if (/\.(html|rsc|json)$/.test(e.name)) files.push(f); } })(".next/server/app");
const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((f) => f && !/(^|\/)(package-lock\.json|\.env\.example)$|\.wav$|^tests\/|^e2e\//.test(f));

const b64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const findings = [];
const check = (file, text) => {
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{15,}\.([A-Za-z0-9_-]{15,})\.[A-Za-z0-9_-]{10,}/g)) {
    let role = "";
    try { role = JSON.parse(b64u(m[1])).role ?? ""; } catch { /* not a JWT payload */ }
    findings.push(`${file}: JWT${role ? ` (role=${role})` : ""}${role === "service_role" ? "  <<< SERVICE ROLE" : ""}`);
  }
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) findings.push(`${file}: sb_secret_ key`);
  if (/MIGHAgEAMBMGByqGSM49/.test(text)) findings.push(`${file}: PKCS#8 EC private key`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) findings.push(`${file}: PEM private key`);
  if (/(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[=:]\s*['"]?[A-Za-z0-9._-]{20,}/.test(text)) findings.push(`${file}: service-role key assignment`);
};
for (const f of [...files, ...tracked]) { try { check(f, readFileSync(f, "utf8")); } catch { /* binary/unreadable */ } }
console.log(`scanned ${files.length} build/public files + ${tracked.length} tracked files`);
if (findings.length) { console.error("SECRET-LIKE CONTENT FOUND:\n" + [...new Set(findings)].join("\n")); process.exit(1); }
console.log("no secret-like content found");
