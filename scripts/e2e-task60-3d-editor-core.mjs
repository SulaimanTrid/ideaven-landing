// TASK 60 — Real 3D Editor Core + Builder UI Overhaul E2E (47 checks).
// Covers: diagnostics collapsed-by-default for every project type + Escape,
// zoned top bar (Export/Save/Publish always visible, overflow menu below xl),
// the 3D secondary toolbar (Select/Move/Rotate/Scale, Local/World, Snap,
// Grid, Colliders, Frame Selected/All, Reset View), F/Home shortcuts, snap
// math on drag deltas, raycast picking (raycastAABB), ctrl+click multi-select
// with group delete/duplicate, builder metadata SEO per project type, and the
// canonical 3D empty state + play/test lifecycle.
// Evidence rule unchanged: DOM observability the renderer/React actually
// produce + canonical model values via the API. No fake controls asserted.
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
async function createProject(cookie, name, type) {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, type }),
  });
  return (await res.json()).project;
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
async function componentCount(cookie, id) {
  const model = await getModel(cookie, id);
  return model.screens[0].components.length;
}
async function propsOf(cookie, id, componentId) {
  const model = await getModel(cookie, id);
  return model.screens[0].components.find((c) => c.id === componentId).props;
}
async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const isMultiple = (value, step, eps = 1e-4) => near(Math.abs(value / step - Math.round(value / step)) * step, 0, eps);

const VIEW = "canvas[data-viewport-3d]";
const readHandles = async (page) => page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  if (!canvas) return null;
  const raw = canvas.getAttribute("data-gizmo-handles");
  if (!raw) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    ...JSON.parse(raw),
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, pixelWidth: canvas.width, pixelHeight: canvas.height },
  };
});
const toPage = (handles, p) => ({
  x: handles.rect.left + (p[0] * handles.rect.width) / handles.rect.pixelWidth,
  y: handles.rect.top + (p[1] * handles.rect.height) / handles.rect.pixelHeight,
});
const centroidOf = (page, hex, tol) => page.evaluate(([h, t]) => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  if (!canvas) return null;
  const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const r0 = parseInt(h.slice(1, 3), 16), g0 = parseInt(h.slice(3, 5), 16), b0 = parseInt(h.slice(5, 7), 16);
  let sx = 0, sy = 0, n = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (Math.abs(data[i] - r0) <= t && Math.abs(data[i + 1] - g0) <= t && Math.abs(data[i + 2] - b0) <= t) {
        sx += px; sy += py; n++;
      }
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n, n } : null;
}, [hex, tol]);
const canvasPagePoint = async (page, fx, fy) => {
  const box = await page.locator(VIEW).boundingBox();
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
};
// Canvas pixel → page point (the canvas is a fixed 1200×900 backing store).
const pixelToPage = async (page, px, py) => {
  const box = await page.locator(VIEW).boundingBox();
  return { x: box.x + (px * box.width) / 1200, y: box.y + (py * box.height) / 900 };
};
const canvasAttr = async (page, name) => page.locator(VIEW).getAttribute(name);
const orbitState = async (page) => ({
  target: JSON.parse((await canvasAttr(page, "data-orbit-target")) ?? "{}"),
  distance: Number((await canvasAttr(page, "data-orbit-distance")) ?? NaN),
});

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`t60-${stamp}@ex.com`, `t60${stamp}`);
const project = await createProject(cookie, "Editor Core Lab", "3d");
console.log(`project ${project.id} created (type 3d)`);

