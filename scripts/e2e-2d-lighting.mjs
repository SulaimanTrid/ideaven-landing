// 2D lighting (SYSTEM 5) E2E: ambient + point lights are real compositing
// passes over the world container — verified by computed styles and geometry
// (darkness opacity, gradient size/position/blend), camera tracking,
// enable/disable, clamping, diagnostics, persistence, undo/redo, published
// and export parity.
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
const cookie = await apiRegister(`light-${stamp}@ex.com`, `light${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Light Lab", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the coin-runner template`);

// ---- Setup: ambient + point light + camera + tilemap cell ----------------------
{
  const model = await getModel(cookie, project.id);
  const play = model.screens.find((s) => s.id === "screen-play");
  play.styles = { ...(play.styles ?? {}), background: "#0c0f17", ambientColor: "#000010", ambientIntensity: 0.25 };
  play.components.push({
    id: "e-light", type: "light",
    props: { name: "Lamp", x: 150, y: 300, width: 48, height: 48, enabled: true, color: "#ffb454", intensity: 1, radius: 140, visible: true },
  });
  play.components.push({
    id: "e-cam", type: "camera",
    props: { name: "Camera", x: 0, y: 356, width: 390, height: 844, followEnabled: true, followTarget: "p-player", smoothing: 0.2, boundsEnabled: true, minX: 0, minY: 0, maxX: 2000, maxY: 1200 },
  });
  play.components.push({
    id: "e-tiles", type: "tilemap",
    props: { name: "Tiles", x: 0, y: 620, width: 390, height: 224, cellSize: 32, cols: 12, rows: 7, tiles: "3,3:1;4,3:1", palette: "1:#2a3348;2:#8f7bff", color: "#2a3348", visible: true, collider: true, layer: "solid" },
  });
  await putModel(cookie, project.id, model);
  const round = await getModel(cookie, project.id);
  const play2 = round.screens.find((s) => s.id === "screen-play");
  check("light entity + ambient persist in the canonical model",
    play2.components.some((c) => c.type === "light" && c.props.color === "#ffb454") &&
    play2.styles.ambientIntensity === 0.25);
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
check("light gizmo ring renders on the design canvas",
  (await page.locator('[data-light-gizmo="true"]').count()) === 1);
await page.getByRole("treeitem").filter({ hasText: /Lamp/ }).first().click();
await page.waitForTimeout(500);
const intensityField = page.getByLabel("Intensity (0–5)");
check("light inspector exposes Intensity + Radius fields",
  (await intensityField.count()) === 1 && (await page.getByLabel("Radius").count()) === 1);

// Undo/redo of an intensity edit through the existing history.
await intensityField.fill("0.5");
await page.keyboard.press("Tab");
await waitForSaved(page);
let model = await getModel(cookie, project.id);
let light = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "e-light");
check("intensity edit commits to the canonical model", light.props.intensity === 0.5, `intensity=${light.props.intensity}`);
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
light = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "e-light");
check("undo reverts the intensity", light.props.intensity === 1, `intensity=${light.props.intensity}`);
await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
light = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "e-light");
check("redo re-applies the intensity", light.props.intensity === 0.5, `intensity=${light.props.intensity}`);

// ---- 2. Preview: real compositing pass ------------------------------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /PLAY/ }).click();
const lightLayer = page.locator('[data-light-layer="true"]');
await lightLayer.waitFor({ state: "visible", timeout: 8000 });
check("lighting layer composites over the world", (await lightLayer.count()) === 1);

const ambientOpacity = await page.locator('[data-light-ambient="true"]').evaluate((el) => Number(getComputedStyle(el).opacity));
check("ambient intensity 0.25 → darkness veil opacity 0.75", Math.abs(ambientOpacity - 0.75) < 0.01, `opacity=${ambientOpacity}`);

const point = page.locator('[data-light-point="e-light"]');
check("point light gradient renders at 2×radius (280px)",
  (await point.count()) === 1 && (await point.evaluate((el) => getComputedStyle(el).width)) === "280px",
  (await point.count()) === 1 ? await point.evaluate((el) => getComputedStyle(el).width) : "missing");
