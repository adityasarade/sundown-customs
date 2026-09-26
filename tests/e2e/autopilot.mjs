/**
 * Autopilot: plays The Last Delivery through real keyboard input only.
 * It reads live telemetry from the dev-only `window.__sd.telemetry()` hook and
 * steers toward the next point of the planned route (no teleports), reacts to
 * the Spray & Pray booth by applying a disguise kit, and reports the outcome.
 *
 *   node tests/e2e/autopilot.mjs            (expects a dev server on E2E_URL or starts one)
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const URL = process.env.E2E_URL || "http://127.0.0.1:5198";
const OUT = "test-results/autopilot";
mkdirSync(OUT, { recursive: true });

let server = null;
async function up(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
if (!process.env.E2E_URL) {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5198", "--strictPort"], { stdio: "ignore" });
  if (!(await up(URL))) throw new Error("dev server did not start");
}

let pw;
try {
  pw = await import("playwright");
  await pw.chromium.launch().then((b) => b.close());
} catch {
  pw = await import("/opt/homebrew/lib/node_modules/playwright/index.mjs");
}
const browser = await pw.chromium.launch({ args: ["--use-gl=angle", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const held = new Set();
async function hold(key, on) {
  if (on && !held.has(key)) {
    held.add(key);
    await page.keyboard.down(key);
  } else if (!on && held.has(key)) {
    held.delete(key);
    await page.keyboard.up(key);
  }
}
async function releaseAll() {
  for (const k of [...held]) await hold(k, false);
}

try {
  await page.goto(URL);
  await page.getByRole("button", { name: /START THE JOB/ }).first().click();
  await page.waitForSelector(".garage-ui", { timeout: 15000 });
  await page.waitForTimeout(3800);
  // Skip painting: use a template livery via the dev hook so the run is the focus.
  await page.evaluate(() => {
    const img = document.querySelector(".style-card img");
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 600;
    c.getContext("2d").drawImage(img, 0, 0, 1200, 600);
    window.__sd.setSaved(c.toDataURL());
  });
  await page.waitForTimeout(600);
  const route = process.env.ROUTE || "default";
  if (route !== "default") await page.evaluate((r) => window.__sd.useRoute?.(r), route);
  await page.getByRole("button", { name: /TAKE THE DELIVERY/ }).click();
  await page.getByRole("button", { name: /LET’S MAKE BAD DECISIONS|START THE RUN|DRIVE/ }).first().click();
  await page.waitForTimeout(2600);
  await shot("01-start");
  const t0 = Date.now();
  let lastLog = 0,
    resprays = 0,
    shots = 0;
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => {
      const t = window.__sd?.telemetry?.();
      const m = window.__sd?.mission?.();
      return {
        t,
        route: m?.route,
        phase: document.querySelector(".editor-respray") ? "respray" : document.querySelector(".result-ui") ? "result" : "drive",
      };
    });
    if (s.phase === "result") break;
    if (s.phase === "respray") {
      await releaseAll();
      resprays++;
      await shot(`respray-${resprays}`);
      await page.locator(".kit").first().click({ timeout: 30000 });
      await page.waitForTimeout(3500);
      await page.getByRole("button", { name: "Respray & go" }).click();
      await page.waitForTimeout(1500);
      continue;
    }
    const { t, route: r } = s;
    if (!t || !r) {
      await page.waitForTimeout(100);
      continue;
    }
    const target = r[Math.min(t.checkpoint + 1, r.length - 1)];
    const dx = target.x - t.x,
      dz = target.z - t.z,
      dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, -dz);
    const err = wrap(desired - t.heading);
    await hold("d", err > 0.07);
    await hold("a", err < -0.07);
    const sharp = Math.abs(err) > 0.9;
    await hold("s", sharp && t.speed > 45);
    await hold("w", !(sharp && t.speed > 45));
    if (Date.now() - lastLog > 3000) {
      lastLog = Date.now();
      console.log(`cp ${t.checkpoint}/${t.totalCheckpoints} pos ${t.x.toFixed(0)},${t.z.toFixed(0)} dist ${dist.toFixed(0)} spd ${t.speed.toFixed(0)} ★${t.stars} $${t.payout}`);
      if (shots < 6) await shot(`drive-${++shots}`);
    }
    await page.waitForTimeout(60);
  }
  await releaseAll();
  await page.waitForTimeout(3500);
  await shot("99-result");
  const outcome = await page.evaluate(() => document.querySelector(".gta-splash strong")?.textContent || "no result");
  console.log("OUTCOME:", outcome, "resprays:", resprays, "errors:", errors.length ? errors : "none");
  if (!/MISSION PASSED/.test(outcome) || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server?.kill();
}
