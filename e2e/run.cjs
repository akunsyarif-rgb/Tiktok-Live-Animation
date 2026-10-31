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
  check("audio activation → 14/14 samples loaded", /14\/14 loaded/.test(await tid(c, "samples")), await tid(c, "samples"));
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
  check("stress: 30 queued events, UI still responsive", waitingBig >= 20, "waiting=" + waitingBig);
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
  check("audio 500 / corrupt file: reported as MISSING/degraded, app alive", /MISSING: cash_dispense/.test(samples) || /1[0-3]\/14/.test(samples), samples);
  await a.getByRole("button", { name: /^Gift Small/ }).click();
  await waitProcessed(a, 1, 40000);
  check("audio failure does not stop the visual transaction", true);
  check("audio-failure scenario: no unexpected JS errors", errA.length === 0, errA.join(" | "));
  await ctx3.close();

  check("main suite: no console errors / failed requests / page errors", errors.length === 0, errors.join(" | "));
}


async function themeSuite(browser) {
  console.log("\n== theme suite (3 themes, production build) ==");
  const base = `http://127.0.0.1:${PORT_MAIN}`;
  const errors = [];
  const ign = ["GL Driver Message", "ReadPixels"]; // SwiftShader (software GL) performance chatter, not an app error
  const ctx = await browser.newContext({ viewport: IPAD });
  const external = new Set();
  ctx.on("request", (r) => { const u = new URL(r.url()); if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) external.add(u.hostname); });
  const c = await ctx.newPage();
  watchErrors(c, "control", errors, ign);
  await c.goto(`${base}/control`);
  await c.waitForTimeout(700);
  const o = await ctx.newPage();
  await o.setViewportSize({ width: 540, height: 960 });
  watchErrors(o, "overlay", errors, ign);
  await o.goto(`${base}/overlay?bg=dark&clean=1&debug=1`);
  await o.waitForTimeout(900);
  const hud = async () => {
    try {
      return await o.locator("pre").innerText({ timeout: 8000 });
    } catch (err) {
      const probe = await Promise.race([
        o.evaluate(() => JSON.stringify({ url: location.href, ready: document.readyState, bodyLen: document.body.innerText.length, pre: document.querySelectorAll("pre").length, canvases: document.querySelectorAll("canvas").length, text: document.body.innerText.slice(0, 160) })),
        new Promise((r) => setTimeout(() => r("PAGE UNRESPONSIVE (evaluate hung 5 s)"), 5000)),
      ]).catch((e) => "evaluate error " + e.message);
      console.log("DIAG hud failed:", probe, "| errors:", JSON.stringify(errors.slice(0, 3)));
      try { // where is the main thread? (JS frames if it is running script; none if stuck in a native/GPU call)
        const cdp = await o.context().newCDPSession(o);
        await cdp.send("Debugger.enable");
        const paused = new Promise((r) => cdp.once("Debugger.paused", (e) => r(e.callFrames.slice(0, 8).map((f) => `${f.functionName || "(anon)"} ${f.url.split("/").slice(-2).join("/")}:${f.location.lineNumber}`).join(" <- "))));
        await cdp.send("Debugger.pause");
        console.log("DIAG main-thread stack:", await Promise.race([paused, new Promise((r) => setTimeout(() => r("NO JS FRAMES within 6 s (native/GPU stall, not running script)"), 6000))]));
      } catch (e2) { console.log("DIAG cdp failed", e2.message); }
      await o.screenshot({ path: path.join(OUT, "diag-hud-failed.png"), timeout: 5000 }).catch(() => {});
      throw err;
    }
  };
  const waitStandby = async (ms = 90000) => c.waitForFunction(() => document.querySelector("[data-testid=phase]")?.textContent.trim() === "standby" && document.querySelector("[data-testid=waiting]")?.textContent.trim() === "0", null, { timeout: ms });
  const processed = async () => num(c, "processed");
  await c.waitForFunction(() => document.querySelector("[data-testid=overlay-status]")?.textContent.includes("connected"), null, { timeout: 15000 });

  // --- theme selector syncs to overlay ---
  for (const t of ["reactor", "marble", "atm"]) {
    await c.getByTestId(`theme-${t}`).click();
    await o.waitForFunction((t) => document.querySelector("pre")?.textContent.includes(`theme:${t}`), t, { timeout: 8000 });
    const kind = t === "atm" ? await o.getByTestId("atm-body").count() : await o.locator(`[data-testid=three-stage][data-theme=${t}]`).count();
    check(`theme selector → overlay switches to ${t}`, kind === 1);
  }
  // persisted: reload overlay keeps last theme
  await c.getByTestId("theme-reactor").click();
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("theme:reactor"), null, { timeout: 8000 });
  await o.reload(); await o.waitForTimeout(1200);
  check("theme persists across overlay reload", (await hud()).includes("theme:reactor"));
  check("debug monitor is OFF unless ?debug=1", await (async () => { const p = await ctx.newPage(); await p.goto(`${base}/overlay?clean=1`); await p.waitForTimeout(500); const n = await p.locator("pre").count(); await p.close(); return n === 0; })());

  // --- idle (attract) animation per theme ---
  // compare the stage only (the debug HUD text legitimately changes every second)
  const diff = async (page) => {
    const el = page.locator("[data-testid=three-stage], [data-testid=atm-body]").first();
    const a = await el.screenshot(); await page.waitForTimeout(1500); const b = await el.screenshot(); return !a.equals(b);
  };
  for (const t of ["atm", "reactor", "marble"]) {
    await c.getByTestId(`theme-${t}`).click();
    await o.waitForFunction((t) => document.querySelector("pre")?.textContent.includes(`theme:${t}`), t, { timeout: 8000 });
    await o.waitForTimeout(1200);
    check(`${t}: idle animation runs by itself (frames differ with no events)`, await diff(o));
  }
  // idle disabled → static
  await c.getByLabel("Idle animation").uncheck();
  await o.waitForTimeout(1500);
  for (const t of ["reactor", "atm"]) {
    await c.getByTestId(`theme-${t}`).click();
    await o.waitForFunction((t) => document.querySelector("pre")?.textContent.includes(`theme:${t}`), t, { timeout: 8000 });
    await o.waitForTimeout(1500);
    check(`${t}: idle animation can be disabled (static frame)`, !(await diff(o)));
  }
  await c.getByLabel("Idle animation").check();
  await o.waitForTimeout(800);

  // --- welcome shows the real username in every theme ---
  for (const t of ["atm", "reactor", "marble"]) {
    await c.getByTestId(`theme-${t}`).click();
    await o.waitForFunction((t) => document.querySelector("pre")?.textContent.includes(`theme:${t}`), t, { timeout: 8000 });
    const before = await processed();
    await c.getByRole("button", { name: /^Viewer Join/ }).click();
    const sel = t === "atm" ? "[data-testid=atm-welcome]" : "[data-testid=hud-welcome]";
    await o.waitForSelector(sel, { timeout: 15000 });
    const txt = (await o.locator(sel).first().innerText()).replace(/\n/g, " ");
    const logName = /@([a-z0-9_.]+)/i.exec(txt);
    check(`${t}: join shows "Welcome/…, @username" (real name)`, !!logName && /(Welcome|Glad|visitor)/i.test(txt), txt.slice(0, 70));
    if (t !== "atm") await o.screenshot({ path: path.join(OUT, `theme-${t}-join.png`) });
    await waitStandby(); 
    await c.waitForFunction((b) => parseInt(document.querySelector("[data-testid=processed]").textContent, 10) > b, before, { timeout: 30000 });
  }

  // --- gift levels visible: ATM note counts per level ---
  await c.getByTestId("theme-atm").click();
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("theme:atm"), null, { timeout: 8000 });
  const noteCounts = {};
  for (const [label, key] of [["Gift Small", "small"], ["Gift Medium", "medium"], ["Gift Big", "big"], ["Gift Special", "special"]]) {
    await c.getByRole("button", { name: new RegExp("^" + label) }).click();
    await o.waitForFunction(() => document.querySelectorAll(".note-out").length > 0, null, { timeout: 15000 });
    await o.waitForTimeout(key === "special" ? 3500 : 2800);
    noteCounts[key] = await o.locator(".note-out").count();
    if (key === "special") await o.screenshot({ path: path.join(OUT, "atm-special.png") });
    await waitStandby();
    await o.waitForTimeout(600);
  }
  check("ATM levels: small 3-6 notes, medium 10 notes, big 1 bundle, special 2 bundles", noteCounts.small >= 3 && noteCounts.small <= 6 && noteCounts.medium === 10 && noteCounts.big === 1 && noteCounts.special === 2, JSON.stringify(noteCounts));

  // --- stress on the Reactor: 5 gifts, big during animation, 20 joins, special after the long queue ---
  await c.getByTestId("theme-reactor").click();
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("theme:reactor"), null, { timeout: 8000 });
  const p0 = await processed();
  for (let i = 0; i < 5; i++) await c.getByRole("button", { name: /^Gift Small/ }).click();
  await o.waitForFunction(() => /phase:(processing|dispensing)/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 15000 });
  await c.getByRole("button", { name: /^Gift Big/ }).click(); // while an animation is running
  await c.getByRole("button", { name: /Join ×20/ }).click();
  await c.getByRole("button", { name: /^Gift Special/ }).click();
  await c.waitForFunction(() => parseInt(document.querySelector("[data-testid=waiting]")?.textContent ?? "0", 10) >= 15, null, { timeout: 8000 }).catch(() => {});
  const waitingNow = await num(c, "waiting");
  check("stress: long queue builds (5 gifts + big + 20 joins + special)", waitingNow >= 15, "waiting=" + waitingNow);
  await waitStandby(180000);
  await sleep(1500);
  const p1 = await processed();
  check("stress: all 27 events processed exactly once, queue empty, nothing dropped", p1 - p0 === 27 && (await num(c, "waiting")) === 0 && (await num(c, "dropped")) === 0, `processed +${p1 - p0}`);
  const recent = await c.getByTestId("recent-list").innerText();
  check("recent visitors list is shown in control (max 8)", (recent.match(/@/g) || []).length <= 8 && (recent.match(/@/g) || []).length >= 5);

  // --- theme switching while a queue is running ---
  const s0 = await processed();
  for (let i = 0; i < 3; i++) await c.getByRole("button", { name: /^Gift Medium/ }).click();
  await o.waitForFunction(() => /phase:(processing|dispensing)/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 15000 });
  for (const t of ["marble", "atm", "reactor"]) { await c.getByTestId(`theme-${t}`).click(); await sleep(900); }
  await waitStandby(120000);
  await sleep(1200);
  check("theme switching during a queue: every event completes once", (await processed()) - s0 === 3, `processed +${(await processed()) - s0}`);

  // --- cleanup / leak check: cycle themes, one canvas at a time, geometry/texture counts stable, heap bounded ---
  const heap = async () => o.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0));
  const counts = async () => { const h = await hud(); const m = /geo:(\d+) tex:(\d+)/.exec(h); return m ? [+m[1], +m[2]] : [0, 0]; };
  await c.getByTestId("theme-reactor").click(); await o.waitForTimeout(1500);
  if ((await o.locator("pre").count()) !== 1) {
    // diagnostic for the overlay going blank
    console.log("DIAG overlay has no HUD. errors so far:", JSON.stringify(errors.slice(0, 5)), "url:", o.url(), "closed:", o.isClosed());
    console.log("DIAG body:", (await o.locator("body").innerText().catch((e) => "ERR " + e.message)).slice(0, 300).replace(/\n/g, " | "));
    await o.screenshot({ path: path.join(OUT, "diag-blank-overlay.png") }).catch(() => {});
  }
  const geo0 = (await counts())[0], h0 = await heap();
  for (let i = 0; i < 4; i++) for (const t of ["marble", "reactor", "atm", "reactor"]) { await c.getByTestId(`theme-${t}`).click(); await o.waitForTimeout(350); }
  await c.getByTestId("theme-reactor").click(); await o.waitForTimeout(2500);
  const [geo1] = await counts();
  const canv = await o.evaluate(() => document.querySelectorAll("canvas").length);
  const h1 = await heap();
  check("cleanup: exactly one WebGL canvas after 16 theme switches", canv === 1, "canvases=" + canv);
  check("cleanup: GPU geometry count does not grow over theme switches", geo1 <= geo0 + 2, `geometries ${geo0} → ${geo1}`);
  check("cleanup: JS heap growth stays small over 16 theme switches", h1 - h0 < 40, `${h0.toFixed(1)} → ${h1.toFixed(1)} MB`);

  // --- WebGL context loss and restore ---
  const lost = await o.evaluate(() => !!window.__visual);
  check("debug hook available (?debug=1)", lost);
  await o.evaluate(() => window.__visual.loseContext());
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("gl:lost"), null, { timeout: 8000 });
  check("context loss is detected (gl:lost) without page error", true);
  await o.evaluate(() => window.__visual.restoreContext());
  await o.waitForFunction(() => document.querySelector("pre")?.textContent.includes("gl:ok"), null, { timeout: 12000 });
  await o.waitForTimeout(1500);
  check("context restored: scene rebuilt and animating again", await diff(o));
  await c.getByRole("button", { name: /^Viewer Join/ }).click();
  await o.waitForSelector("[data-testid=hud-welcome]", { timeout: 15000 });
  check("transactions still work after context restore", true);
  await waitStandby();

  // --- transparency (canvas + page) ---
  const op = await ctx.newPage();
  await op.setViewportSize({ width: 540, height: 960 });
  watchErrors(op, "transparent", errors, ign);
  await op.goto(`${base}/overlay?clean=1`);
  await op.waitForTimeout(2500);
  const png = (await op.screenshot({ omitBackground: true })).toString("base64");
  const alpha = await (await ctx.newPage()).evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
    const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
    return { corners: [a(3, 3), a(img.width - 4, 3), a(3, img.height - 4)], centre: a(Math.floor(img.width / 2), Math.floor(img.height * 0.46)), w: img.width };
  }, png);
  check("WebGL overlay is transparent at the corners and drawn in the centre (alpha channel)", alpha.corners.some((v) => v === 0) && alpha.centre > 0, JSON.stringify(alpha));
  await op.close();

  // --- no CDN / third-party host at runtime ---
  check("no third-party/CDN request in the whole theme suite", external.size === 0, [...external].join(","));

  // --- overlay reload (reconnect) mid-queue: nothing repeated, nothing lost ---
  await c.getByTestId("theme-reactor").click();
  await o.waitForTimeout(800);
  for (let i = 0; i < 4; i++) await c.getByRole("button", { name: /^Gift Small/ }).click();
  const doneOf = async () => { const m = /done:(\d+)/.exec(await hud()); return m ? +m[1] : 0; };
  await o.waitForFunction(() => /done:1/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 60000 });
  const doneBefore = await doneOf();
  await o.reload();
  await o.waitForTimeout(1500);
  await o.waitForFunction(() => /phase:standby wait:0/.test(document.querySelector("pre")?.textContent ?? ""), null, { timeout: 90000 });
  await o.waitForTimeout(1500);
  const doneAfter = await doneOf();
  check("overlay reload mid-queue: pending resume, finished ones not repeated (before+after = 4)", doneBefore + doneAfter === 4, `before=${doneBefore} after=${doneAfter}`);

  check("theme suite: no console errors / page errors / failed requests", errors.length === 0, errors.slice(0, 4).join(" | "));
  await ctx.close();

  // --- no WebGL at all → DOM fallback, names still shown ---
  const nb = await chromium.launch({ args: ["--disable-gpu", "--disable-3d-apis", "--disable-webgl", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const nctx = await nb.newContext({ viewport: IPAD });
    const nerr = [];
    const nc = await nctx.newPage(); watchErrors(nc, "nowebgl-control", nerr);
    await nc.goto(`${base}/control`); await nc.waitForTimeout(600);
    const no = await nctx.newPage(); await no.setViewportSize({ width: 540, height: 960 }); watchErrors(no, "nowebgl-overlay", nerr);
    await no.goto(`${base}/overlay?clean=1&debug=1`); await no.waitForTimeout(800);
    for (const t of ["reactor", "marble"]) {
      await nc.getByTestId(`theme-${t}`).click();
      await no.waitForSelector("[data-testid=fallback-stage]", { timeout: 10000 });
      check(`${t}: WebGL unavailable → DOM fallback shown`, (await no.locator("[data-testid=fallback-stage]").getAttribute("data-theme")) === t);
      await nc.getByRole("button", { name: /^Viewer Join/ }).click();
      await no.waitForSelector("[data-testid=hud-welcome]", { timeout: 15000 });
      check(`${t}: fallback still shows the welcome name`, /@/.test(await no.locator("[data-testid=hud-welcome]").innerText()));
      await nc.waitForFunction(() => document.querySelector("[data-testid=phase]")?.textContent.trim() === "standby", null, { timeout: 30000 });
    }
    check("WebGL status reported as unavailable in the debug monitor", (await no.locator("pre").innerText()).includes("gl:unavailable"));
    check("no-WebGL scenario: no JS errors", nerr.length === 0, nerr.join(" | "));
    await nctx.close();
  } finally { await nb.close(); }
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
    if (!only || only === "theme") await themeSuite(browser);
    if (only && only !== "remote") return;

    const phoenix = spawnProc("node", ["--experimental-strip-types", "--no-warnings", "tests/phoenix-cli.ts"]);
    await new Promise((resolve) => { const t = setInterval(() => { if (phoenix.out.includes("{")) { clearInterval(t); resolve(); } }, 50); });
    phoenix.url = JSON.parse(phoenix.out.split("\n").find((l) => l.startsWith("{"))).url;
    const env = { ...process.env, NEXT_DIST_DIR: ".next-remote", NEXT_PUBLIC_SUPABASE_URL: phoenix.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(30) };
    console.log("building remote variant…");
    execSync("npx next build", { cwd: ROOT, env, stdio: "ignore" });
    spawnProc("npx", ["next", "start", "-p", String(PORT_REMOTE), "-H", "127.0.0.1"], { env });
    await waitHttp(`http://127.0.0.1:${PORT_REMOTE}/control`);
    await remoteSuite(browser, phoenix);
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