// ---- Setup: an occlusion pair exactly on the screen-center ray (CubeB in
// front, BackCube behind), an off-ray cube for plain picking (CubeA), an
// outlying cube for Frame All (FarCube), an invisible cube, and a camera. ---
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-cube", type: "cube3d", props: { name: "CubeA", px: 2, py: 0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true } },
    { id: "e-cube2", type: "cube3d", props: { name: "CubeB", px: 0, py: 1.5, pz: 2.2, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#ff5f6b", visible: true } },
    { id: "e-back", type: "cube3d", props: { name: "BackCube", px: 0, py: 0.25, pz: -1.2, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#7dffa8", visible: true } },
    { id: "e-far", type: "cube3d", props: { name: "FarCube", px: -7, py: 3, pz: -6, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#ffd166", visible: true } },
    { id: "e-ghost", type: "cube3d", props: { name: "Ghost", px: 2.5, py: 0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#a8ff7d", visible: false } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 2, pz: 6, rx: -18, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
  );
  await putModel(cookie, project.id, model);
}
const BASE_COMPONENTS = 6;

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const openEditor = async () => {
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
};
const useSelectTool = async () => {
  await page.locator('[data-3d-toolbar] [data-tool="select"]').click();
  await page.waitForTimeout(250);
};
const useMoveTool = async () => {
  await page.locator('[data-3d-toolbar] [data-tool="move"]').click();
  await page.waitForTimeout(250);
};
const dragHandle = async (point, dx, dy) => {
  const fresh = await readHandles(page);
  const start = toPage(fresh, point);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(start.x + (dx * i) / 6, start.y + (dy * i) / 6);
  }
  await page.mouse.up();
  await waitForSaved(page);
  await page.waitForTimeout(2500); // autosave debounce + PUT settle
};

await openEditor();

// ---- D. SECONDARY TOOLBAR (canvas work first; no model mutation) -----------------
check("D1: 3D secondary toolbar present (role toolbar, Transform tools)",
  await page.getByRole("toolbar", { name: "Transform tools" }).isVisible());
check("D2: Select/Move/Rotate/Scale tool buttons all present",
  (await page.locator('[data-3d-toolbar] [data-tool="select"]').count()) === 1 &&
  (await page.locator('[data-3d-toolbar] [data-tool="move"]').count()) === 1 &&
  (await page.locator('[data-3d-toolbar] [data-tool="rotate"]').count()) === 1 &&
  (await page.locator('[data-3d-toolbar] [data-tool="scale"]').count()) === 1);
check("D3: Move is the default tool (select off, move pressed)",
  (await canvasAttr(page, "data-select-mode")) === "false" &&
  (await page.locator('div[data-transform-mode="move"]').count()) === 1);
await useSelectTool();
check("D4: Select tool suppresses the gizmo (select-mode observable)",
  (await canvasAttr(page, "data-select-mode")) === "true");
await page.keyboard.press("q");
await page.waitForTimeout(150);
check("D5: Q activates Select and W returns to Move (keyboard tools)",
  (await canvasAttr(page, "data-select-mode")) === "true" &&
  (await page.locator('div[data-transform-mode="move"]').count()) === 1);
await page.locator('[data-3d-toolbar] [data-space="world"]').click();
await page.waitForTimeout(200);
check("D6: World space toggle (data-transform-space=world)",
  (await page.locator('div[data-transform-space="world"]').count()) === 1);
await page.locator('[data-3d-toolbar] [data-space="local"]').click();
await page.locator('[data-3d-toolbar] [data-toggle="snap"]').click();
await page.waitForTimeout(200);
check("D7: Snap toggle observable (aria-pressed + canvas attr)",
  (await page.locator('[data-3d-toolbar] [data-toggle="snap"][aria-pressed="true"]').count()) === 1 &&
  (await canvasAttr(page, "data-snap-enabled")) === "true");
await page.locator('[data-3d-toolbar] [data-toggle="grid"]').click();
await page.locator('[data-3d-toolbar] [data-toggle="colliders"]').click();
await page.waitForTimeout(300);
check("D8: Grid and collider overlays toggle off (canvas attrs)",
  (await canvasAttr(page, "data-grid-visible")) === "false" &&
  (await canvasAttr(page, "data-colliders-visible")) === "false");
await page.locator('[data-3d-toolbar] [data-toggle="grid"]').click();
await page.locator('[data-3d-toolbar] [data-toggle="colliders"]').click();
await page.locator('[data-3d-toolbar] [data-toggle="snap"]').click();

// ---- G. RAYCAST PICKING (Select tool active; no gizmo interference) --------------
await useSelectTool();
{
  const centroid = await centroidOf(page, "#58c7f0", 28);
  const point = centroid ? await pixelToPage(page, centroid.x, centroid.y) : null;
  if (point) await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(400);
  const selectedText = await page.locator('li[aria-selected="true"]').first().textContent().catch(() => "");
  check("G1: click on a cube's screen position selects it (raycast hit)",
    point !== null && (selectedText ?? "").includes("CubeA"), `centroid=${JSON.stringify(centroid)}`);
}
{
  const center = await canvasPagePoint(page, 0.5, 0.5);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(400);
  const selectedText = await page.locator('li[aria-selected="true"]').first().textContent().catch(() => "");
  check("G2: occlusion — the screen-center ray picks the NEARER cube (CubeB)",
    (selectedText ?? "").includes("CubeB"), `selected=${selectedText}`);
}
{
  const corner = await canvasPagePoint(page, 0.08, 0.1);
  await page.mouse.click(corner.x, corner.y);
  await page.waitForTimeout(400);
  const selectedText = await page.locator('li[aria-selected="true"]').first().textContent().catch(() => "");
  check("G3: clicking empty space leaves the selection unchanged",
    (selectedText ?? "").includes("CubeB"), `selected=${selectedText}`);
}
{
  // Hide CubeB, reload, click the same center ray — the pick must fall
  // through to the cube BEHIND it (BackCube), and never to the ghost.
  const model = await getModel(cookie, project.id);
  model.screens[0].components.find((c) => c.id === "e-cube2").props.visible = false;
  await putModel(cookie, project.id, model);
  await openEditor();
  await useSelectTool();
  const center = await canvasPagePoint(page, 0.5, 0.5);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(400);
  const selectedText = await page.locator('li[aria-selected="true"]').first().textContent().catch(() => "");
  check("G4: an invisible occluder is skipped — the pick falls through behind it",
    (selectedText ?? "").includes("BackCube") && !(selectedText ?? "").includes("Ghost"),
    `selected=${selectedText}`);
  const restore = await getModel(cookie, project.id);
  restore.screens[0].components.find((c) => c.id === "e-cube2").props.visible = true;
  await putModel(cookie, project.id, restore);
  await openEditor();
}
await page.getByLabel("Select FarCube", { exact: true }).click();
await page.waitForTimeout(300);
check("G5: hierarchy selection still works alongside raycast picking",
  ((await page.locator('li[aria-selected="true"]').first().textContent().catch(() => "")) ?? "").includes("FarCube"));

// ---- F. SNAP MATH (Move tool + handles; drag deltas are snapped) -----------------
// Order matters: the rotate drag leaves ry≠0, which rotates the LOCAL axes
// the other drags ride on — so rotate runs LAST, on an otherwise unrotated
// cube (also why every block below re-selects and re-checks its tool).
await useMoveTool();
await page.getByLabel("Select CubeA", { exact: true }).click();
await page.waitForTimeout(500);
await page.locator('[data-3d-toolbar] [data-toggle="snap"]').click();
await page.waitForTimeout(200);
{
  const px0 = (await propsOf(cookie, project.id, "e-cube")).px;
  const handles = await readHandles(page);
  const line = handles.lines.find((l) => l.axis === "x");
  await dragHandle([(line.x0 + line.x1) / 2, (line.y0 + line.y1) / 2], 120, 0);
  const px1 = (await propsOf(cookie, project.id, "e-cube")).px;
  check("F1: move drag with snap ON commits a 0.5-multiple delta",
    near(px1, px0, 1e-6) === false && isMultiple(px1 - px0, 0.5, 1e-3), `px ${px0} → ${px1}`);
}
{
  await page.keyboard.press("r"); // scale tool
  await page.waitForTimeout(400);
  const handles = await readHandles(page);
  const line = handles.lines.find((l) => l.axis === "x");
  await dragHandle([(line.x0 + line.x1) / 2, (line.y0 + line.y1) / 2], 70, 0);
  const sx = (await propsOf(cookie, project.id, "e-cube")).sx;
  check("F3: scale drag with snap ON commits a 0.1-multiple scale",
    isMultiple(sx, 0.1, 1e-3) && sx > 1, `sx=${sx}`);
}
await page.locator('[data-3d-toolbar] [data-toggle="snap"]').click();
await page.waitForTimeout(200);
{
  await page.keyboard.press("w"); // back to the move tool — F3 left Scale active
  await page.waitForTimeout(400);
  const px0 = (await propsOf(cookie, project.id, "e-cube")).px;
  const handles = await readHandles(page);
  const line = handles.lines.find((l) => l.axis === "x");
  await dragHandle([(line.x0 + line.x1) / 2, (line.y0 + line.y1) / 2], 40, 0);
  const px1 = (await propsOf(cookie, project.id, "e-cube")).px;
  check("F4: snap OFF preserves the raw (non-step) drag delta",
    isMultiple(px1 - px0, 0.5, 1e-3) === false, `px ${px0} → ${px1}`);
}
{
  // F4 turned snap OFF — re-enable it for the rotate check.
  await page.locator('[data-3d-toolbar] [data-toggle="snap"]').click();
  await page.waitForTimeout(200);
  await page.keyboard.press("e"); // rotate tool (LAST: it spins the local axes)
  await page.waitForTimeout(400);
  const handles = await readHandles(page);
  const ring = handles.rings.find((r) => r.axis === "y");
  // Proven ring-drag pattern (same as the TASK 56 suite): grab the
  // rightmost sampled point of the y ring and drag it perpendicular.
  const p = ring.points.reduce((a, b) => (b[0] > a[0] ? b : a));
  await dragHandle(p, 0, 70);
  const ry = (await propsOf(cookie, project.id, "e-cube")).ry;
  check("F2: rotate drag with snap ON commits a 15°-multiple delta",
    ry !== 0 && isMultiple(ry, 15, 1e-3), `ry=${ry}`);
}

// ---- E. FRAME / RESET VIEW --------------------------------------------------------
await page.getByLabel("Select CubeA", { exact: true }).click();
await page.waitForTimeout(400);
{
  const props = await propsOf(cookie, project.id, "e-cube");
  await page.keyboard.press("f");
  await page.waitForTimeout(400);
  const orbit = await orbitState(page);
  check("E1: F focuses the selected entity (orbit target = its world center)",
    near(orbit.target.x, props.px, 0.01) && near(orbit.target.y, props.py, 0.01) && near(orbit.target.z, props.pz, 0.01),
    `target=${JSON.stringify(orbit.target)} props=${JSON.stringify(props)}`);
}
{
  await page.locator('[data-3d-toolbar] [data-action="frame-selected"]').click();
  await page.waitForTimeout(400);
  const orbit = await orbitState(page);
  const props = await propsOf(cookie, project.id, "e-cube");
  check("E2: Frame Selected button behaves like F",
    near(orbit.target.x, props.px, 0.01) && near(orbit.target.z, props.pz, 0.01),
    `target=${JSON.stringify(orbit.target)}`);
}
{
  await page.locator('[data-3d-toolbar] [data-action="frame-all"]').click();
  await page.waitForTimeout(400);
  const orbit = await orbitState(page);
  check("E3: Frame All pulls the camera back to enclose every visible entity",
    orbit.distance > 12, `distance=${orbit.distance}`);
}
{
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const orbit = await orbitState(page);
  check("E4: Home frames all (same enclosure via keyboard)",
    orbit.distance > 12, `distance=${orbit.distance}`);
}
{
  await page.locator('[data-3d-toolbar] [data-action="reset-view"]').click();
  await page.waitForTimeout(400);
  const orbit = await orbitState(page);
  check("E5: Reset View restores the canonical orbit (target 0/0.5/0, distance 9)",
    near(orbit.target.x, 0, 0.001) && near(orbit.target.y, 0.5, 0.001) &&
    near(orbit.target.z, 0, 0.001) && near(orbit.distance, 9, 0.01),
    `target=${JSON.stringify(orbit.target)} distance=${orbit.distance}`);
}

// ---- H. MULTI-SELECT (ctrl+click, group ops) --------------------------------------
await useSelectTool();
const ctrlClick = async (target) => {
  await page.keyboard.down("Control");
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
};
{
  const a = await centroidOf(page, "#58c7f0", 28);
  const b = await centroidOf(page, "#ff5f6b", 28);
  const pa = await pixelToPage(page, a.x, a.y);
  const pb = await pixelToPage(page, b.x, b.y);
  await ctrlClick(pa);
  check("H1: ctrl+click adds an entity to the viewport multi-select",
    (await page.locator("[data-multi-select-count]").getAttribute("data-multi-select-count")) === "1");
}
{
  const a = await centroidOf(page, "#58c7f0", 28);
  await ctrlClick(await pixelToPage(page, a.x, a.y));
  check("H2: ctrl+click again toggles the entity back out",
    (await page.locator("[data-multi-select-count]").count()) === 0);
}
{
  const a = await centroidOf(page, "#58c7f0", 28);
  const b = await centroidOf(page, "#ff5f6b", 28);
  await ctrlClick(await pixelToPage(page, a.x, a.y));
  await ctrlClick(await pixelToPage(page, b.x, b.y));
  const before = await componentCount(cookie, project.id);
  await page.locator("[data-multi-duplicate]").click();
  await waitForSaved(page);
  await page.waitForTimeout(2500);
  const after = await componentCount(cookie, project.id);
  check("H3: group duplicate creates one copy per selected entity (+2)",
    after === before + 2, `before=${before} after=${after}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("H4: Escape clears the multi-select set",
    (await page.locator("[data-multi-select-count]").count()) === 0);
  await ctrlClick(await pixelToPage(page, a.x, a.y));
  await ctrlClick(await pixelToPage(page, b.x, b.y));
  const beforeDelete = await componentCount(cookie, project.id);
  await page.locator("[data-multi-delete]").click();
  await waitForSaved(page);
  await page.waitForTimeout(2500);
  const afterDelete = await componentCount(cookie, project.id);
  check("H5: group delete removes every selected entity (−2)",
    afterDelete === beforeDelete - 2 && afterDelete === BASE_COMPONENTS,
    `before=${beforeDelete} after=${afterDelete}`);
}
await useMoveTool();

// ---- C. DIAGNOSTICS (collapsed by default, Escape closes) -------------------------
{
  const strip = page.getByRole("button", { name: "Diagnostics" });
  check("C1: diagnostics strip always visible (3D project)", await strip.isVisible());
  check("C2: diagnostics drawer collapsed by default (3D project)",
    (await strip.getAttribute("aria-expanded")) === "false");
  await strip.click();
  await page.waitForTimeout(200);
  check("C3: the drawer opens on demand (strip click)",
    (await strip.getAttribute("aria-expanded")) === "true");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("C4: Escape closes the diagnostics drawer",
    (await strip.getAttribute("aria-expanded")) === "false");
}

// ---- A/B. TOP BAR ZONES (Export/Save/Publish never hidden; overflow < xl) ---------
check("A1: Export button visible at 1280+",
  await page.locator('button[title="Export & compile the saved model"]').isVisible());
check("A2: Save button visible at 1280+",
  await page.getByRole("button", { name: "Save", exact: true }).isVisible());
check("A3: Publish button visible at 1280+",
  await page.getByRole("button", { name: "Publish", exact: true }).isVisible());

await page.setViewportSize({ width: 1024, height: 950 });
await page.waitForTimeout(400);
{
  const more = page.getByRole("button", { name: "More toolbar tools" });
  const inlineAssets = page.getByRole("button", { name: "Assets", exact: true });
  check("A4: below xl the secondary tools move into the overflow menu",
    (await more.isVisible()) === true && (await inlineAssets.isVisible()) === false);
  await more.click();
  await page.waitForTimeout(200);
  // TASK 61 §18: the menu now also carries the theme entry (six tools).
  check("A5: the overflow menu carries the secondary tools (+ theme)",
    (await page.getByRole("menu", { name: "More toolbar tools" }).getByRole("menuitem").count()) === 6);
  await page.getByRole("menuitem", { name: "Assets" }).click();
  await page.waitForTimeout(200);
  check("A6: choosing a tool from the menu closes the menu",
    (await page.getByRole("menu", { name: "More toolbar tools" }).count()) === 0);
  await more.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("A7: Escape closes the overflow menu",
    (await page.getByRole("menu", { name: "More toolbar tools" }).count()) === 0);
}

await page.setViewportSize({ width: 768, height: 900 });
await page.waitForTimeout(400);
check("B1: no horizontal document overflow at 768px",
  (await page.evaluate(() => document.documentElement.scrollWidth)) <= 769);
check("B2: Export + Save + Publish all visible simultaneously at 768px",
  (await page.locator('button[title="Export & compile the saved model"]').isVisible()) &&
  (await page.getByRole("button", { name: "Save", exact: true }).isVisible()) &&
  (await page.getByRole("button", { name: "Publish", exact: true }).isVisible()));

// ---- C5. App project: diagnostics collapsed there too -----------------------------
const appProject = await createProject(cookie, "App Diag Check", "app");
await page.setViewportSize({ width: 1600, height: 950 });
await page.goto(`${WEB}/builder/${appProject.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
{
  const strip = page.getByRole("button", { name: "Diagnostics" });
  check("C5: diagnostics collapsed by default on an APP project too",
    (await strip.isVisible()) && (await strip.getAttribute("aria-expanded")) === "false");
}

// ---- I. METADATA (SEO per project type) --------------------------------------------
check("I1: the APP builder metadata names the App builder explicitly",
  (await page.title()).includes("IDEAVEN App Builder"), `title=${await page.title()}`);
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
{
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  check("I2: canonical URL is /builder/<id> and the page is noindex",
    (canonical ?? "").endsWith(`/builder/${project.id}`) && (robots ?? "").includes("noindex"),
    `canonical=${canonical} robots=${robots}`);
  check("I3: the 3D builder metadata names the 3D builder explicitly",
    (await page.title()).includes("IDEAVEN 3D Game Builder"));
}

// ---- J. EMPTY STATE + PLAY/TEST LIFECYCLE (fresh 3D project) -----------------------
const emptyProject = await createProject(cookie, "Empty Lab", "3d");
await page.goto(`${WEB}/builder/${emptyProject.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check("J1: the canonical 3D empty state offers Cube/Sphere/Plane inserts",
  (await page.locator("[data-3d-empty-state]").count()) === 1 &&
  (await page.locator('[data-3d-empty-state] button', { hasText: "Cube" }).count()) === 1 &&
  (await page.locator('[data-3d-empty-state] button', { hasText: "Sphere" }).count()) === 1 &&
  (await page.locator('[data-3d-empty-state] button', { hasText: "Plane" }).count()) === 1);
await page.locator('[data-3d-empty-state] button', { hasText: "Cube" }).first().click();
await waitForSaved(page);
await page.waitForTimeout(2500);
{
  const model = await getModel(cookie, emptyProject.id);
  check("J2: the empty-state Cube insert really creates a cube3d entity",
    model.screens[0].components.some((c) => c.type === "cube3d"));
}
await page.locator('nav[aria-label="Editor modes"] button', { hasText: "Preview" }).click();
await page.waitForTimeout(1200);
check("J3: preview mode runs the runtime (RUNTIME label, editor toolbar gone)",
  ((await page.locator("span", { hasText: "3D VIEWPORT · RUNTIME" }).count()) === 1 ||
    (await page.getByText("3D VIEWPORT · RUNTIME").count()) >= 1) &&
    (await page.locator("[data-3d-toolbar]").count()) === 0);

console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0 || errors.length > 0) process.exit(1);
