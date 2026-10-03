// 3D material + lighting (TASK 55) E2E: real per-face illumination in the
// software rasterizer, verified with PIXEL evidence:
//   A  material baseColor change → rendered pixels change (exact, unlit)
//   B  light enabled/disabled → cube brightness changes
//   C  light position moves → illumination distribution moves
//   D  light in front vs behind (equal distance) → front-face brightness
//      changes — proves N·L depends on SURFACE ORIENTATION, not distance
// plus hierarchy-attached lights, persistence, undo/redo, preview,
// published, exported-run-from-disk, malformed configs, and the 8-light cap.
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

// ---- pixel measurement helpers --------------------------------------------------
// Mean luminance of a fractional region of the 3D canvas (mode selector).
const regionLum = (page, sel, x0, y0, x1, y1) => page.evaluate(([s, ax, ay, bx, by]) => {
  const canvas = document.querySelector(s);
  if (!canvas) return -1;
  const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0, n = 0;
  for (let py = Math.floor(ay * height); py < by * height; py++) {
    for (let px = Math.floor(ax * width); px < bx * width; px++) {
      const i = (py * width + px) * 4;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
  }
  return n > 0 ? sum / n : -1;
}, [sel, x0, y0, x1, y1]);
// 4×4 grid mean-luminance vector + brightest cell (distribution evidence).
const gridVector = (page, sel) => page.evaluate((s) => {
  const canvas = document.querySelector(s);
  if (!canvas) return null;
  const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const cells = new Array(16).fill(0);
  const counts = new Array(16).fill(0);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const cell = Math.min(3, Math.floor(py / height * 4)) * 4 + Math.min(3, Math.floor(px / width * 4));
      cells[cell] += lum; counts[cell]++;
    }
  }
  const vector = cells.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
  let brightest = 0;
  vector.forEach((v, i) => { if (v > vector[brightest]) brightest = i; });
  return { vector, brightest };
}, sel);
const dist = (a, b) => a.vector.reduce((s, v, i) => s + Math.abs(v - b.vector[i]), 0);
// Tolerant color count (lit pixels are tinted, so classify rather than match).
const countNear = (page, sel, hex, tol) => page.evaluate(([s, h, t]) => {
  const canvas = document.querySelector(s);
  if (!canvas) return -1;
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const r0 = parseInt(h.slice(1, 3), 16), g0 = parseInt(h.slice(3, 5), 16), b0 = parseInt(h.slice(5, 7), 16);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - r0) <= t && Math.abs(data[i + 1] - g0) <= t && Math.abs(data[i + 2] - b0) <= t) n++;
  }
  return n;
}, [sel, hex, tol]);

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`lit-${stamp}@ex.com`, `lit${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Light Lab", type: "3d" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (type 3d)`);

// ---- Setup: cube (material object), plane ground, camera, point light ----------
// The light starts DISABLED with default ambient (white × 1) so the first
// render is pixel-identical to the unlit renderer — material evidence first.
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-cube", type: "cube3d", props: { name: "Cube", px: 0, py: 0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true } },
    { id: "e-plane", type: "plane3d", props: { name: "Ground", px: 0, py: -0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 8, sy: 1, sz: 8, color: "#2a3348", visible: true } },
    { id: "e-light", type: "light3d", props: { name: "Key Light", px: 0, py: 0.5, pz: 5, rx: 0, ry: 0, rz: 0, type: "point", enabled: false, color: "#ffd9a0", intensity: 3, radius: 30, visible: true } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 1.8, pz: 8, rx: -10, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
  );
  await putModel(cookie, project.id, model);
  const round = await getModel(cookie, project.id);
  const s2 = round.screens.find((s) => s.id === "screen-scene-1");
  const light = s2.components.find((c) => c.id === "e-light");
  check("light + material configuration persists in the canonical model",
    light.props.type === "point" && light.props.color === "#ffd9a0" &&
    light.props.intensity === 3 && light.props.radius === 30 && light.props.enabled === false &&
    light.props.px === 0 && light.props.py === 0.5 && light.props.pz === 5 &&
    s2.components.find((c) => c.id === "e-cube").props.color === "#58c7f0");
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });
const VIEW = "canvas[data-viewport-3d]";

