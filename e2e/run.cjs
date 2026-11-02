/* Browser E2E. Requires: `npm run build` done, `playwright` resolvable (global install ok), Node >= 22.
 * Usage: node e2e/run.cjs [outDir]   → exit code 1 if any check FAILs. */
const { spawn, execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "atm-e2e-"));
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, cond, extra = "") => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? "  [" + extra + "]" : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const spawnProc = (cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], detached: true, ...opts });
  children.push(p);
  p.out = "";
  p.stdout.on("data", (d) => (p.out += d));
  p.stderr.on("data", (d) => (p.out += d));
  return p;
};
async function waitHttp(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not yet */ }
    await sleep(300);
  }
  throw new Error("server not ready: " + url);
}
const tid = async (page, id) => (await page.getByTestId(id).innerText()).trim();
const num = async (page, id) => parseInt(await tid(page, id), 10);
async function waitProcessed(page, n, ms = 60000) {
  await page.waitForFunction((n) => parseInt(document.querySelector("[data-testid=processed]")?.textContent ?? "0", 10) >= n, n, { timeout: ms });
}
function watchErrors(page, name, sink, ignore = []) {
  page.on("crash", () => sink.push(`${name} PAGE CRASHED`));
  page.on("console", (m) => { if (m.type() === "error" && !ignore.some((i) => m.text().includes(i))) sink.push(`${name} console: ${m.text()}`); });
  page.on("pageerror", (e) => sink.push(`${name} pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400 && !ignore.some((i) => r.url().includes(i))) sink.push(`${name} http${r.status()}: ${r.url()}`); });
}
const PORT_MAIN = 3201, PORT_REMOTE = 3202;
const IPAD = { width: 820, height: 1180 };

async function mainSuite(browser) {
  console.log("\n== main suite (production build, no remote configured) ==");
  const base = `http://127.0.0.1:${PORT_MAIN}`;
  const errors = [];

  // ---------- control + audio + transactions (iPad portrait) ----------
  const ctx = await browser.newContext({ viewport: IPAD });
  const c = await ctx.newPage();
  watchErrors(c, "control", errors);
  await c.goto(`${base}/control`);
  await c.waitForTimeout(800);
  check("remote link reported as disabled when env not configured", (await tid(c, "remote-status")).startsWith("disabled"));
  await c.getByRole("button", { name: "Activate Audio" }).click();
  await c.waitForTimeout(1200);
  check("audio activation → all samples loaded", /5\/5 loaded/.test(await tid(c, "samples")), await tid(c, "samples"));
  await c.getByRole("button", { name: "Audio Test" }).click();
  await c.waitForTimeout(600);
  check("audio test plays sequentially (playing state seen)", (await c.locator("main").innerText()).includes("playing "));
  await c.getByRole("button", { name: /^Mute$/ }).click();
  check("mute toggles (aria-pressed)", (await c.getByRole("button", { name: /^Muted$/ }).getAttribute("aria-pressed")) === "true");
  await c.getByRole("button", { name: /^Muted$/ }).click();
  await c.waitForTimeout(14000); // let audio test finish

  const notes = async () => c.locator(".note-out").count();
  await c.getByRole("button", { name: /^Viewer Join/ }).click();
  await c.waitForFunction(() => document.querySelectorAll(".note-out").length > 0, null, { timeout: 8000 });
  await c.waitForTimeout(1500);
  const nJoin = await notes();
  await c.screenshot({ path: path.join(OUT, "join-dispensing.png") });
  check("viewer join dispenses exactly 1 note", nJoin === 1, `notes=${nJoin}`);
  await waitProcessed(c, 1);
  await c.waitForTimeout(400);
  check("no notes left after transaction (no overlap/leak)", (await notes()) === 0);

  await c.getByRole("button", { name: /^Gift Small/ }).click();
  await c.waitForFunction(() => document.querySelectorAll(".note-out").length > 0, null, { timeout: 8000 });
  await c.waitForTimeout(3200);
  const nSmall = await notes();
  await c.screenshot({ path: path.join(OUT, "small-dispensing.png") });
  check("gift small dispenses several notes (3-6)", nSmall >= 3 && nSmall <= 6, `notes=${nSmall}`);
  await waitProcessed(c, 2);

  await c.getByRole("button", { name: /^Gift Big/ }).click();
  await c.waitForFunction(() => document.querySelectorAll(".note-out").length > 0, null, { timeout: 8000 });
  await c.waitForTimeout(2500);
  await c.screenshot({ path: path.join(OUT, "large-dispensing.png") });
  const bundleText = await c.locator(".note-out").first().innerText();
  check("gift big dispenses ONE strapped bundle showing 'Rp 1.000.000' + VIRTUAL", (await notes()) === 1 && /1\.000\.000/.test(bundleText) && /VIRTUAL/.test(bundleText), bundleText.replace(/\n/g, " "));
  await waitProcessed(c, 3);

  // ---------- burst, duplicates, clear, stress ----------
  await c.getByRole("button", { name: /Burst/ }).click();
  await c.getByRole("button", { name: /Resend last/ }).click();
  await c.getByRole("button", { name: /Resend last/ }).click();
  await c.waitForTimeout(300);
  check("burst of 6 queued", (await num(c, "waiting")) >= 4, "waiting=" + (await tid(c, "waiting")));
  check("duplicate resends blocked (2)", (await num(c, "duplicates")) === 2, "dup=" + (await tid(c, "duplicates")));
  for (let i = 0; i < 4; i++) await c.getByRole("button", { name: /Burst/ }).click(); // 24 more
  await c.waitForTimeout(500);
  const waitingBig = await num(c, "waiting");
  check("stress: 30 queued main-lane events (joins grouped), UI still responsive", waitingBig >= 10, "waiting=" + waitingBig);
  await c.getByRole("button", { name: /Clear waiting/ }).click();
  await c.waitForTimeout(300);
  check("clear waiting queue works", (await num(c, "waiting")) === 0);
  await c.waitForFunction(() => document.querySelector("[data-testid=phase]")?.textContent.trim() === "standby", null, { timeout: 30000 });

  // ---------- modes / hybrid policy UI ----------
  await c.getByRole("button", { name: "Gift Priority" }).click();
  check("gift-priority policy text shown", (await c.locator("main").innerText()).includes("always go before"));
  await c.getByRole("button", { name: "Hybrid" }).click();
  const burstInput = c.getByLabel("Hybrid gift burst");
  await burstInput.fill("2");
  check("hybrid policy text reflects setting", /after 2 gift/.test(await c.locator("main").innerText()));
  await c.getByRole("button", { name: "Community" }).click();
  check("community policy text shown", (await c.locator("main").innerText()).includes("first-come-first-served"));
  await c.getByRole("button", { name: "Hybrid" }).click();

  // ---------- same-browser overlay link ----------
  const o = await ctx.newPage();
  watchErrors(o, "overlay", errors);
  await o.goto(`${base}/overlay?bg=dark&debug=1`);
  await o.waitForTimeout(800);
  await c.bringToFront();
  await c.waitForFunction(() => document.querySelector("[data-testid=overlay-status]")?.textContent.includes("connected"), null, { timeout: 10000 });
  check("control detects overlay (same-browser link)", true, await tid(c, "overlay-status"));
  await c.getByRole("button", { name: /^Gift Big/ }).click();
  await o.waitForTimeout(3600);
  await o.screenshot({ path: path.join(OUT, "overlay-large.png") });
  await c.waitForFunction(() => parseInt(document.querySelector("[data-testid=processed]").textContent, 10) >= 1, null, { timeout: 30000 });
  check("event routed to overlay and processed there (acked)", true, "overlay processed=" + (await tid(c, "processed")));
  await o.close();

  // ---------- reload mid-queue ----------
  const ctx2 = await browser.newContext({ viewport: IPAD });
  const r = await ctx2.newPage();
  watchErrors(r, "reload", errors);
  await r.goto(`${base}/control`);
  await r.waitForTimeout(600);
  await r.getByRole("button", { name: /^Viewer Join/ }).click();
  await r.getByRole("button", { name: /^Viewer Join/ }).click();
  await r.getByRole("button", { name: /^Gift Small/ }).click();
  await waitProcessed(r, 1, 30000);
  await r.reload();
  await r.waitForTimeout(600);
  await waitProcessed(r, 2, 60000);
  await r.waitForFunction(() => document.querySelector("[data-testid=phase]")?.textContent.trim() === "standby" && document.querySelector("[data-testid=waiting]")?.textContent.trim() === "0", null, { timeout: 40000 });
  await r.waitForTimeout(2500);
  check("reload mid-queue: remaining events resume, none run twice (processed after reload = 2)", (await num(r, "processed")) === 2, "processed=" + (await tid(r, "processed")));
  await ctx2.close();

  // ---------- offline ----------
  await ctx.setOffline(true);
  const p0 = await num(c, "processed");
  await c.getByRole("button", { name: /^Viewer Join/ }).click();
  await waitProcessed(c, p0 + 1, 30000);
  check("offline (no internet): local transactions still work", true);
  await ctx.setOffline(false);

  // ---------- responsive ----------
  for (const [name, vp] of [["ipad-portrait", IPAD], ["ipad-landscape", { width: 1180, height: 820 }], ["phone", { width: 390, height: 844 }]]) {
    await c.setViewportSize(vp);
    await c.waitForTimeout(400);
    const over = await c.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`control: no horizontal overflow (${name})`, !over);
    await c.screenshot({ path: path.join(OUT, `control-${name}.png`), fullPage: true });
  }
  const sizes = [["overlay 540x960 (9:16)", 540, 960], ["overlay ipad portrait", 820, 1180], ["overlay ipad landscape", 1180, 820], ["overlay 1080x1920", 1080, 1920], ["overlay phone", 390, 844]];
  for (const [name, w, h] of sizes) {
    const pg = await ctx.newPage();
    watchErrors(pg, name, errors);
    await pg.setViewportSize({ width: w, height: h });
    await pg.goto(`${base}/overlay?clean=1`);
    await pg.waitForTimeout(700);
    const box = await pg.locator(".atm-metal").first().boundingBox();
    const fits = box && box.x >= -1 && box.y >= -1 && box.x + box.width <= w + 1 && box.y + box.height <= h + 1;
    const over = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.documentElement.scrollHeight > window.innerHeight + 1);
    check(`${name}: ATM fits viewport, no scroll`, fits && !over, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "no box");
    if (w === 540) {
      const bg = await pg.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body.firstElementChild).backgroundColor]);
      check("overlay background fully transparent", bg.every((b) => b === "rgba(0, 0, 0, 0)"), JSON.stringify(bg));
      await pg.screenshot({ path: path.join(OUT, "overlay-standby.png"), omitBackground: true });
      const hint = await pg.getByText("TAP: ENABLE SOUND").count();
      check("?clean=1 hides the sound hint", hint === 0);
    }
    await pg.close();
  }
  await ctx.close();

  // ---------- audio asset failures (server returns errors) ----------
  const ctx3 = await browser.newContext({ viewport: IPAD });
  await ctx3.route("**/audio/cash_dispense.wav", (route) => route.fulfill({ status: 500, body: "boom" }));
  await ctx3.route("**/audio/success.wav", (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: "not a wav" }));
  const a = await ctx3.newPage();
  const errA = [];
  watchErrors(a, "audio-fail", errA, ["cash_dispense.wav", "500"]);
  await a.goto(`${base}/control`);
  await a.getByRole("button", { name: "Activate Audio" }).click();
  await a.waitForTimeout(1500);
  const samples = await tid(a, "samples");
  check("audio 500 / corrupt file: reported as MISSING/degraded, app alive", /MISSING: cash_dispense/.test(samples) || /[34]\/5/.test(samples), samples);
  await a.getByRole("button", { name: /^Gift Small/ }).click();
  await waitProcessed(a, 1, 40000);
  check("audio failure does not stop the visual transaction", true);
  check("audio-failure scenario: no unexpected JS errors", errA.length === 0, errA.join(" | "));
  await ctx3.close();

  check("main suite: no console errors / failed requests / page errors", errors.length === 0, errors.join(" | "));
}