const pointBg = await point.evaluate((el) => getComputedStyle(el).backgroundImage + "|" + getComputedStyle(el).mixBlendMode);
check("point light uses its color with screen blending",
  pointBg.includes("radial-gradient") && pointBg.includes("255, 180, 84") && pointBg.includes("screen"), pointBg);

// ---- 3. Camera integration: the layer tracks the moving camera ------------------
const layerLeftBefore = await lightLayer.evaluate((el) => Number.parseFloat(el.style.left));
// The world is 2000 wide and the camera pins to min X while the player is
// near it — walk long enough for the camera to actually travel.
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(2200);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(800);
const layerLeftAfter = await lightLayer.evaluate((el) => Number.parseFloat(el.style.left));
check("lighting layer tracks the moving camera (world-anchored lights)",
  Number.isFinite(layerLeftBefore) && Math.abs(layerLeftAfter - layerLeftBefore) > 40,
  `left ${layerLeftBefore} → ${layerLeftAfter}`);

// ---- 4. Enable/disable removes the gradient -------------------------------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
{
  const m = await getModel(cookie, project.id);
  const play = m.screens.find((s) => s.id === "screen-play");
  play.components.find((c) => c.id === "e-light").props.enabled = false;
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /PLAY/ }).click();
await lightLayer.waitFor({ state: "visible", timeout: 8000 });
check("disabled light contributes no gradient", (await page.locator('[data-light-point="e-light"]').count()) === 0);
check("ambient veil still applies with the light disabled",
  Math.abs(await page.locator('[data-light-ambient="true"]').evaluate((el) => Number(getComputedStyle(el).opacity)) - 0.75) < 0.01);

// ---- 5. Tilemap + HUD semantics -------------------------------------------------
check("tilemap renders inside the lit world (same layer)",
  (await page.locator('[data-camera-world] [data-cell]').count()) >= 1);
const hudUnlit = await page.evaluate(() => {
  const world = document.querySelector('[data-camera-world]');
  // The trace toggle is preview chrome (screen-space): it must live OUTSIDE
  // the lit world container.
  const chrome = Array.from(document.querySelectorAll("button")).find((b) => /Runtime trace/.test(b.textContent ?? ""));
  return Boolean(world) && Boolean(chrome) && !world.contains(chrome);
});
check("preview chrome (HUD) lives outside the lit world container (unlit)", hudUnlit);

// ---- 6. Clamping + diagnostics ---------------------------------------------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
{
  const m = await getModel(cookie, project.id);
  const play = m.screens.find((s) => s.id === "screen-play");
  const lightProps = play.components.find((c) => c.id === "e-light").props;
  lightProps.enabled = true;
  lightProps.intensity = 99;
  lightProps.radius = -50;
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /PLAY/ }).click();
await lightLayer.waitFor({ state: "visible", timeout: 8000 });
const clampedOpacity = await page.locator('[data-light-point="e-light"]').evaluate((el) => Number(getComputedStyle(el).opacity));
const clampedWidth = await page.locator('[data-light-point="e-light"]').evaluate((el) => Number.parseFloat(getComputedStyle(el).width));
check("out-of-range intensity/radius clamp safely (opacity ≤ 1, radius ≥ 8)",
  clampedOpacity <= 1 && clampedWidth >= 16, `opacity=${clampedOpacity} width=${clampedWidth}`);
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);check("out-of-range light values raise diagnostics",
  (await page.getByText(/outside 0–5/).count()) >= 1 && (await page.getByText(/outside 8–2000/).count()) >= 1);

// ---- 7. Published + export parity -------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /PLAY/ }).first().click().catch(() => null);
  await page.waitForTimeout(1200);
  check("published page composites the same lighting layer",
    (await page.locator('[data-light-layer="true"]').count()) === 1 &&
    (await page.locator('[data-light-point="e-light"]').count()) === 1);
}
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export ships the lighting engine (layer + ambient + point parse)",
    html.includes("data-light-layer") && html.includes("ambientOf") && html.includes("data-light-point"));
}

// ---- Report -----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