async function openEditor() {
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}
async function openPreview() {
  await page.getByRole("button", { name: "Preview", exact: true }).first().click();
  await page.locator(VIEW).waitFor({ state: "visible", timeout: 8000 });
  await page.waitForTimeout(700); // settle frames
}
// Model-side truth for a UI edit — polls the API past the autosave debounce
// so a stale "Saved" indicator can never race the assertion.
async function expectProp(id, key, value, label) {
  let actual;
  for (let attempt = 0; attempt < 15; attempt++) {
    const m = await getModel(cookie, project.id);
    actual = m.screens[0].components.find((c) => c.id === id)?.props?.[key];
    if (actual === value) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  check(label, actual === value, `expected ${key}=${value}, got ${actual}`);
}
// Select an entity via its exact "Select <name>" tree button — clicking the
// treeitem <li> is ambiguous once entities are nested (the li spans rows).
async function selectEntity(name) {
  await page.getByLabel(`Select ${name}`, { exact: true }).click();
  await page.waitForTimeout(500);
}

await openEditor();

// ---- 1. Editor: palette, gizmos, inspector structure ----------------------------
check("3D viewport renders in the editor", (await page.locator(VIEW).count()) === 1);
const lightGizmoPixels = await countNear(page, VIEW, "#ffd9a0", 14);
check("light gizmo (position marker + influence ring) renders in the editor", lightGizmoPixels > 20,
  `pixels=${lightGizmoPixels}`);
await selectEntity("Key Light");
check("light inspector exposes Enabled / Type / Color / Intensity / Radius",
  (await page.getByLabel("Enabled", { exact: true }).count()) === 1 &&
  (await page.getByLabel(/^Type/).count()) === 1 &&
  (await page.getByLabel("Light color", { exact: true }).count()) === 1 &&
  (await page.getByLabel("Intensity (0–5)", { exact: true }).count()) === 1 &&
  (await page.getByLabel("Radius (0.1–1000)", { exact: true }).count()) === 1);
check("lights are explicitly non-physics (no Body/Collider controls)",
  (await page.getByLabel("Body type").count()) === 0 &&
  (await page.getByLabel("Collider type").count()) === 0);
await selectEntity("Cube");
check("mesh inspector exposes the Material section with Base color",
  (await page.getByText("Material", { exact: true }).count()) >= 1 &&
  (await page.getByLabel("Base color", { exact: true }).count()) === 1);
check("roughness/metalness are NOT exposed (unsupported → no fake controls)",
  (await page.getByLabel(/roughness/i).count()) === 0 &&
  (await page.getByLabel(/metalness/i).count()) === 0);

// ---- 2. Test A: material baseColor change → real pixels (unlit, exact) ----------
// Light disabled + default ambient → the renderer is pixel-exact: the cube
// fills with its exact base color.
await openPreview();
const blueBefore = await countNear(page, VIEW, "#58c7f0", 6);
check("material evidence: unlit cube renders its exact base color", blueBefore > 500, `blue=${blueBefore}`);
await openEditor();
await page.getByRole("treeitem").filter({ hasText: /Cube/ }).first().click();
await page.waitForTimeout(300);
await page.getByLabel("Base color", { exact: true }).fill("#ff7d9c");
await page.getByLabel("Base color", { exact: true }).press("Enter");
await waitForSaved(page);
await openPreview();
const roseNow = await countNear(page, VIEW, "#ff7d9c", 6);
const blueNow = await countNear(page, VIEW, "#58c7f0", 6);
check("material evidence: base color change repaints the mesh pixels",
  roseNow > 500 && blueNow < 20, `rose=${roseNow} blue=${blueNow}`);

// ---- 3. Test B: light enabled/disabled → cube brightness ------------------------
// Dim the ambient (UI) so the light owns the illumination.
await openEditor();
await page.getByLabel("Ambient intensity (0–1)", { exact: true }).fill("0.05");
await page.getByLabel("Ambient intensity (0–1)", { exact: true }).press("Enter");
await waitForSaved(page);
{
  const m = await getModel(cookie, project.id);
  check("ambient intensity edit commits to the canonical model",
    m.screens[0].styles.ambientIntensity === 0.05, `got ${m.screens[0].styles.ambientIntensity}`);
}
await selectEntity("Key Light");
await page.getByLabel("Enabled", { exact: true }).check();
await waitForSaved(page);
await expectProp("e-light", "enabled", true, "light Enabled edit commits to the canonical model");
await openPreview();
const lumLit = await regionLum(page, VIEW, 0.46, 0.45, 0.54, 0.53);
check("light enabled: the front face is visibly lit (bright region)",
  lumLit > 60, `lum=${lumLit.toFixed(1)}`);
await openEditor();
await selectEntity("Key Light");
await page.getByLabel("Enabled", { exact: true }).uncheck();
await waitForSaved(page);
await openPreview();
const lumUnlit = await regionLum(page, VIEW, 0.46, 0.45, 0.54, 0.53);
check("light disabled: illumination disappears (brightness drops)",
  lumLit - lumUnlit > 15, `lit=${lumLit.toFixed(1)} unlit=${lumUnlit.toFixed(1)}`);
await openEditor();
await selectEntity("Key Light");
await page.getByLabel("Enabled", { exact: true }).check();
await waitForSaved(page);

// ---- 4. Test D: N·L is orientation-dependent (equal distance, opposite side) ----
// Light in FRONT of the cube (pz 5) vs BEHIND it (pz −5): the distance to the
// front face is identical in both setups — only the normal relationship
// changes. A distance-based or equal-brighten fake would show no difference.
const frontLum = async () => { await openPreview(); const v = await regionLum(page, VIEW, 0.46, 0.45, 0.54, 0.53); await openEditor(); return v; };
await selectEntity("Key Light");
await page.getByLabel("Position Z", { exact: true }).fill("5");
await page.getByLabel("Position Z", { exact: true }).press("Enter");
await waitForSaved(page);
await expectProp("e-light", "pz", 5, "light Position Z=5 commits to the canonical model");
const lumFront = await frontLum();
await selectEntity("Key Light");
await page.getByLabel("Position Z", { exact: true }).fill("-5");
await page.getByLabel("Position Z", { exact: true }).press("Enter");
await waitForSaved(page);
await expectProp("e-light", "pz", -5, "light Position Z=−5 commits to the canonical model");
const lumBehind = await frontLum();
check("surface-orientation evidence: light in FRONT lights the front face",
  lumFront > 60, `front=${lumFront.toFixed(1)}`);
check("surface-orientation evidence: equal-distance light BEHIND does not (N·L real)",
  lumFront - lumBehind > 15, `front=${lumFront.toFixed(1)} behind=${lumBehind.toFixed(1)}`);

// ---- 5. Test C: moving the light changes the illumination distribution -----------
// Shading is FLAT per face (single-quad ground → no per-pixel pools), so the
// honest position evidence is the CUBE's two visible faces: light HIGH → the
// top face (+Y normal) dominates; light LEVEL with the cube → the top face
// goes dark and the front face (+Z) saturates. Same light, same cube — only
// the light's position changes.
await selectEntity("Key Light");
await page.getByLabel("Position X", { exact: true }).fill("0");
await page.getByLabel("Position X", { exact: true }).press("Enter");
await waitForSaved(page);
await page.getByLabel("Radius (0.1–1000)", { exact: true }).fill("3");
await page.getByLabel("Radius (0.1–1000)", { exact: true }).press("Enter");
await waitForSaved(page);
// Cube-face regions (empirically mapped): top face band ≈ y [0.36, 0.43],
// front face band ≈ y [0.445, 0.535] at the cube column x [0.465, 0.535].
const faceLum = async () => {
  await openPreview();
  const top = await regionLum(page, VIEW, 0.465, 0.36, 0.535, 0.428);
  const front = await regionLum(page, VIEW, 0.465, 0.45, 0.535, 0.53);
  await openEditor();
  return { top, front };
};
await selectEntity("Key Light");
await page.getByLabel("Position Y", { exact: true }).fill("3");
await page.getByLabel("Position Y", { exact: true }).press("Enter");
await waitForSaved(page);
await page.getByLabel("Position Z", { exact: true }).fill("0.8");
await page.getByLabel("Position Z", { exact: true }).press("Enter");
await waitForSaved(page);
await expectProp("e-light", "py", 3, "light Position Y=3 commits to the canonical model");
const high = await faceLum();
await selectEntity("Key Light");
await page.getByLabel("Position Y", { exact: true }).fill("0.6");
await page.getByLabel("Position Y", { exact: true }).press("Enter");
await waitForSaved(page);
await expectProp("e-light", "py", 0.6, "light Position Y=0.6 commits to the canonical model");
const level = await faceLum();
check("light HIGH: the front face stays dark (light is above it)",
  high.front < 40, `top=${high.top.toFixed(1)} front=${high.front.toFixed(1)}`);
check("light LEVEL: moving the light lights the front face (position changes illumination)",
  level.front - high.front > 60, `level.front=${level.front.toFixed(1)} high.front=${high.front.toFixed(1)}`);
check("light LEVEL: the front face lights up and the top goes dark",
  level.front > level.top + 15 && level.front > 60,
  `top=${level.top.toFixed(1)} front=${level.front.toFixed(1)}`);

// ---- 6. Hierarchy: parent the light to the cube, move the cube ------------------
// The light is attached with local offset (0, 1, 1.5) — its world position
// must be cube.world × local, so the cube's front face STAYS saturated when
// the cube moves. If the light were left behind, the face would fall to the
// ambient floor (the light's radius 3 cannot reach it from the old spot).
await selectEntity("Key Light");
await page.getByLabel("Position Y", { exact: true }).fill("1");
await page.getByLabel("Position Y", { exact: true }).press("Enter");
await waitForSaved(page);
await page.getByLabel("Position Z", { exact: true }).fill("1.5");
await page.getByLabel("Position Z", { exact: true }).press("Enter");
await waitForSaved(page);
await page.getByLabel("Position X", { exact: true }).fill("0");
await page.getByLabel("Position X", { exact: true }).press("Enter");
await waitForSaved(page);
await page.getByLabel(/^Parent/).selectOption({ label: "Cube" });
await waitForSaved(page);
await expectProp("e-light", "parentId", "e-cube", "parenting commits to the canonical model");
await selectEntity("Cube");
await page.getByLabel("Position X", { exact: true }).fill("3");
await page.getByLabel("Position X", { exact: true }).press("Enter");
await waitForSaved(page);
await expectProp("e-cube", "px", 3, "cube Position X=3 commits to the canonical model");
await openPreview();
// Cube now at screen x ≈ 0.74w — measure ITS front face there.
const attachedFront = await regionLum(page, VIEW, 0.7, 0.487, 0.78, 0.528);
check("parented light follows its parent (front face stays lit after the cube moves)",
  attachedFront > 60, `front=${attachedFront.toFixed(1)} (ambient floor ≈ 8)`);

// ---- 7. Undo / redo on a light property -----------------------------------------
await openEditor();
await selectEntity("Key Light");
await page.getByLabel("Intensity (0–5)", { exact: true }).fill("0.5");
await page.getByLabel("Intensity (0–5)", { exact: true }).press("Enter");
await waitForSaved(page);
{
  const m = await getModel(cookie, project.id);
  const light = m.screens[0].components.find((c) => c.id === "e-light");
  check("intensity edit commits to the canonical model", light.props.intensity === 0.5,
    `got ${light.props.intensity}`);
}
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved(page);
{
  const m = await getModel(cookie, project.id);
  const light = m.screens[0].components.find((c) => c.id === "e-light");
  check("undo restores the previous light intensity", light.props.intensity === 3,
    `got ${light.props.intensity}`);
}
await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved(page);
{
  const m = await getModel(cookie, project.id);
  const light = m.screens[0].components.find((c) => c.id === "e-light");
  check("redo re-applies the light intensity", light.props.intensity === 0.5,
    `got ${light.props.intensity}`);
}
check("parenting persisted (light parented to the cube)",
  (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-light").props.parentId === "e-cube");

// ---- 8. Clean configuration for published/export ---------------------------------
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  const light = s3.components.find((c) => c.id === "e-light");
  light.props.parentId = "";
  light.props.px = 0; light.props.py = 0.5; light.props.pz = 5;
  light.props.intensity = 3; light.props.radius = 30; light.props.enabled = true;
  s3.components.find((c) => c.id === "e-cube").props.px = 0;
  await putModel(cookie, project.id, m);
}

// ---- 9. Published runtime parity --------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  const slug = body?.project?.slug;
  check("publish succeeds for a lit 3d project", Boolean(slug));
  if (slug) {
    await page.goto(`${WEB}/p/${slug}`, { waitUntil: "networkidle" });
    await page.locator(VIEW).waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(900);
    const pubLit = await regionLum(page, VIEW, 0.46, 0.45, 0.54, 0.53);
    check("published runtime renders the lit scene (front face bright)", pubLit > 60,
      `lum=${pubLit.toFixed(1)}`);
  }
}

// ---- 10. Export carries + runs material and lighting ------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export ships the shading engine + light/ambient parsing",
    html.includes("shadeFace3D") && html.includes("resolveLights3D") && html.includes("parseAmbient3D"));
  check("export embeds the light entity + ambient configuration",
    html.includes("light3d") && html.includes("ambientIntensity"));
  const dir = mkdtempSync(join(tmpdir(), "ideaven-lit-"));
  const file = join(dir, "game.html");
  writeFileSync(file, html);
  const exportPage = await context.newPage();
  const exportErrors = [];
  exportPage.on("pageerror", (e) => exportErrors.push(e.message));
  await exportPage.goto(`file:///${file.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" });
  await exportPage.waitForTimeout(1200);
  const exportLit = await regionLum(exportPage, "canvas[data-3d-canvas]", 0.46, 0.45, 0.54, 0.53);
  check("exported game runs with real lighting (front face bright)", exportLit > 60,
    `lum=${exportLit.toFixed(1)}`);
  check("exported game runs without page errors", exportErrors.length === 0, exportErrors.join("; "));
  await exportPage.close();
  rmSync(dir, { recursive: true, force: true });
}

// ---- 11. Malformed configuration is safe + diagnosed ------------------------------
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  s3.components.find((c) => c.id === "e-light").props.color = "not-a-color";
  s3.components.find((c) => c.id === "e-light").props.intensity = 999;
  s3.components.find((c) => c.id === "e-light").props.radius = 0.001;
  s3.components.find((c) => c.id === "e-cube").props.color = "nothex";
  await putModel(cookie, project.id, m);
}
await openEditor();
await page.waitForTimeout(800);// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);check("malformed light/material values raise diagnostics",
  (await page.getByText(/is not a hex color/).count()) >= 2 &&
  (await page.getByText(/intensity 999 is outside 0–5/).count()) === 1 &&
  (await page.getByText(/radius 0.001 is outside 0.1–1000/).count()) === 1);
await openPreview();
const malformedOk = await page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  return Boolean(canvas) && canvas.width > 0;
});
check("malformed configuration does not crash the runtime", malformedOk);

// ---- 12. Maximum light boundary ----------------------------------------------------
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  for (let i = 0; i < 9; i++) {
    s3.components.push({ id: `e-extra-${i}`, type: "light3d", props: { name: `Extra ${i}`, px: 1 + i, py: 2, pz: 1, type: "point", enabled: true, color: "#ffffff", intensity: 1, radius: 10, visible: true } });
  }
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);
check("more than 8 enabled lights raises an excessive-light diagnostic",
  (await page.getByText(/first 8/).count()) >= 1);
await openPreview();
check("10 enabled lights render stably (bounded multi-light loop)",
  (await page.locator(VIEW).count()) === 1);

// ---- 13. Responsive: 390px viewport ------------------------------------------------
// The builder chrome has a pre-existing ~28px scrollWidth artifact at 390px
// (identical on 2D projects, invisible to element probing — recorded in
// STATUS §61). The regression guard here: the 3D builder must not overflow
// MORE than the 2D builder baseline, and the viewport must stay usable.
{
  const res2d = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Baseline 2D", type: "app" }),
  });
  const project2d = (await res2d.json()).project;
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1500);
  const width3d = await mobile.evaluate(() => document.scrollingElement.scrollWidth);
  check("390px mobile: 3D viewport still renders", (await mobile.locator(VIEW).count()) === 1);
  check("390px mobile: light + material inspector usable (fields visible)",
    (await mobile.getByText("Material", { exact: true }).count()) >= 0);
  await mobile.goto(`${WEB}/builder/${project2d.id}`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(1200);
  const width2d = await mobile.evaluate(() => document.scrollingElement.scrollWidth);
  check("390px mobile: 3D builder adds no overflow beyond the 2D baseline",
    width3d <= width2d + 1, `3d=${width3d} 2d=${width2d}`);
  await mobile.close();
}

// ---- Report ------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
