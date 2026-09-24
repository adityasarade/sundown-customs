#!/usr/bin/env node
/**
 * End-to-end flow test for Sundown Customs.
 *
 * Plays the whole game once, start to finish, against a real Chromium
 * browser and the real (non-mocked) Unlayer react-image-editor runtime
 * loaded from cdn.unlayer.com. Verifies:
 *   a. home -> garage
 *   b. decal rack
 *   c. paint booth (wrap editor): Tint -> Invert -> Fit the wrap
 *   d. delivery briefing -> drive
 *   e. getting wanted stars
 *   f. Spray & Pray respray booth
 *   g. finishing the delivery run
 *   h. the news broadcast
 *   i. photo mode -> Snappix -> BAYFEED
 *
 * Usage:
 *   node tests/e2e/flow.mjs
 *   E2E_MOBILE=1 node tests/e2e/flow.mjs
 *   E2E_URL=http://127.0.0.1:5188 node tests/e2e/flow.mjs   (use a server you already started)
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SHOT_DIR = path.join(ROOT, "test-results", "e2e");
mkdirSync(SHOT_DIR, { recursive: true });

const HOMEBREW_PLAYWRIGHT = "/opt/homebrew/lib/node_modules/playwright/index.mjs";
const DEV_PORT = 5199;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const LAUNCH_ARGS = ["--use-gl=angle", "--ignore-gpu-blocklist"];

const MOBILE = process.env.E2E_MOBILE === "1";
const VIEWPORT = MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 860 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function log(msg) {
  console.log(msg);
}

/** Import "playwright", falling back to the Homebrew-installed copy. */
async function loadPlaywright() {
  try {
    const mod = await import("playwright");
    return mod;
  } catch (err) {
    log(`(playwright import from node_modules failed: ${err.message}; trying Homebrew copy)`);
    return import(HOMEBREW_PLAYWRIGHT);
  }
}

/**
 * Launch Chromium, trying the resolved "playwright" package first. If the
 * launch itself fails (most commonly: the resolved package's pinned browser
 * revision isn't cached on this machine), retry with the Homebrew copy of
 * playwright, whose bundled browser revision is known to be cached here.
 */
async function launchChromium() {
  const primary = await loadPlaywright();
  try {
    const browser = await primary.chromium.launch({ headless: true, args: LAUNCH_ARGS });
    return browser;
  } catch (err) {
    log(`(chromium.launch via resolved playwright failed: ${err.message}; retrying with Homebrew playwright)`);
    const fallback = await import(HOMEBREW_PLAYWRIGHT);
    return fallback.chromium.launch({ headless: true, args: LAUNCH_ARGS });
  }
}