async function uiSuite(browser) {
  console.log("\n== UI suite (ATM only: backdrop, ambient lane, LIVE mode, security, reduced motion) ==");
  const base = `http://127.0.0.1:${PORT_MAIN}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: IPAD, permissions: ["clipboard-read", "clipboard-write"] });
  const external = new Set();
  ctx.on("request", (r) => { const u = new URL(r.url()); if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) external.add(u.hostname); });
  const c = await ctx.newPage(); watchErrors(c, "control", errors);
  await c.goto(`${base}/control`); await c.waitForTimeout(700);
  const o = await ctx.newPage(); await o.setViewportSize({ width: 540, height: 960 }); watchErrors(o, "overlay", errors);
  await o.goto(`${base}/overlay?bg=dark&clean=1&debug=1`); await o.waitForTimeout(900);
  await c.waitForFunction(() => document.querySelector("[data-testid=overlay-status]")?.textContent.includes("connected"), null, { timeout: 15000 });
  const hudText = () => o.locator("pre").innerText();
  const stage = o.locator("[data-testid=atm-body]");
  const diff = async (page, loc) => { const a = await loc.screenshot(); await page.waitForTimeout(1500); const b = await loc.screenshot(); return !a.equals(b); };

  // readiness is honest: no listener, no Supabase here → never READY
  check("readiness is not READY with only a simulator and no listener/backend", (await tid(c, "readiness-overall")) !== "READY", await tid(c, "readiness-overall"));
  check("readiness: TikTok source line is red without a listener", (await c.getByTestId("ready-source").getAttribute("data-level")) === "fail");
  check("readiness: overlay line is green when the overlay answers", (await c.getByTestId("ready-overlay").getAttribute("data-level")) === "ok");
  check("readiness: room reported NOT secured before keys exist", (await c.getByTestId("ready-security").getAttribute("data-level")) === "warn");

  // ambient lane through the real control→overlay path
  await c.getByRole("button", { name: /^Comment$/ }).click();
  await o.waitForSelector("[data-testid=ambient-comment]", { timeout: 10000 });
  check("comment shows in the overlay ambient lane with the username", /@\w/.test(await o.locator("[data-testid=ambient-comment]").first().innerText()));
  await c.getByRole("button", { name: /^Follow$/ }).click();
  await o.waitForSelector("[data-testid=ambient-toast]", { timeout: 10000 });
  check("follow shows as a toast", /followed/.test(await o.locator("[data-testid=ambient-toast]").innerText()));
  await c.getByRole("button", { name: /^Likes$/ }).click();
  await o.waitForSelector("[data-testid=ambient-likes]", { timeout: 15000 });
  check("likes show as one aggregated pulse", /\+\d+/.test(await o.locator("[data-testid=ambient-likes]").innerText()));
  await o.waitForFunction(() => !document.querySelector("[data-testid=ambient-comment]") && !document.querySelector("[data-testid=ambient-toast]"), null, { timeout: 20000 });
  check("ambient items expire on their own and the lane returns to idle", true);
  // a gift while ambient events are visible: no overlap with the dispenser
  await c.getByRole("button", { name: /^Gift Medium/ }).click();
  for (let i = 0; i < 4; i++) await c.getByRole("button", { name: /^Comment$/ }).click();
  await o.waitForFunction(() => document.querySelectorAll("[data-testid=ambient-comment]").length > 0 && document.querySelectorAll(".note-out").length > 0, null, { timeout: 20000 });
  const lastComment = o.locator("[data-testid=ambient-comment]").last();
  const hud = await lastComment.boundingBox(), tray = await o.locator(".note-out").first().boundingBox();
  check("ambient lane (comments visible) does not overlap the cash dispenser", !!hud && !!tray && hud.y + hud.height < tray.y, `hud bottom=${hud && Math.round(hud.y + hud.height)} notes top=${tray && Math.round(tray.y)}`);
  await c.waitForFunction(() => document.querySelector("[data-testid=phase]")?.textContent.trim() === "standby", null, { timeout: 40000 });
  const rx = /rx:(\d+) filt:(\d+)/.exec(await hudText());
  check("overlay counts every received event (pipeline counters)", !!rx && +rx[1] >= 7, rx ? rx[0] : "none");

  // backdrop: transparent default → night window with rain
  check("default backdrop is transparent (no canvas)", (await o.locator("[data-testid=backdrop-night]").count()) === 0);
  await c.getByTestId("backdrop-select").selectOption("night");
  await o.waitForSelector("[data-testid=backdrop-night]", { timeout: 8000 });
  await o.waitForTimeout(800);
  check("night-window backdrop animates (rain / reflections move)", await diff(o, o.locator("[data-testid=backdrop-night]")));
  await o.screenshot({ path: path.join(OUT, "atm-night-window.png") });
  await c.getByTestId("backdrop-select").selectOption("transparent");

  // idle: never mechanical (LED pattern is data-driven, ATM idle keeps moving) + can be disabled
  check("ATM idle animates by itself", await diff(o, stage));
  await c.getByLabel("Idle animation").uncheck();
  await o.waitForTimeout(1500);
  let still = false;
  for (let k = 0; k < 3 && !still; k++) still = !(await diff(o, stage));
  check("ATM idle can be disabled (static)", still);
  await c.getByLabel("Idle animation").check();

  // prefers-reduced-motion
  const rctx = await browser.newContext({ viewport: { width: 540, height: 960 }, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  await rp.goto(`${base}/overlay?backdrop=night&clean=1`); await rp.waitForTimeout(1500);
  const ra = await rp.screenshot(); await rp.waitForTimeout(1500); const rb = await rp.screenshot();
  check("prefers-reduced-motion: backdrop and ATM idle are still", ra.equals(rb));
  await rctx.close();

  // security panel + overlay URL carries the PUBLIC key only
  c.on("dialog", (d) => void d.accept()); // confirm() on rotate / remove
  await c.getByTestId("sec-create").click();
  await c.waitForFunction(() => document.querySelector("[data-testid=sec-status]")?.textContent.includes("keys active"), null, { timeout: 10000 });
  await c.getByTestId("copy-overlay").click();
  const url = await c.evaluate(() => navigator.clipboard.readText());
  const pk = new URL(url).searchParams.get("pk");
  check("overlay URL contains the public key (and no private key material)", !!pk && pk.length > 60 && pk.length < 120 && !url.includes("MIGH"), pk ? `pk len ${pk.length}` : "no pk");
  check("private key is shown ONCE in a reveal box", (await c.getByTestId("sec-reveal").count()) === 1);
  const lsDump = await c.evaluate(() => JSON.stringify({ ...localStorage }));
  check("localStorage holds NO private key material (no PKCS#8, no legacy key record)", !lsDump.includes("MIGHAgEAMBMGByqGSM49") && !lsDump.includes("atm:sign:v1"));
  const idbInfo = await c.evaluate(() => new Promise((res) => { const r = indexedDB.open("atm-keys", 1); r.onsuccess = () => { const g = r.result.transaction("k").objectStore("k").get("host"); g.onsuccess = () => res({ has: !!g.result, extractable: g.result?.signKey?.extractable, type: g.result?.signKey?.type }); }; r.onerror = () => res({ has: false }); }));
  check("signing key lives in IndexedDB as a NON-extractable CryptoKey", idbInfo.has && idbInfo.extractable === false && idbInfo.type === "private", JSON.stringify(idbInfo));
  await c.getByTestId("sec-dismiss").click();
  check("after dismissing, the private key bytes are gone from the page", (await c.locator("body").innerText()).indexOf("MIGH") === -1 && (await c.getByTestId("sec-reveal").count()) === 0);
  await c.reload(); await c.waitForTimeout(800);
  await c.waitForFunction(() => document.querySelector("[data-testid=sec-status]")?.textContent.includes("keys active"), null, { timeout: 10000 });
  check("keys survive a reload but the secret reveal does not come back", (await c.getByTestId("sec-reveal").count()) === 0);
  await c.getByTestId("sec-create").click(); // rotate
  await c.waitForFunction(() => document.querySelector("[data-testid=sec-reveal]"), null, { timeout: 10000 });
  await c.getByTestId("copy-overlay").click();
  const pk2 = new URL(await c.evaluate(() => navigator.clipboard.readText())).searchParams.get("pk");
  check("key rotation yields a new public key (old overlay URL becomes invalid)", !!pk2 && pk2 !== pk);
  // legacy migration: an old plaintext key in localStorage is moved into the non-extractable store and deleted
  const legacy = await c.evaluate(async () => {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const b = (a) => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const rec = { publicKey: b(await crypto.subtle.exportKey("raw", kp.publicKey)), privateKey: b(await crypto.subtle.exportKey("pkcs8", kp.privateKey)) };
    localStorage.setItem("atm:sign:v1", JSON.stringify(rec));
    return rec.publicKey;
  });
  await c.reload(); await c.waitForTimeout(1200);
  await c.getByTestId("copy-overlay").click();
  const pk3 = new URL(await c.evaluate(() => navigator.clipboard.readText())).searchParams.get("pk");
  check("legacy plaintext key is migrated into the non-extractable store and deleted from localStorage", pk3 === legacy && (await c.evaluate(() => localStorage.getItem("atm:sign:v1"))) === null);
  await c.getByTestId("sec-remove").click();
  await c.waitForFunction(() => document.querySelector("[data-testid=sec-status]")?.textContent.includes("NOT secured"), null, { timeout: 10000 });
  check("keys can be removed (revocation on the host side)", true);

  // device-check page (what you open inside PRISM)
  const pc = await ctx.newPage(); watchErrors(pc, "prism-check", errors);
  await pc.goto(`${base}/prism-check`); await pc.waitForTimeout(2500);
  const pr = await pc.locator("[data-testid=prism-rows] li").evaluateAll((els) => els.map((e) => [e.textContent.slice(0, 60), e.getAttribute("data-level")]));
  const lv = (needle) => (pr.find(([t]) => t.includes(needle)) || [])[1];
  check("PRISM check page: WebCrypto ECDSA, non-extractable key, IndexedDB CryptoKey, localStorage, canvas all PASS in Chromium", ["WebCrypto ECDSA", "non-extractable", "IndexedDB", "localStorage", "Canvas 2D"].every((n) => lv(n) === "pass"), JSON.stringify(pr.map(([t, l]) => `${t.slice(0, 18)}:${l}`)));
  await pc.close();
  const hdr = (await ctx.request.get(`${base}/overlay`)).headers();
  check("Content-Security-Policy is set (object-src none, connect-src limited)", /object-src 'none'/.test(hdr["content-security-policy"] ?? "") && /connect-src 'self'/.test(hdr["content-security-policy"] ?? ""), (hdr["content-security-policy"] ?? "none").slice(0, 90));

  // LIVE autonomous mode hides the simulator and shows read-only counters
  await c.getByTestId("live-toggle").click();
  check("LIVE mode hides the simulator buttons", (await c.getByRole("button", { name: /^Gift Big/ }).count()) === 0);
  check("LIVE mode still shows readiness + counters", (await c.getByTestId("readiness-overall").count()) === 1 && (await c.getByTestId("processed").count()) === 1);
  await c.getByTestId("live-toggle").click();

  check("ATM fits viewport at 540x960 and no horizontal overflow", await (async () => { const b = await stage.boundingBox(); return !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 541 && b.y + b.height <= 961; })());
  check("no third-party/CDN request in the UI suite", external.size === 0, [...external].join(","));
  check("UI suite: no console errors / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

async function autonomySuite(browser, phoenix) {
  console.log("\n== autonomy suite (NO control page: overlay + SIMULATED listener over the real realtime protocol) ==");
  const base = `http://127.0.0.1:${PORT_REMOTE}`;
  const room = "autoRoom" + "abcdefghijklmnopqrstuvwx".slice(0, 16);
  const errors = [];
  const keys = JSON.parse(await new Promise((res) => { const p = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "tests/genkeys.ts"]); p.on("close", () => res(p.out.trim().split("\n").pop())); }));
  const other = JSON.parse(await new Promise((res) => { const p = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "tests/genkeys.ts"]); p.on("close", () => res(p.out.trim().split("\n").pop())); }));
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } });
  const o = await ctx.newPage();
  watchErrors(o, "overlay", errors, ["WebSocket", "ERR_CONNECTION", "ws://", "net::"]);
  const url = `${base}/overlay?room=${room}&clean=1&debug=1&pk=${keys.publicKey}`;
  let dialogs = 0;
  o.on("dialog", (d) => { dialogs++; void d.dismiss(); });
  await o.goto(url);
  const hud = () => o.locator("pre").innerText();
  const num = async (re) => { const m = re.exec(await hud()); return m ? +m[1] : 0; };
  await o.waitForFunction(() => /remote:connected/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 20000 });
  check("overlay alone (no dashboard) connects to the realtime backend and enforces signatures", /secured:true/.test(await hud()));

  const L = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "tests/fake-listener.ts", room, phoenix.url, keys.privateKey]);
  await new Promise((r) => { const t = setInterval(() => { if (L.out.includes('"ready"')) { clearInterval(t); r(); } }, 50); });
  const cmd = (c) => L.stdin.write(c + "\n");
  const stats = async () => { const before = L.out.length; cmd("stats"); await new Promise((r) => { const t = setInterval(() => { if (L.out.slice(before).includes('"stats"')) { clearInterval(t); r(); } }, 50); }); return JSON.parse(L.out.slice(before).trim().split("\n").filter((l) => l.includes('"stats"')).pop()).stats; };

  cmd("join:1");
  await o.waitForSelector("[data-testid=atm-welcome]", { timeout: 20000 });
  check("viewer join from the listener shows a visible 'Welcome, @username' on the ATM (no button pressed)", /@\w/.test(await o.locator("[data-testid=atm-welcome]").innerText()));
  cmd("comment:2"); cmd("spam"); cmd("follow"); cmd("like:30"); cmd("share");
  await o.waitForSelector("[data-testid=ambient-comment]", { timeout: 15000 });
  check("comment from the listener is displayed automatically", true);
  await o.waitForFunction(() => /filt:[1-9]/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 15000 });
  check("spam link comment is filtered by the rules engine", true);
  cmd("small"); cmd("medium"); cmd("big");
  await o.waitForFunction(() => document.querySelectorAll(".note-out").length > 0, null, { timeout: 30000 });
  check("gifts trigger dispenser animations automatically", true);
  await o.waitForFunction(() => /done:4 /.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 90000 });
  check("join + small + medium + big processed in order, one at a time (done:4)", true);

  // duplicates, forged and unsigned messages
  const doneBefore = await num(/done:(\d+)/);
  cmd("dup"); cmd("dup");
  await sleep(2500);
  check("duplicate event (resent twice) is not processed again", (await num(/done:(\d+)/)) === doneBefore);
  cmd("forge"); await sleep(1500);
  const bad = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "tests/fake-listener.ts", room, phoenix.url, other.privateKey]);
  await new Promise((r) => { const t = setInterval(() => { if (bad.out.includes('"ready"')) { clearInterval(t); r(); } }, 50); });
  bad.stdin.write("special\n");
  await sleep(3500);
  check("forged (unsigned) and wrongly-signed events are refused, never shown", (await num(/refused:(\d+)/)) >= 2 && (await num(/done:(\d+)/)) === doneBefore, /refused:\d+/.exec(await hud())?.[0]);
  try { process.kill(-bad.pid, "SIGKILL"); } catch { /* gone */ }
  await o.waitForFunction(() => /phase:standby wait:0/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 60000 });
  check("after the events the overlay returns to idle (standby, empty queue)", true);

  // XSS: markup in username / comment / avatar fields (validly signed) must stay inert text
  cmd("xss");
  await o.waitForSelector("[data-testid=ambient-comment]", { timeout: 20000 });
  await o.waitForFunction(() => /phase:standby wait:0/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 60000 });
  const xss = await o.evaluate(() => ({ flag: window.__xss, imgs: document.querySelectorAll('img[src="x"]').length, scripts: document.querySelectorAll("script").length, svg: document.querySelectorAll("svg[onload]").length, text: document.body.innerText.includes("<img src=x") || document.body.innerText.includes("<script>") }));
  check("XSS: markup in username/comment/avatar is shown as text, never executed or injected", xss.flag === undefined && xss.imgs === 0 && xss.svg === 0 && dialogs === 0, JSON.stringify(xss));

  // unsigned / replayed CONTROL-PLANE messages (settings, clear)
  const ref0 = await num(/refused:(\d+)/);
  cmd("forge-settings");
  await sleep(2000);
  check("unsigned 'settings' (mute + night backdrop + idle off) is refused and changes nothing", (await num(/refused:(\d+)/)) === ref0 + 1 && (await o.locator("[data-testid=backdrop-night]").count()) === 0 && !/audio:\S+ muted/.test(await hud()));
  cmd("clear"); await sleep(1500);
  check("a validly signed 'clear' is accepted", (await num(/refused:(\d+)/)) === ref0 + 1);
  cmd("replay-clear"); await sleep(1500);
  check("the SAME signed 'clear' re-sent (replay) is refused", (await num(/refused:(\d+)/)) === ref0 + 2, /refused:\d+/.exec(await hud())?.[0]);

  // burst
  const d0 = await num(/done:(\d+)/), rx0 = await num(/rx:(\d+)/);
  cmd("burst:200");
  await o.waitForFunction((n) => { const m = /rx:(\d+)/.exec(document.querySelector("pre")?.textContent ?? ""); return m && +m[1] >= n + 190; }, rx0, { timeout: 60000 });
  await o.waitForFunction(() => /phase:standby wait:0/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 120000 });
  const st = await stats();
  check("burst of 200 mixed events: all delivered and acknowledged, overlay stable", st.undelivered === 0 && st.pending === 0, JSON.stringify(st));
  check("burst: only the 40 joins reached the dispenser lane (grouped), rest handled by the ambient lane", (await num(/done:(\d+)/)) - d0 === 40, `joins processed +${(await num(/done:(\d+)/)) - d0}`);

  // backend outage: gift sent while the realtime server is down arrives once after reconnect
  const d1 = await num(/done:(\d+)/);
  phoenix.stdin.write("pause\ndrop\n");
  await o.waitForFunction(() => !/remote:connected/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 20000 });
  check("overlay reports the realtime link as down (honest status)", true);
  cmd("big");
  await sleep(2500);
  phoenix.stdin.write("resume\n");
  await o.waitForFunction(() => /remote:connected/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 60000 });
  await o.waitForFunction((n) => { const m = /done:(\d+)/.exec(document.querySelector("pre")?.textContent ?? ""); return m && +m[1] >= n + 1; }, d1, { timeout: 90000 });
  await sleep(6000);
  check("reconnect: event sent during the outage is delivered exactly once", (await num(/done:(\d+)/)) === d1 + 1, `done ${d1} → ${await num(/done:(\d+)/)}`);

  // overlay reload (PRISM widget reload) mid-queue, no dashboard anywhere
  cmd("small:3");
  await o.waitForFunction(() => /phase:(processing|dispensing)/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 40000 });
  await o.reload();
  await o.waitForFunction(() => /remote:connected/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 30000 });
  await o.waitForFunction(() => /phase:standby wait:0/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 120000 });
  const s2 = await stats();
  check("overlay reload mid-queue: everything is acknowledged, listener has nothing undelivered", s2.undelivered === 0 && s2.pending === 0, JSON.stringify(s2));
  // the REAL listener process (replay source = rehearsal, not a real LIVE) end-to-end with signing
  const hp = 18700 + Math.floor(Math.random() * 200);
  const renv = { ...process.env, ATM_SOURCE: "replay", ATM_REPLAY_FILE: "listener/sample-replay.jsonl", SUPABASE_URL: phoenix.url, SUPABASE_ANON_KEY: "x".repeat(30), ATM_ROOM: room, ATM_SIGNING_KEY: keys.privateKey, ATM_HEALTH_PORT: String(hp) };
  const doneB = await num(/done:(\d+)/);
  const RL = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "listener/index.ts"], { env: renv });
  await o.waitForSelector("text=rehearsal_viewer_1", { timeout: 40000 });
  check("REAL listener process (replay source, signed): its events reach the overlay and are verified", true);
  const hres = await (await fetch(`http://127.0.0.1:${hp}/health`)).json();
  check("listener health endpoint: ok, signed, link ready, no secret in the payload", hres.ok === true && hres.signed === true && hres.link.ready === true && !JSON.stringify(hres).includes(keys.privateKey) && !JSON.stringify(hres).includes(room), JSON.stringify({ ok: hres.ok, state: hres.state, sent: hres.sent }));
  await o.waitForFunction((n) => { const m = /done:(\d+)/.exec(document.querySelector("pre")?.textContent ?? ""); return m && +m[1] >= n + 2; }, doneB, { timeout: 60000 });
  check("replay rehearsal drives join + gifts automatically through the real listener", true);
  const exit = new Promise((r) => RL.on("exit", (code) => r(code)));
  process.kill(-RL.pid, "SIGTERM");
  const code = await Promise.race([exit, sleep(9000).then(() => "timeout")]);
  check("graceful shutdown on SIGTERM: exits 0 after flushing, logs the shutdown", code === 0 && /shutting down/.test(RL.out), `exit=${code}`);
  check("listener output never contains the signing key, room code or anon key", !RL.out.includes(keys.privateKey) && !RL.out.includes(room) && !RL.out.includes("x".repeat(30)));
  const CK = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "listener/index.ts", "--check"], { env: { ...renv, ATM_HEALTH_PORT: "" } });
  const ckCode = await Promise.race([new Promise((r) => CK.on("exit", (c) => r(c))), sleep(30000).then(() => "timeout")]);
  check("listener --check: config valid and realtime link connects (exit 0)", ckCode === 0 && /realtime link: connected/.test(CK.out), `exit=${ckCode}`);
  // supervisor contract: a dead realtime link makes the process exit non-zero so systemd/Docker restarts it
  const SL = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "listener/index.ts"], { env: { ...renv, ATM_HEALTH_PORT: "", ATM_LINK_STALL_MS: "6000" } });
  await sleep(4000);
  phoenix.stdin.write("pause\ndrop\n");
  const slCode = await Promise.race([new Promise((r) => SL.on("exit", (c) => r(c))), sleep(45000).then(() => "timeout")]);
  phoenix.stdin.write("resume\n");
  check("link stall watchdog: listener exits with code 2 when the realtime link stays down (supervisor restarts it)", slCode === 2, `exit=${slCode}`);
  check("autonomy suite: no console errors / page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  try { process.kill(-L.pid, "SIGKILL"); } catch { /* gone */ }
  await ctx.close();
}

