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
  check("audio activation → 5/5 samples loaded", /5\/5 loaded/.test(await tid(c, "samples")), await tid(c, "samples"));
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

  await c.getByRole("button", { name: /^Gift Large/ }).click();
  await c.waitForFunction(() => document.querySelectorAll(".note-out").length > 0, null, { timeout: 8000 });
  await c.waitForTimeout(2500);
  await c.screenshot({ path: path.join(OUT, "large-dispensing.png") });
  const bundleText = await c.locator(".note-out").first().innerText();
  check("gift large dispenses ONE strapped bundle showing 'Rp 1.000.000' + VIRTUAL", (await notes()) === 1 && /1\.000\.000/.test(bundleText) && /VIRTUAL/.test(bundleText), bundleText.replace(/\n/g, " "));
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
  await c.getByRole("button", { name: /^Gift Large/ }).click();
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
  check("audio 500 / corrupt file: reported as MISSING/degraded, app alive", /MISSING: cash_dispense/.test(samples) || /3\/5|4\/5/.test(samples), samples);
  await a.getByRole("button", { name: /^Gift Small/ }).click();
  await waitProcessed(a, 1, 40000);
  check("audio failure does not stop the visual transaction", true);
  check("audio-failure scenario: no unexpected JS errors", errA.length === 0, errA.join(" | "));
  await ctx3.close();

  check("main suite: no console errors / failed requests / page errors", errors.length === 0, errors.join(" | "));
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
  await c.getByRole("button", { name: /^Gift Large/ }).click();
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
    await mainSuite(browser);

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
