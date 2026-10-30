import test from "node:test";
import assert from "node:assert/strict";
import { generateRoom, normalizeRoom, readRemoteConfig } from "../src/lib/config.ts";
import { DiagLog, redact } from "../src/lib/diag.ts";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role: string) => `${b64({ alg: "HS256" })}.${b64({ role })}.signaturesignature`;

test("env config: absent → disabled (app still works locally)", () => {
  const r = readRemoteConfig(undefined, undefined);
  assert.equal(r.ok, false);
});
test("env config: incomplete / non-https / short key rejected", () => {
  assert.equal(readRemoteConfig("https://x.supabase.co", undefined).ok, false);
  assert.equal(readRemoteConfig("http://x.supabase.co", "a".repeat(30)).ok, false);
  assert.equal(readRemoteConfig("http://evil.example.com:80", "a".repeat(30)).ok, false);
  assert.equal(readRemoteConfig("http://127.0.0.1:5555", "a".repeat(30)).ok, true, "local test server allowed");
  assert.equal(readRemoteConfig("https://x.supabase.co", "short").ok, false);
});
test("env config: service_role / secret keys are refused in the browser build", () => {
  assert.equal(readRemoteConfig("https://x.supabase.co", jwt("service_role")).ok, false);
  assert.equal(readRemoteConfig("https://x.supabase.co", "sb_secret_abcdefghijklmnopqrstuvwxyz").ok, false);
});
test("env config: anon JWT and publishable key accepted; trailing slash trimmed", () => {
  const a = readRemoteConfig("https://x.supabase.co/", jwt("anon"));
  assert.ok(a.ok && a.config.url === "https://x.supabase.co");
  assert.ok(readRemoteConfig("https://x.supabase.co", "sb_publishable_abcdefghijklmnop").ok);
});
test("room code: validation + generation entropy", () => {
  assert.equal(normalizeRoom("short"), null);
  assert.equal(normalizeRoom("has space has space has space"), null);
  assert.equal(normalizeRoom(null), null);
  const r = generateRoom();
  assert.equal(normalizeRoom(r), r);
  assert.notEqual(generateRoom(), generateRoom());
});
test("diagnostics redact JWTs, keys, tokens and room codes", () => {
  const out = redact(`key ${jwt("anon")} sb_publishable_abcdef123456 apikey=SUPERSECRETVALUE token: abc123 url /overlay?room=ABCDEFGHIJKLMNOPQRSTUVWX`);
  assert.ok(!out.includes("SUPERSECRETVALUE"));
  assert.ok(!out.includes("sb_publishable_abcdef123456"));
  assert.ok(!out.includes("signaturesignature"));
  assert.ok(!out.includes("abc123"));
  assert.ok(!out.includes("EFGHIJKLMNOPQRSTUVWX"));
  const d = new DiagLog();
  d.add("info", "apikey=hunter2hunter2");
  assert.ok(!d.toText().includes("hunter2"));
});