async function remoteSuite(browser, phoenix) {
  console.log("\n== remote suite (cross-context via realtime link; local Phoenix-protocol server) ==");
  const base = `http://127.0.0.1:${PORT_REMOTE}`;
  const room = "e2eRoom" + "abcdefghijklmnopqrstuvwx".slice(0, 17);
  const errors = [];
  const ign = ["WebSocket", "ERR_CONNECTION", "ws://", "net::"]; // expected while the server is intentionally dropped
  // two fully isolated contexts: no shared storage, no BroadcastChannel (like Safari vs PRISM web view)
  const ctxC = await browser.newContext({ viewport: IPAD, serviceWorkers: "block" });
  const ctxO = await browser.newContext({ viewport: { width: 540, height: 960 } });
  const c = await ctxC.newPage();
  const o = await ctxO.newPage();
  watchErrors(c, "control", errors, ign);
  watchErrors(o, "overlay", errors, ign);
  await o.goto(`${base}/overlay?room=${room}&clean=1&debug=1`);
  await c.goto(`${base}/control?room=${room}`);
  await c.waitForFunction(() => document.querySelector("[data-testid=remote-status]")?.textContent.trim() === "connected", null, { timeout: 15000 });
  check("control: cross-device link CONNECTED", true);
  await c.waitForFunction(() => document.querySelector("[data-testid=overlay-status]")?.textContent.includes("connected"), null, { timeout: 15000 });
  check("control detects overlay in a separate browser context (no shared storage/BroadcastChannel)", true, await tid(c, "overlay-status"));

  await c.getByRole("button", { name: /^Viewer Join/ }).click();
  await o.waitForFunction(() => /phase:processing|phase:dispensing/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 15000 });
  check("event sent from control animates in the separate overlay context", true);
  await c.getByRole("button", { name: /^Gift Big/ }).click();
  await waitProcessed(c, 2, 60000);
  check("overlay processed both events; status mirrored back to control", (await num(c, "processed")) === 2, "processed=" + (await tid(c, "processed")));

  // settings propagate (mute/mode)
  await c.getByRole("button", { name: "Gift Priority" }).click();
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("audio:"), null, { timeout: 5000 });
  await c.getByRole("button", { name: /^Mute$/ }).click();
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("muted"), null, { timeout: 8000 });
  check("mute/volume settings propagate to overlay", true);
  await c.getByRole("button", { name: /^Muted$/ }).click();

  // a different room must not receive anything
  const ctxX = await browser.newContext({ viewport: { width: 540, height: 960 } });
  const x = await ctxX.newPage();
  await x.goto(`${base}/overlay?room=otherRoomabcdefghijklmnop&clean=1&debug=1`);
  await x.waitForTimeout(2500);
  const xs = await x.locator("pre").innerText();
  check("overlay in a different room sees none of the events", /done:0/.test(xs), xs.split("\n")[2]);
  await ctxX.close();

  // disconnect during LIVE: gift sent while server is down must arrive exactly once after reconnect
  const doneBefore = await num(c, "processed");
  phoenix.stdin.write("pause\ndrop\n");
  await c.waitForFunction(() => document.querySelector("[data-testid=remote-status]")?.textContent.trim() !== "connected", null, { timeout: 15000 });
  check("control shows link state change when realtime drops", true, await tid(c, "remote-status"));
  await c.getByRole("button", { name: /^Gift Small/ }).click();
  await sleep(2500);
  phoenix.stdin.write("resume\n");
  await c.waitForFunction(() => document.querySelector("[data-testid=remote-status]")?.textContent.trim() === "connected", null, { timeout: 45000 });
  check("link auto-reconnects", true);
  await c.waitForFunction(() => document.querySelector("[data-testid=overlay-status]")?.textContent.includes("connected"), null, { timeout: 20000 });
  await sleep(500);
  const target = doneBefore + 1;
  await waitProcessed(c, target, 90000);
  await sleep(6000);
  check("gift sent during outage delivered after reconnect, exactly once", (await num(c, "processed")) === target, `processed=${await tid(c, "processed")} expected=${target}`);

  // ---------- real listener process with unreachable/offline TikTok ----------
  const lis = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "listener/index.ts"], {
    env: { ...process.env, TIKTOK_USERNAME: "atm_e2e_nonexistent_user", SUPABASE_URL: phoenix.url, SUPABASE_ANON_KEY: "x".repeat(30), ATM_ROOM: room },
  });
  await c.waitForFunction(() => !document.querySelector("[data-testid=listener-status]")?.textContent.includes("not running"), null, { timeout: 30000 });
  const ls = await tid(c, "listener-status");
  check("listener process visible in control with honest state (cannot reach a real LIVE from CI)", /connecting|reconnecting|error|offline/.test(ls) && !/connected @/.test(ls), ls);
  check("listener never claims 'connected' to TikTok without a real room", !/^connected/.test(ls));
  await c.screenshot({ path: path.join(OUT, "control-listener.png"), fullPage: true });
  try { process.kill(-lis.pid, "SIGINT"); } catch { /* gone */ }
  check("listener logs contain no secrets", !/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/.test(lis.out) && !lis.out.includes(room), lis.out.split("\n").slice(-3).join(" | ").slice(0, 200));

  check("remote suite: no unexpected console errors / page errors", errors.length === 0, errors.slice(0, 5).join(" | "));
  await ctxC.close();
  await ctxO.close();
}

