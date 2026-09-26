/**
 * Sundown Customs v3 — full playthrough with real input.
 *
 * Paints nothing by hand (uses a template livery via the dev hook), then:
 *  1. opens THE PLAN from the BAYPHONE and DRAWS a route on the real Unlayer
 *     canvas with the mouse (garage → east → north to the Causeway), circles a
 *     crate in yellow is skipped (colour pickers are vendor UI) — route only;
 *  2. locks the plan and checks the PLAN LOCKED screen picked the drawn drop;
 *  3. drives the resulting mission with an autopilot that only presses keys,
 *     handling Spray & Pray with a disguise kit if wanted;
 *  4. watches the news, HIJACKS the signal (draws on the live frame, GO LIVE),
 *     sends it to the billboards;
 *  5. visits INK & IRON, picks flash, inks it in the chair;
 *  6. opens Snappix and posts to BAYFEED.
 *
 *   node tests/e2e/v3-flow.mjs        (E2E_URL to reuse a server; E2E_MOBILE=1 for 390×844)
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const PORT = 5197;
const URL = process.env.E2E_URL || `http://127.0.0.1:${PORT}`;
const MOBILE = process.env.E2E_MOBILE === "1";
const OUT = `test-results/v3-flow${MOBILE ? "-mobile" : ""}`;
mkdirSync(OUT, { recursive: true });

let server = null;
async function waitUp(url) {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not start");
}
if (!process.env.E2E_URL) {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  await waitUp(URL);
}
let pw;
try {
  pw = await import("playwright");
  await pw.chromium.launch().then((b) => b.close());
} catch {
  pw = await import("/opt/homebrew/lib/node_modules/playwright/index.mjs");
}
const browser = await pw.chromium.launch({ args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
let n = 0;
const shot = (name) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` });
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message.split("\n")[0] });
    console.log(`✗ ${name}: ${e.message.split("\n")[0]}`);
    await shot(`FAIL-${name.replace(/\W+/g, "-")}`);
    throw e;
  }
}
const phase = () => page.evaluate(() => window.__sd?.phase?.());
async function waitPhase(p, timeout = 30000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if ((await phase()) === p) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`phase ${p} not reached (now ${await phase()})`);
}

/** Bounding box (page coords) of the image inside the Unlayer canvas. */
async function editorImageRect() {
  return page.evaluate(() => {
    const cs = [...document.querySelectorAll(".editor-mount canvas")];
    const c = cs.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const r = c.getBoundingClientRect();
    const tmp = document.createElement("canvas");
    tmp.width = c.width;
    tmp.height = c.height;
    const ctx = tmp.getContext("2d");
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const bg = [d[0], d[1], d[2]];
    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    for (let y = 0; y < c.height; y += 2)
      for (let x = 0; x < c.width; x += 2) {
        const i = (y * c.width + x) * 4;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    const sx = r.width / c.width, sy = r.height / c.height;
    return { x: r.x + minX * sx, y: r.y + minY * sy, w: (maxX - minX) * sx, h: (maxY - minY) * sy };
  });
}
async function drawPolyline(rect, imgW, imgH, pts) {
  const toPage = (p) => ({ x: rect.x + (p.px / imgW) * rect.w, y: rect.y + (p.py / imgH) * rect.h });
  const first = toPage(pts[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const a = toPage(pts[i - 1]), b = toPage(pts[i]);
    const steps = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let k = 1; k <= steps; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  }
  await page.mouse.up();
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const held = new Set();
async function hold(k, on) {
  if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); }
  else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); }
}
async function releaseAll() { for (const k of [...held]) await hold(k, false); }