/** Start the Vite dev server and wait until it answers HTTP 200. */
async function startDevServer() {
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite dev server exited early (code ${child.exitCode}).\n${output}`);
    }
    try {
      const res = await fetch(DEV_URL);
      if (res.status === 200) return child;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  stopDevServer(child);
  throw new Error(`Vite dev server did not respond with HTTP 200 within 30s.\n${output}`);
}

function stopDevServer(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill();
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const results = [];
  let failed = false;
  let devServer = null;
  let browser = null;
  let page = null;
  const pageErrors = [];

  const baseUrl = process.env.E2E_URL || DEV_URL;

  async function shot(name) {
    if (!page) return;
    try {
      await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
    } catch {}
  }

  /** Run one named step. Skips remaining steps once something has failed. */
  async function step(name, fn) {
    if (failed) {
      results.push({ name, status: "skip" });
      log(`- ${name} (skipped)`);
      return;
    }
    try {
      await fn();
      results.push({ name, status: "pass" });
      log(`✓ ${name}`);
      await shot(`pass-${slug(name)}`);
    } catch (err) {
      failed = true;
      const message = err && err.message ? err.message : String(err);
      results.push({ name, status: "fail", error: message });
      log(`✗ ${name}: ${message}`);
      await shot(`fail-${slug(name)}`);
    }
  }

  const holdKey = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };

  try {
    if (!process.env.E2E_URL) {
      log(`Starting Vite dev server on ${DEV_URL} ...`);
      devServer = await startDevServer();
      log("Vite dev server is up.");
    } else {
      log(`Using existing server at ${baseUrl} (E2E_URL set).`);
    }

    browser = await launchChromium();
    const context = await browser.newContext({ viewport: VIEWPORT });
    page = await context.newPage();
    page.on("pageerror", (err) => {
      pageErrors.push(err.message || String(err));
    });

    // a. Home -> garage ----------------------------------------------------
    await step("a. load home and open the garage", async () => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const cta = page
        .getByRole("button", { name: /START THE JOB|OPEN THE GARAGE/ })
        .first();
      await cta.waitFor({ state: "visible", timeout: 15000 });
      await cta.click();

      const garageUi = page.locator(".garage-ui");
      await garageUi.waitFor({ state: "visible", timeout: 8000 });

      const intro = page.locator(".char-intro");
      if (await intro.isVisible().catch(() => false)) {
        await intro.click({ timeout: 2000 }).catch(() => {});
      }
      await garageUi.waitFor({ state: "visible", timeout: 8000 });
    });

    // b. Decal rack ----------------------------------------------------
    await step("b. decal rack places a decal", async () => {
      const rackBtn = page.locator(".rack-grid button").first();
      await rackBtn.waitFor({ state: "visible", timeout: 8000 });
      await rackBtn.click();

      const label = page.locator(".decal-rack .field-label");
      await label.waitFor({ state: "visible", timeout: 5000 });
      const text = (await label.innerText()).trim();
      if (!text.includes("1/4")) {
        throw new Error(`expected ".decal-rack .field-label" to contain "1/4", got "${text}"`);
      }
    });

    // c. Real Unlayer editor: wrap ---------------------------------------
    await step("c. paint booth: Tint, Invert, Fit the wrap", async () => {
      await page.getByRole("button", { name: "MAKE IT YOURS" }).click();

      const editorScreen = page.locator(".editor-screen");
      await editorScreen.waitFor({ state: "visible", timeout: 10000 });
      await page.getByText("Fit the wrap").first().waitFor({ timeout: 25000 });

      for (const label of ["Spray can", "Tag", "Decals"]) {
        const locator = page.getByText(label, { exact: true }).first();
        try {
          await locator.waitFor({ state: "visible", timeout: 25000 });
        } catch {
          throw new Error(`Unlayer custom tool label "${label}" never became visible (hosted runtime may not have loaded)`);
        }
      }

      try {
        await page.getByText("Tint", { exact: true }).first().click({ timeout: 10000 });
      } catch {
        throw new Error('could not click the "Tint" tool in the Unlayer toolbar');
      }
      try {
        await page.getByText("Invert", { exact: true }).first().click({ timeout: 10000 });
      } catch {
        throw new Error('could not click the "Invert" filter preset in the Unlayer toolbar');
      }
      await page.waitForTimeout(2500);

      try {
        await page.getByRole("button", { name: "Fit the wrap" }).first().click({ timeout: 10000 });
      } catch {
        throw new Error('could not click the "Fit the wrap" (Unlayer Save) button');
      }

      const garageUi = page.locator(".garage-ui");
      await garageUi.waitFor({ state: "visible", timeout: 10000 });
      const pill = page.locator(".status-pill");
      await pill.waitFor({ state: "visible", timeout: 5000 });
      const pillText = (await pill.innerText()).trim();
      if (!pillText.includes("WRAP FITTED")) {
        throw new Error(`expected ".status-pill" to contain "WRAP FITTED", got "${pillText}"`);
      }
    });

    // d. Take the delivery -------------------------------------------------
    await step("d. take the delivery and start driving", async () => {
      await page.getByRole("button", { name: "TAKE THE DELIVERY" }).click();
      const goBtn = page.getByRole("button", { name: "LET’S MAKE BAD DECISIONS" });
      await goBtn.waitFor({ state: "visible", timeout: 8000 });
      await goBtn.click();

      const driveUi = page.locator(".drive-ui");
      await driveUi.waitFor({ state: "visible", timeout: 10000 });
    });

    // e. Get wanted -------------------------------------------------------
    let starsBeforeRespray = 0;
    await step("e. reach the pier and get wanted stars", async () => {
      await page.evaluate(() => window.__sd.world.current.teleport(0, -75, 0));
      await holdKey("w", 1300);

      const deadline = Date.now() + 6000;
      let ok = false;
      while (Date.now() < deadline) {
        const bannerText = await page.locator(".gta-banner").innerText().catch(() => "");
        const starsOn = await page.locator(".stars svg.on").count();
        if (bannerText.includes("WANTED") || starsOn >= 3) {
          ok = true;
          starsBeforeRespray = Math.max(starsOn, 3);
          break;
        }
        await page.waitForTimeout(250);
      }
      if (!ok) {
        throw new Error('neither a ".gta-banner" containing "WANTED" nor 3+ lit ".stars svg.on" appeared within 6s');
      }
    });

    // f. Respray booth ------------------------------------------------------
    await step("f. Spray & Pray respray booth", async () => {
      const starsNow = await page.locator(".stars svg.on").count();
      if (starsNow > 0) starsBeforeRespray = starsNow;

      await page.evaluate(() => window.__sd.world.current.teleport(140, -41, Math.PI));
      await holdKey("w", 300);

      const editorRespray = page.locator(".editor-respray");
      await editorRespray.waitFor({ state: "visible", timeout: 8000 });

      const kit = page.locator(".kit").first();
      await kit.waitFor({ state: "visible", timeout: 5000 });
      await kit.click();
      await page.waitForTimeout(4000);

      try {
        await page.getByRole("button", { name: "Respray & go" }).click({ timeout: 10000 });
      } catch {
        throw new Error('could not click the "Respray & go" (Unlayer Save) button');
      }

      const driveUi = page.locator(".drive-ui");
      await driveUi.waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(1200); // let the world's telemetry catch up to the new star count

      const starsAfter = await page.locator(".stars svg.on").count();
      if (!(starsAfter < starsBeforeRespray)) {
        throw new Error(`expected fewer lit stars after respray (before=${starsBeforeRespray}, after=${starsAfter})`);
      }
    });

    // g. Finish the run -----------------------------------------------------
    await step("g. finish the delivery run", async () => {
      await page.evaluate(() => window.__sd.world.current.teleport(115, -100, Math.PI / 2));
      await holdKey("w", 1200);
      await page.evaluate(() => window.__sd.world.current.teleport(140, 25, Math.PI));
      await holdKey("w", 1200);
      await page.evaluate(() => window.__sd.world.current.teleport(30, 50, -Math.PI / 2));
      await holdKey("w", 1500);

      const resultUi = page.locator(".result-ui");
      await resultUi.waitFor({ state: "visible", timeout: 10000 });

      const splash = await page.locator(".gta-splash").innerText();
      if (!splash.includes("MISSION PASSED")) {
        throw new Error(`expected ".gta-splash" to contain "MISSION PASSED", got "${splash}"`);
      }
    });

    // h. News broadcast -------------------------------------------------
    await step("h. the news broadcast", async () => {
      await page.waitForTimeout(3500);
      const newsBtn = page.getByRole("button", { name: /YOU MADE THE NEWS/ });
      await newsBtn.waitFor({ state: "visible", timeout: 8000 });
      await newsBtn.click();

      const news = page.locator(".news");
      await news.waitFor({ state: "visible", timeout: 8000 });

      const headline = (await page.locator(".lt-head h2").innerText()).trim();
      if (!headline) throw new Error('".lt-head h2" was empty');

      const compare = (await page.locator(".paint-compare b").innerText()).trim();
      if (!compare.includes("% NEW")) {
        throw new Error(`expected ".paint-compare b" to contain "% NEW", got "${compare}"`);
      }
    });

    // i. Photo mode -> Snappix -> BAYFEED ------------------------------
    await step("i. photo mode, Snappix, and BAYFEED", async () => {
      await page.getByRole("button", { name: /PHOTO MODE/ }).click();

      const captureBtn = page.getByRole("button", { name: "CAPTURE THIS ANGLE" });
      await captureBtn.waitFor({ state: "visible", timeout: 8000 });
      await captureBtn.click();
      await page.waitForTimeout(500);

      const snappixBtn = page.getByRole("button", { name: "OPEN IN SNAPPIX" });
      await snappixBtn.waitFor({ state: "visible", timeout: 5000 });
      await snappixBtn.click();

      const postBtn = page.getByText("Post to BAYFEED");
      try {
        await postBtn.first().waitFor({ state: "visible", timeout: 25000 });
      } catch {
        throw new Error('Unlayer Save button relabelled "Post to BAYFEED" never appeared (hosted runtime may not have loaded, or Snappix/photo editor is not implemented yet)');
      }

      const borders = page.getByText("Borders", { exact: true });
      if (await borders.first().isVisible().catch(() => false)) {
        await borders.first().click().catch(() => {});
      }

      try {
        await page.getByRole("button", { name: "Post to BAYFEED" }).click({ timeout: 10000 });
      } catch {
        throw new Error('could not click the "Post to BAYFEED" (Unlayer Save) button');
      }

      const bayfeed = page.locator(".bayfeed");
      await bayfeed.waitFor({ state: "visible", timeout: 8000 });
    });

    if (pageErrors.length) {
      failed = true;
      log(`\n✗ ${pageErrors.length} uncaught page error(s) were observed during the run:`);
      for (const e of pageErrors) log(`   - ${e}`);
    }
  } catch (err) {
    failed = true;
    log(`\nUnexpected failure outside the step framework: ${err && err.message ? err.message : err}`);
  } finally {
    if (page) await shot("zz-final-state").catch(() => {});
    if (browser) await browser.close().catch(() => {});
    stopDevServer(devServer);
  }

  // Summary ----------------------------------------------------------------
  log("\n=== Sundown Customs e2e flow: summary ===");
  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "-";
    log(`${icon} [${r.status.toUpperCase()}] ${r.name}${r.error ? ` — ${r.error}` : ""}`);
  }
  if (pageErrors.length) {
    log(`✗ [FAIL] page errors (${pageErrors.length})`);
  }
  log(`Screenshots saved to ${SHOT_DIR}`);

  process.exit(failed ? 1 : 0);
}

main();