(async () => {
  spawnProc("npx", ["next", "start", "-p", String(PORT_MAIN), "-H", "127.0.0.1"]);
  await waitHttp(`http://127.0.0.1:${PORT_MAIN}/control`);
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const only = process.env.E2E_ONLY;
    if (!only || only === "main") await mainSuite(browser);
    if (!only || only === "ui") await uiSuite(browser);
    if (only && only !== "remote" && only !== "autonomy") return;

    const phoenix = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "tests/phoenix-cli.ts"]);
    await new Promise((resolve) => { const t = setInterval(() => { if (phoenix.out.includes("{")) { clearInterval(t); resolve(); } }, 50); });
    phoenix.url = JSON.parse(phoenix.out.split("\n").find((l) => l.startsWith("{"))).url;
    const env = { ...process.env, NEXT_DIST_DIR: ".next-remote", NEXT_PUBLIC_SUPABASE_URL: phoenix.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(30) };
    console.log("building remote variant…");
    execSync("npx next build", { cwd: ROOT, env, stdio: "ignore" });
    spawnProc("npx", ["next", "start", "-p", String(PORT_REMOTE), "-H", "127.0.0.1"], { env });
    await waitHttp(`http://127.0.0.1:${PORT_REMOTE}/control`);
    if (!only || only === "remote") await remoteSuite(browser, phoenix);
    if (!only || only === "autonomy") await autonomySuite(browser, phoenix);
  } catch (e) {
    console.log("STACK:", String(e && e.stack || e).split("\n").filter((l) => /run\.cjs/.test(l)).slice(0, 4).join(" | "));
    check("E2E runner completed without crashing", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    children.forEach((p) => { try { process.kill(-p.pid, "SIGKILL"); } catch { /* gone */ } });
    const failed = results.filter((r) => !r.pass);
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed. Artifacts: ${OUT}`);
    process.exit(failed.length ? 1 : 0);
  }
})();