try {
  await step("home → garage", async () => {
    await page.goto(URL);
    await page.waitForTimeout(1200);
    await shot("home");
    await page.getByRole("button", { name: /START THE JOB/ }).first().click();
    await page.waitForSelector(".garage-ui", { timeout: 20000 });
    await page.locator(".char-intro").click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const img = document.querySelector(".style-card img");
      const c = document.createElement("canvas");
      c.width = 1200; c.height = 600;
      c.getContext("2d").drawImage(img, 0, 0, 1200, 600);
      window.__sd.setSaved(c.toDataURL());
    });
    await page.waitForTimeout(800);
    await shot("garage-bayphone");
  });

  await step("THE PLAN: draw a route in Unlayer", async () => {
    await page.locator(".garage-jobs").getByText("THE PLAN", { exact: true }).click();
    await waitPhase("plan");
    await page.getByText("Lock the plan", { exact: true }).waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    await page.getByText("Route marker", { exact: true }).click();
    await page.waitForTimeout(800);
    await shot("plan-editor");
    const rect = await editorImageRect();
    const map = await page.evaluate(async () => {
      const c = await import("/src/city.ts");
      const P = (x, z) => c.worldToMap({ x, z });
      return { W: c.MAP.width, H: c.MAP.height, pts: [P(0, 50), P(150, 50), P(300, 50), P(300, -100), P(300, -250), P(300, -400), P(450, -400)] };
    });
    await drawPolyline(rect, map.W, map.H, map.pts);
    await page.waitForTimeout(800);
    await shot("plan-drawn");
    await page.getByRole("button", { name: "Lock the plan" }).click();
    await waitPhase("planLocked", 30000);
    await page.waitForTimeout(1500);
    await shot("plan-locked");
    const m = await page.evaluate(() => window.__sd.mission());
    console.log(`   plan → ${m.destination.name}, drawn ${(m.drawnShare * 100).toFixed(0)}%, cams ${m.camerasOnRoute.length}, fromDrawing ${m.fromDrawing}`);
    if (!m.fromDrawing) throw new Error("mission did not come from the drawing");
    if (m.destination.id !== "causeway") throw new Error(`expected CAUSEWAY LOT, got ${m.destination.name}`);
  });

  let outcome = "";
  await step("drive the drawn mission (autopilot, keys only)", async () => {
    await page.getByRole("button", { name: /START THE RUN/i }).click();
    await waitPhase("brief");
    await shot("brief");
    await page.getByRole("button", { name: /LET’S MAKE BAD DECISIONS/ }).click();
    await waitPhase("drive");
    await page.waitForTimeout(2400);
    const t0 = Date.now();
    let lastLog = 0, snaps = 0, resprays = 0;
    while (Date.now() - t0 < 300000) {
      const ph = await phase();
      if (ph === "result") break;
      if (ph === "respray") {
        await releaseAll();
        resprays++;
        await page.locator(".kit").first().waitFor({ timeout: 40000 });
        await page.waitForTimeout(1500);
        await shot(`respray-${resprays}`);
        await page.locator(".kit").first().click();
        await page.waitForTimeout(4000);
        await page.getByRole("button", { name: "Respray & go" }).click();
        await waitPhase("drive", 20000);
        continue;
      }
      const s = await page.evaluate(() => ({ t: window.__sd.telemetry(), r: window.__sd.mission().route }));
      const { t, r } = s;
      if (t.x === undefined) { await page.waitForTimeout(100); continue; }
      const target = r[Math.min(t.checkpoint + 1, r.length - 1)];
      const desired = Math.atan2(target.x - t.x, -(target.z - t.z));
      const err = wrap(desired - t.heading);
      await hold("d", err > 0.07);
      await hold("a", err < -0.07);
      const sharp = Math.abs(err) > 0.8;
      await hold("s", sharp && t.speed > 40);
      await hold("w", !(sharp && t.speed > 40));
      if (Date.now() - lastLog > 2500) {
        lastLog = Date.now();
        console.log(`   cp ${t.checkpoint}/${t.totalCheckpoints} @${t.x.toFixed(0)},${t.z.toFixed(0)} ${t.speed.toFixed(0)}km/h ★${t.stars} $${t.payout} ${t.turn ? t.turn.dir + " " + t.turn.distance + "m" : ""}`);
        if (snaps < 8) await shot(`drive-${++snaps}`);
      }
      await page.waitForTimeout(50);
    }
    await releaseAll();
    await waitPhase("result", 20000);
    await page.waitForTimeout(3500);
    await shot("result");
    outcome = await page.locator(".gta-splash strong").textContent();
    console.log(`   outcome: ${outcome}, resprays: ${resprays}`);
    if (!/MISSION PASSED/.test(outcome)) throw new Error(`run ended with ${outcome}`);
  });

  await step("news → HIJACK THE SIGNAL → GO LIVE", async () => {
    await page.getByRole("button", { name: /YOU MADE THE NEWS/ }).click();
    await waitPhase("news");
    await page.waitForTimeout(2500);
    await shot("news");
    await page.getByRole("button", { name: /HIJACK THE SIGNAL/ }).click();
    await waitPhase("hijack", 20000);
    await page.getByText("GO LIVE", { exact: true }).waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    await page.getByText("Deface", { exact: true }).click();
    await page.waitForTimeout(600);
    const rect = await editorImageRect();
    const scribble = Array.from({ length: 14 }, (_, i) => ({ px: 200 + i * 90, py: 300 + (i % 2) * 260 }));
    await drawPolyline(rect, 1600, 900, scribble);
    await page.waitForTimeout(800);
    await shot("hijack-editor");
    await page.getByRole("button", { name: "GO LIVE" }).click();
    await waitPhase("hijackAir", 20000);
    await page.waitForTimeout(1200);
    await shot("hijack-air-1");
    await page.waitForTimeout(3000);
    await shot("hijack-air-2");
    await page.getByRole("button", { name: /PUT IT ON EVERY BILLBOARD/ }).click();
    await waitPhase("garage", 10000);
  });

  await step("INK & IRON → flash → ink it", async () => {
    await page.waitForTimeout(800);
    await page.locator(".garage-jobs").getByText("INK & IRON", { exact: true }).click();
    await waitPhase("parlor");
    await page.waitForTimeout(1500);
    await shot("parlor");
    await page.getByRole("button", { name: /GET IN THE CHAIR/ }).click();
    await waitPhase("ink");
    await page.getByText("Ink it", { exact: true }).waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    await page.getByText("Needle", { exact: true }).click();
    await page.waitForTimeout(500);
    const rect = await editorImageRect();
    await drawPolyline(rect, 1200, 800, [{ px: 420, py: 340 }, { px: 520, py: 420 }, { px: 640, py: 330 }]);
    await page.waitForTimeout(600);
    await shot("ink-editor");
    await page.getByRole("button", { name: "Ink it" }).click();
    await waitPhase("garage", 20000);
    await page.waitForTimeout(1500);
    await shot("garage-after-ink");
  });

  await step("Snappix → BAYFEED", async () => {
    await page.evaluate(() => window.__sd.setPhase("photo"));
    await waitPhase("photo");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /CAPTURE THIS ANGLE/ }).click();
    await page.getByRole("button", { name: /OPEN IN SNAPPIX/ }).click();
    await waitPhase("editPhoto");
    await page.getByText("Post to BAYFEED", { exact: true }).waitFor({ timeout: 40000 });
    await page.waitForTimeout(1200);
    await page.getByText("Borders", { exact: true }).click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Post to BAYFEED" }).click();
    await page.locator(".bayfeed").waitFor({ timeout: 15000 });
    await page.waitForTimeout(3000);
    await shot("bayfeed");
  });
} catch {
  // reported below
} finally {
  await releaseAll().catch(() => {});
  const ok = results.every((r) => r.ok) && results.length === 6 && !errors.length;
  console.log(`\n${results.filter((r) => r.ok).length}/6 steps passed · page errors: ${errors.length ? errors.join(" | ") : "none"}`);
  await browser.close();
  server?.kill();
  process.exitCode = ok ? 0 : 1;
}
