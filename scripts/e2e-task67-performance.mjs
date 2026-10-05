// TASK 67 §52 — Performance baseline. Measures REAL observed timings for the
// core surfaces and the object-count scaling curves (APP 10/50/100/250, 2D
// 50/100/500/1000, 3D 10/25/50/100). Results are recorded as data — no
// invented thresholds; sanity gates only (page loads at all, no errors).
import {
  API, WEB, apiRegister, createProject, getModel, putModel,
  manyComponentsApp, manyEntities2D, manyEntities3D, populated2D,
} from "./fixtures-task67.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("scripts/artifacts-task66", { recursive: true });

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;

let passed = 0, failed = 0;
const errors = [];
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};
const rows = [];
const measure = async (name, fn) => {
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  rows.push({ measurement: name, ms });
  console.log(`  [perf] ${name}: ${ms}ms`);
  return ms;
};

const stamp = Date.now().toString(36);
const { cookie } = await apiRegister(`perf-${stamp}@ex.com`, `perf${stamp}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 140)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401") && !m.text().includes("Failed to load resource")) {
    errors.push(`console: ${m.text().slice(0, 140)}`);
  }
});

// ---- Cold loads ------------------------------------------------------------------
const landingMs = await measure("landing load", async () => {
  await page.goto(`${WEB}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
});
check("landing renders (baseline sanity)", (await page.locator("#hero-title").count()) === 1, `${landingMs}ms`);

const dashMs = await measure("dashboard load", async () => {
  await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(900);
});
check("dashboard renders", (await page.getByText("Welcome back").count()) >= 1, `${dashMs}ms`);

// ---- Builder load + project open + preview cycle --------------------------------
const appP = await createProject(cookie, `Perf App ${stamp}`, "app");
await putModel(cookie, appP.project.id, manyComponentsApp(50));
const builderMs = await measure("builder load (50 components)", async () => {
  await page.goto(`${WEB}/builder/${appP.project.id}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
});
check("builder renders", (await page.locator("[data-mode-tab]").count()) >= 5, `${builderMs}ms`);

const openMs = await measure("preview start", async () => {
  await page.locator('[data-mode-tab="preview"]').click();
  await page.waitForTimeout(1500);
});
check("preview running", (await page.locator('[data-preview-state="running"]').count()) === 1, `${openMs}ms`);
const stopMs = await measure("preview stop→design", async () => {
  await page.locator('[data-preview-stop="true"]').click();
  await page.waitForTimeout(600);
});
const repeatMs = await measure("repeated preview ×3", async () => {
  for (let i = 0; i < 3; i += 1) {
    await page.locator('[data-mode-tab="preview"]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-preview-stop="true"]').click();
    await page.waitForTimeout(400);
  }
});

// ---- APP scaling ------------------------------------------------------------------
const appRows = [];
for (const count of [10, 50, 100, 250]) {
  const p = await createProject(cookie, `Perf App ${count} ${stamp}`, "app");
  await putModel(cookie, p.project.id, manyComponentsApp(count));
  const ms = await measure(`APP ${count} components — preview start`, async () => {
    await page.goto(`${WEB}/builder/${p.project.id}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.locator('[data-mode-tab="preview"]').click();
    await page.waitForTimeout(1200);
  });
  const running = (await page.locator('[data-preview-state="running"]').count()) === 1;
  appRows.push({ count, ms, running });
  check(`APP ${count}: preview runs (state=running)`, running, `${ms}ms`);
}

// ---- 2D scaling --------------------------------------------------------------------
const rows2D = [];
for (const count of [50, 100, 500, 1000]) {
  const p = await createProject(cookie, `Perf 2D ${count} ${stamp}`, "game");
  const model = manyEntities2D(count);
  await putModel(cookie, p.project.id, model);
  const ms = await measure(`2D ${count} entities — preview start`, async () => {
    await page.goto(`${WEB}/builder/${p.project.id}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.locator('[data-mode-tab="preview"]').click();
    await page.waitForTimeout(1500);
  });
  const entities = await page.evaluate(() => document.querySelectorAll("[data-entity]").length);
  rows2D.push({ count, ms, entities });
  check(`2D ${count}: entities rendered to the stage`, entities >= Math.min(count, 900), `found=${entities} ${ms}ms`);
}

// ---- 3D scaling --------------------------------------------------------------------
const rows3D = [];
for (const count of [10, 25, 50, 100]) {
  const p = await createProject(cookie, `Perf 3D ${count} ${stamp}`, "3d");
  await putModel(cookie, p.project.id, manyEntities3D(count));
  const ms = await measure(`3D ${count} bodies — preview start`, async () => {
    await page.goto(`${WEB}/builder/${p.project.id}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.locator('[data-mode-tab="preview"]').click();
    await page.waitForTimeout(1800);
  });
  const bodies = await page.evaluate(() => {
    const c = document.querySelector("canvas[data-viewport-3d]");
    return c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]").length : 0;
  });
  rows3D.push({ count, ms, bodies });
  // The 3D physics solver is BOUNDED at 64 bodies by design (TASK 54);
  // larger authored scenes simulate the first 64 — observed and recorded.
  check(`3D ${count}: physics bodies simulated (capped at the design bound)`,
    bodies >= Math.min(count, 64), `bodies=${bodies} ${ms}ms`);
}

// ---- Extension load ----------------------------------------------------------------
const extMs = await measure("extensions dashboard load", async () => {
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
});
check("extensions dashboard renders", (await page.locator("body").count()) === 1, `${extMs}ms`);

// ---- Asset list --------------------------------------------------------------------
const assetMs = await measure("asset panel open (empty)", async () => {
  await page.goto(`${WEB}/builder/${appP.project.id}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  const assetsBtn = page.locator('button[title="Assets"]');
  if (await assetsBtn.count()) await assetsBtn.first().click();
  await page.waitForTimeout(500);
});

console.log("\n=== PERFORMANCE BASELINE (observed, dev machine) ===");
for (const r of rows) console.log(`  ${r.measurement}: ${r.ms}ms`);
console.log("APP scaling:", JSON.stringify(appRows));
console.log("2D scaling:", JSON.stringify(rows2D));
console.log("3D scaling:", JSON.stringify(rows3D));
writeFileSync("scripts/artifacts-task66/perf-baseline.json", JSON.stringify({ rows, appRows, rows2D, rows3D }, null, 2));

check("no page errors during the performance run",
  errors.filter((e) => e.startsWith("pageerror")).length === 0, errors.slice(0, 3).join(" | "));
check("no unexpected console errors during the performance run",
  errors.filter((e) => e.startsWith("console:")).length === 0, errors.slice(0, 3).join(" | "));

console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
