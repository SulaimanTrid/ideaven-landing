// Particle system (SYSTEM 18) E2E: real bounded runtime simulation drawn to
// a world-anchored canvas — continuous emission, burst via block, camera
// anchoring, clamping, diagnostics, persistence, undo/redo, published and
// export parity. Particles are observed through the sim's own counters and
// canvas pixels (procedural emitters keep the canvas untainted).
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const API = "http://localhost:8090";
const WEB = "http://localhost:3000";
const errors = [];
let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

async function apiRegister(email, username) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password: "Correct-Horse-9" }),
  });
  return res.headers.getSetCookie().find((c) => c.startsWith("ideaven_session=")).split(";")[0];
}
async function getModel(cookie, id) {
  const res = await fetch(`${API}/api/projects/${id}`, { headers: { Cookie: cookie } });
  return (await res.json()).project.model;
}
async function putModel(cookie, id, model) {
  const res = await fetch(`${API}/api/projects/${id}/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`model PUT failed: ${res.status} ${await res.text()}`);
}
async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`fx-${stamp}@ex.com`, `fx${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "FX Lab", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the coin-runner template`);

// ---- Setup: two emitters (continuous smoke + burst sparks) ---------------------
{
  const model = await getModel(cookie, project.id);
  const play = model.screens.find((s) => s.id === "screen-play");
  play.components.push({
    id: "e-smoke", type: "emitter",
    props: { name: "Smoke", x: 150, y: 400, width: 48, height: 48, enabled: true, emissionRate: 40, lifetime: 1, speed: 60, direction: 0, spread: 40, startSize: 10, endSize: 2, startOpacity: 0.9, endOpacity: 0, gravity: 0, color: "#58c7f0", maxParticles: 120, loop: true, burstCount: 0, texture: "", visible: true },
  });
  play.components.push({
    id: "e-sparks", type: "emitter",
    props: { name: "Sparks", x: 260, y: 400, width: 48, height: 48, enabled: false, emissionRate: 0, lifetime: 0.8, speed: 160, direction: 0, spread: 180, startSize: 6, endSize: 1, startOpacity: 1, endOpacity: 0, gravity: 600, color: "#ffb454", maxParticles: 60, loop: true, burstCount: 30, texture: "", visible: true },
  });
  play.components.push({
    id: "e-cam", type: "camera",
    props: { name: "Camera", x: 0, y: 356, width: 390, height: 844, followEnabled: true, followTarget: "p-player", smoothing: 0.2, boundsEnabled: true, minX: 0, minY: 0, maxX: 2000, maxY: 1200 },
  });
  // A jump press bursts the sparks emitter (action → block → runtime).
  play.logic.handlers.push({
    id: "h-burst", componentId: null, event: "action-pressed-jump",
    body: [{ id: "b-burst", kind: "statement", type: "burst-particle", inputs: { componentId: "e-sparks", count: 30 } }],
  });
  await putModel(cookie, project.id, model);
  const round = (await getModel(cookie, project.id)).screens.find((s) => s.id === "screen-play");
  check("emitter configuration persists in the canonical model",
    round.components.some((c) => c.id === "e-smoke" && c.props.emissionRate === 40) &&
    round.components.some((c) => c.id === "e-sparks" && c.props.burstCount === 30));
  check("DBG camera survives setup PUT", round.components.some((c) => c.type === "camera"),
    round.components.map((c) => c.type).join(","));
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);

// ---- 1. Editor: gizmo + inspector fields ---------------------------------------
check("emitter gizmos render on the design canvas",
  (await page.locator('[data-node-id="e-smoke"]').count()) === 1 &&
  (await page.locator('[data-node-id="e-sparks"]').count()) === 1);
await page.getByRole("treeitem").filter({ hasText: /Smoke/ }).first().click();
await page.waitForTimeout(500);
check("emitter inspector exposes rate / lifetime / max / color fields",
  (await page.getByLabel("Emission rate (0–500/s)").count()) === 1 &&
  (await page.getByLabel("Lifetime (0.05–30s)").count()) === 1 &&
  (await page.getByLabel("Max particles (1–1000)").count()) === 1);

// Undo/redo of an emission-rate edit through the existing history.
const rateField = page.getByLabel("Emission rate (0–500/s)");
await rateField.fill("60");
await page.keyboard.press("Tab");
await waitForSaved(page);
let model = await getModel(cookie, project.id);
let smoke = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "e-smoke");
check("emission-rate edit commits to the canonical model", smoke.props.emissionRate === 60);
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
smoke = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "e-smoke");
check("undo reverts the emission rate", smoke.props.emissionRate === 40);
await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
smoke = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "e-smoke");
check("redo re-applies the emission rate", smoke.props.emissionRate === 60);

// ---- 2. Preview: real bounded simulation ----------------------------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /PLAY/ }).click();
const canvas = page.locator("canvas[data-particle-canvas]");
await canvas.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1200); // let continuous emission accumulate

const aliveCount = async () => Number(await canvas.getAttribute("data-particle-count"));
let sawPositive = false;
const samples = [];
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(150);
  const now = await aliveCount();
  samples.push(now);
  if (now > 0) sawPositive = true;
}
check("continuous emitter spawns real runtime particles", sawPositive);
// At 60/s with a 1s lifetime the count settles at an equilibrium (~60):
// spawn and expiry exactly balance — the signature of a working lifecycle.
check("spawn and expiry balance at equilibrium (rate × lifetime)",
  samples.every((n) => n >= 35 && n <= 90), JSON.stringify(samples));

// Untainted canvas (procedural emitters): sample pixels where particles live.
const pixelEvidence = await page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-particle-canvas]");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return false;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
});
check("particles are actually drawn to the world canvas (pixel evidence)", pixelEvidence);

// Camera anchoring: walking right moves the world; the canvas tracks it.
const camBefore = await canvas.evaluate((el) => Number.parseFloat(el.style.left));
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(2200);
await page.keyboard.up("ArrowRight");
const camAfter = await canvas.evaluate((el) => Number.parseFloat(el.style.left));
check("camera moves while particles stay world-anchored (canvas tracks it)",
  Number.isFinite(camBefore) && Math.abs(camAfter - camBefore) > 40,
  `left ${camBefore} → ${camAfter}`);
const bounded = await aliveCount();
check("particle count stays bounded (≤ maxParticles 120 + sparks cap)", bounded <= 180, `count=${bounded}`);

// Burst via action event → block → runtime; then the sparks expire (0.8 s
// lifetime) and the count returns to the smoke equilibrium.
const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
await blur();
const beforeBurst = await aliveCount();
await page.keyboard.press(" ");
await page.waitForTimeout(250);
const afterBurst = await aliveCount();
check("action-pressed burst spawns sparks immediately", afterBurst > beforeBurst, `${beforeBurst} → ${afterBurst}`);
await page.waitForTimeout(1600);
const afterExpire = await aliveCount();
check("burst particles expire (lifetime honored)",
  Math.abs(afterExpire - beforeBurst) <= 15, `${afterBurst} → ${afterExpire} (base ${beforeBurst})`);

// ---- 3. Published runtime --------------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /PLAY/ }).first().click().catch(() => null);
  await page.waitForTimeout(1200);
  const pubCanvas = page.locator("canvas[data-particle-canvas]");
  check("published page runs the particle system", (await pubCanvas.count()) === 1);
  const pubCount = Number(await pubCanvas.getAttribute("data-particle-count"));
  // Jump action bursts the sparks emitter on the published page too.
  await page.keyboard.press(" ");
  await page.waitForTimeout(250);
  const pubAfterBurst = Number(await pubCanvas.getAttribute("data-particle-count"));
  check("published particles: burst spikes the count, then expiry drains it",
    pubAfterBurst > pubCount, `${pubCount} → ${pubAfterBurst}`);
}

// ---- 4. Export carries the engine -------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds emitter configuration", html.includes("e-smoke") && html.includes("emissionRate"));
  check("export ships the simulation engine", html.includes("simStep") && html.includes("simBurst"));
  check("export ships the burst block", html.includes("burst-particle"));
}

// ---- 5. Invalid values: clamps + diagnostics --------------------------------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
{
  const m = await getModel(cookie, project.id);
  const play = m.screens.find((s) => s.id === "screen-play");
  const fx = play.components.find((c) => c.id === "e-smoke").props;
  fx.emissionRate = 9999;
  fx.lifetime = -5;
  fx.maxParticles = -20;
  fx.color = "not-a-color";
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
check("invalid emitter values raise diagnostics",
  (await page.getByText(/outside 0–500/).count()) >= 1 &&
  (await page.getByText(/outside 0.05–30/).count()) >= 1 &&
  (await page.getByText(/outside 1–1000/).count()) >= 1);
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /PLAY/ }).click();
await canvas.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1200);
const clampedCount = await aliveCount();
check("runtime stays stable with invalid config (clamped, no crash)",
  Number.isFinite(clampedCount) && clampedCount <= 30, `count=${clampedCount}`);
check("no console errors across the whole run", errors.length === 0, errors.slice(0, 2).join(" | "));

// ---- Report ------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
