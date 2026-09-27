// 3D transform gizmos (TASK 56) E2E: real ray/axis/plane interaction in the
// editor viewport. Evidence: deterministic DOM observability (the projected
// gizmo handle geometry the renderer itself uses) + canonical model values +
// rendered-pixel behavior (cube centroid/pixel-count movement). Gizmos are
// editor-only: preview/published/export never render them.
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

const VIEW = "canvas[data-viewport-3d]";
// The gizmo handle geometry the renderer projects (canvas pixel coords) +
// the canvas rect, for pointer-driven drags at exact handle positions.
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
// Pixel centroid of one color range (visual movement evidence).
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

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`gz-${stamp}@ex.com`, `gz${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Gizmo Lab", type: "3d" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (type 3d)`);

// ---- Setup: cube + camera (no physics, editor-focused) ---------------------------
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-cube", type: "cube3d", props: { name: "Cube", px: 0, py: 0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 2, pz: 6, rx: -18, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
  );
  await putModel(cookie, project.id, model);
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const openEditor = async () => {
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
};
const selectEntity = async (name) => {
  await page.getByLabel(`Select ${name}`, { exact: true }).click();
  await page.waitForTimeout(400);
};
// Drag one gizmo handle: pointer down ON the handle, move, release.
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
  await page.waitForTimeout(2500); // autosave debounce + PUT + model GET settle
};

await openEditor();

// ---- A. BASIC --------------------------------------------------------------------
check("A1: 3D project opens in the editor", (await page.locator(VIEW).count()) === 1);
check("A2: 3D viewport is visible", await page.locator(VIEW).isVisible());
await selectEntity("Cube");
check("A3: cube is visible in the editor viewport",
  ((await centroidOf(page, "#58c7f0", 6))?.n ?? 0) > 100);
const handles = await readHandles(page);
check("A4: gizmo appears on the selected object (3 move handles projected)",
  handles !== null && handles.lines.length === 3 &&
  (await page.locator('canvas[data-viewport-3d][data-gizmo-handles]').count()) === 1);

// ---- B. MOVE ---------------------------------------------------------------------
check("B5: Move mode is the default (data-transform-mode attribute)",
  (await page.locator('div[data-transform-mode="move"]').count()) === 1);
check("B6: X handle is selectable (projected line present)", handles?.lines.some((l) => l.axis === "x") === true);
{
  const model = await getModel(cookie, project.id);
  const px0 = model.screens[0].components.find((c) => c.id === "e-cube").props.px;
  const before = await centroidOf(page, "#58c7f0", 6);
  const line = handles.lines.find((l) => l.axis === "x");
  await dragHandle([line.x1, line.y1], 120, 0); // drag the X arrow right
  const model2 = await getModel(cookie, project.id);
  const px1 = model2.screens[0].components.find((c) => c.id === "e-cube").props.px;
  const after = await centroidOf(page, "#58c7f0", 6);
  check("B7: dragging the X handle changes px and the cube visibly moves right",
    px1 > px0 + 0.1 && after.x > before.x + 5, `px ${px0.toFixed(2)}→${px1.toFixed(2)}, centroid ${before.x.toFixed(0)}→${after.x.toFixed(0)}`);
  // Inspector parity (gizmo → inspector).
  const inspectorPx = parseFloat(await page.getByLabel("Position X", { exact: true }).inputValue());
  check("G28: gizmo → inspector parity (Position X shows the dragged value)",
    Math.abs(inspectorPx - px1) < 0.01, `inspector=${inspectorPx} model=${px1}`);
  // One drag = one undo entry.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await waitForSaved(page);
  const pxU = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.px;
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await waitForSaved(page);
  const pxR = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.px;
  check("B10: one drag = ONE undo entry (undo restores pre-drag exactly)",
    Math.abs(pxU - px0) < 1e-6, `undo px=${pxU} expected ${px0}`);
  check("B10b: redo restores the post-drag transform exactly",
    Math.abs(pxR - px1) < 1e-6, `redo px=${pxR} expected ${px1}`);
}
{
  await selectEntity("Cube");
  const handlesY = await readHandles(page);
  const line = handlesY.lines.find((l) => l.axis === "y");
  const py0 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.py;
  await dragHandle([line.x1, line.y1], 0, -80); // drag the Y arrow up
  const py1 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.py;
  check("B8: Y handle drag increases py", py1 > py0 + 0.1, `py ${py0.toFixed(2)}→${py1.toFixed(2)}`);
}
{
  await selectEntity("Cube");
  const handlesZ = await readHandles(page);
  const line = handlesZ.lines.find((l) => l.axis === "z");
  const pz0 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.pz;
  await dragHandle([line.x1, line.y1], 60, 60);
  const pz1 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.pz;
  check("B9: Z handle drag changes pz", Math.abs(pz1 - pz0) > 0.05, `pz ${pz0.toFixed(2)}→${pz1.toFixed(2)}`);
}

// ---- C. ROTATE -------------------------------------------------------------------
await page.keyboard.press("e");
await page.waitForTimeout(300);
check("C11: E switches to Rotate mode (keyboard)", (await page.getAttribute(VIEW, "data-transform-mode")) === "rotate");
{
  await selectEntity("Cube");
  const handlesR = await readHandles(page);
  const ry0 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.ry;
  const ring = handlesR.rings.find((r) => r.axis === "y");
  // Grab the rightmost sampled point of the Y ring and drag it down.
  const p = ring.points.reduce((a, b) => (b[0] > a[0] ? b : a));
  await dragHandle(p, 0, 70);
  const ry1 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.ry;
  check("C13: Y ring drag rotates ry", Math.abs(ry1 - ry0) > 3, `ry ${ry0.toFixed(1)}→${ry1.toFixed(1)}`);
  const inspectorRy = parseFloat(await page.getByLabel("Rotation Y (°)", { exact: true }).inputValue());
  check("C15: inspector rotation matches the gizmo result",
    Math.abs(inspectorRy - ry1) < 0.01, `inspector=${inspectorRy} model=${ry1}`);
}
{
  await selectEntity("Cube");
  const handlesX = await readHandles(page);
  const rx0 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.rx;
  const ring = handlesX.rings.find((r) => r.axis === "x");
  const p = ring.points.reduce((a, b) => (b[0] > a[0] ? b : a));
  await dragHandle(p, 0, 70);
  const rx1 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.rx;
  check("C12: X ring drag rotates rx", Math.abs(rx1 - rx0) > 3, `rx ${rx0.toFixed(1)}→${rx1.toFixed(1)}`);
}
{
  await selectEntity("Cube");
  const handlesZ = await readHandles(page);
  const rz0 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.rz;
  const ring = handlesZ.rings.find((r) => r.axis === "z");
  const p = ring.points.reduce((a, b) => (b[1] > a[1] ? b : a)); // lowest point
  await dragHandle(p, 70, 0);
  const rz1 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.rz;
  check("C14: Z ring drag rotates rz", Math.abs(rz1 - rz0) > 3, `rz ${rz0.toFixed(1)}→${rz1.toFixed(1)}`);
}

// ---- D. SCALE --------------------------------------------------------------------
await page.keyboard.press("r");
await page.waitForTimeout(300);
check("D16: R switches to Scale mode (keyboard)", (await page.getAttribute(VIEW, "data-transform-mode")) === "scale");
{
  await selectEntity("Cube");
  const handlesS = await readHandles(page);
  const before = await centroidOf(page, "#58c7f0", 6);
  const line = handlesS.lines.find((l) => l.axis === "x");
  await dragHandle([line.x1, line.y1], 90, 0);
  const cube = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube");
  const after = await centroidOf(page, "#58c7f0", 6);
  check("D17: X scale handle increases sx and the cube grows on screen",
    cube.props.sx > 1.05 && after.n > before.n, `sx=${cube.props.sx.toFixed(2)} pixels ${before.n}→${after.n}`);
}
{
  await selectEntity("Cube");
  const handlesS = await readHandles(page);
  const line = handlesS.lines.find((l) => l.axis === "y");
  await dragHandle([line.x1, line.y1], 0, -70);
  const sy = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.sy;
  check("D18: Y scale handle increases sy", sy > 1.05, `sy=${sy.toFixed(2)}`);
}
{
  await selectEntity("Cube");
  const handlesS = await readHandles(page);
  const line = handlesS.lines.find((l) => l.axis === "z");
  await dragHandle([line.x1, line.y1], (line.x1 - line.x0) * 0.9, (line.y1 - line.y0) * 0.9);
  const sz = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.sz;
  check("D19: Z scale handle changes sz", Math.abs(sz - 1) > 0.05, `sz=${sz.toFixed(2)}`);
}
{
  // Drag far past the limit — the result must stay finite and clamped.
  await selectEntity("Cube");
  const handlesS = await readHandles(page);
  const line = handlesS.lines.find((l) => l.axis === "x");
  await dragHandle([line.x1, line.y1], 900, 0);
  const cube = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props;
  check("D20: extreme scale drag stays finite and clamped (no NaN/Infinity/0)",
    [cube.sx, cube.sy, cube.sz].every((v) => Number.isFinite(v) && v >= 0.1 && v <= 100),
    `sx=${cube.sx} sy=${cube.sy} sz=${cube.sz}`);
  // Reset scale for the remaining sections.
  const m = await getModel(cookie, project.id);
  m.screens[0].components.find((c) => c.id === "e-cube").props.sx = 1;
  m.screens[0].components.find((c) => c.id === "e-cube").props.sy = 1;
  m.screens[0].components.find((c) => c.id === "e-cube").props.sz = 1;
  await putModel(cookie, project.id, m);
}

// ---- E. SPACE (local vs world) ----------------------------------------------------
{
  const m = await getModel(cookie, project.id);
  m.screens[0].components.find((c) => c.id === "e-cube").props.ry = 45;
  await putModel(cookie, project.id, m);
}
await openEditor();
await selectEntity("Cube");
await page.waitForTimeout(300);
const localHandles = await readHandles(page);
await page.locator('[data-transform-space="local"]').count(); // sanity: attr exists
const worldButton = page.getByRole("button", { name: "world", exact: true });
await worldButton.click();
await page.waitForTimeout(400);
const worldHandles = await readHandles(page);
check("E21: Local space orients handles on the object's rotated local axes",
  localHandles !== null && Math.abs((localHandles.lines.find((l) => l.axis === "x").y1) - localHandles.lines.find((l) => l.axis === "x").y0) > 4,
  `local X line is tilted (ry 45)`);
check("E22: World space orients the X handle on the world axis (horizontal)",
  worldHandles !== null && Math.abs((worldHandles.lines.find((l) => l.axis === "x").y1) - worldHandles.lines.find((l) => l.axis === "x").y0) <= 2,
  `world X line horizontal`);
check("E23: the transformed object still renders correctly with the gizmo attached",
  ((await centroidOf(page, "#58c7f0", 6))?.n ?? 0) > 100);
check("E-space attr: data-transform-space reflects the selector",
  (await page.getAttribute(VIEW, "data-transform-space")) === "world");
await page.getByRole("button", { name: "local", exact: true }).click();

// ---- F. HIERARCHY -------------------------------------------------------------------
let childBefore = null;
{
  const m = await getModel(cookie, project.id);
  const scene = m.screens.find((s) => s.id === "screen-scene-1");
  // Normalize the parent's transform (section E left it rotated/moved) so
  // the child's world-motion direction is unambiguous.
  const cube = scene.components.find((c) => c.id === "e-cube").props;
  cube.px = 0; cube.py = 0.5; cube.pz = 0; cube.rx = 0; cube.ry = 0; cube.rz = 0;
  scene.components.push(
    { id: "e-sphere", type: "sphere3d", props: { name: "Sphere", parentId: "e-cube", px: 1.5, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 0.5, sy: 0.5, sz: 0.5, color: "#46e3b4", visible: true } },
  );
  await putModel(cookie, project.id, m);
}
await openEditor();
await selectEntity("Cube");
check("F24: parent-child hierarchy created (child in the tree)",
  (await page.getByLabel("Select Sphere", { exact: true }).count()) === 1);
{
  // Parent moves via API → child's world position (screen centroid) moves.
  childBefore = await centroidOf(page, "#46e3b4", 6);
  const m = await getModel(cookie, project.id);
  m.screens[0].components.find((c) => c.id === "e-cube").props.px = 2;
  await putModel(cookie, project.id, m);
}
await openEditor();
const childAfter = await centroidOf(page, "#46e3b4", 6);
check("F25: moving the parent moves the child's world position",
  childBefore !== null && childAfter !== null && childAfter.x > childBefore.x + 5,
  `centroid ${childBefore?.x.toFixed(0)} → ${childAfter?.x.toFixed(0)}`);
{
  // Gizmo on the child: edits the child's LOCAL transform only.
  await selectEntity("Sphere");
  const childHandles = await readHandles(page);
  const line = childHandles.lines.find((l) => l.axis === "x");
  const before = await getModel(cookie, project.id);
  const childLocal0 = before.screens[0].components.find((c) => c.id === "e-sphere").props.px;
  const parentPx0 = before.screens[0].components.find((c) => c.id === "e-cube").props.px;
  await dragHandle([line.x1, line.y1], 100, 0);
  const afterDrag = await getModel(cookie, project.id);
  const child = afterDrag.screens[0].components.find((c) => c.id === "e-sphere").props;
  const parentPx1 = afterDrag.screens[0].components.find((c) => c.id === "e-cube").props.px;
  check("F26: child gizmo drag updates the child's canonical LOCAL transform",
    Math.abs(child.px - childLocal0) > 0.1, `child local px ${childLocal0.toFixed(2)}→${child.px.toFixed(2)}`);
  check("F27: the parent remains unchanged by the child's gizmo drag",
    Math.abs(parentPx1 - parentPx0) < 1e-6 && child.parentId === "e-cube",
    `parent px ${parentPx1}, parentId=${child.parentId}`);
}

// ---- G. PARITY + PERSISTENCE -------------------------------------------------------
{
  // Inspector → gizmo: change px in the inspector, the gizmo origin moves.
  await selectEntity("Cube");
  const h0 = await readHandles(page);
  await page.getByLabel("Position X", { exact: true }).fill("0");
  await page.getByLabel("Position X", { exact: true }).press("Enter");
  await waitForSaved(page);
  await page.waitForTimeout(400);
  const h1 = await readHandles(page);
  check("G29: inspector → gizmo parity (gizmo follows the inspector edit)",
    h0 !== null && h1 !== null && h1.origin !== null &&
    Math.abs(h1.origin[0] - h0.origin[0]) > 10, `origin x ${h0?.origin?.[0]} → ${h1?.origin?.[0]}`);
}
{
  // Save/reload: the gizmo drag's transform survives a full reload.
  const m = await getModel(cookie, project.id);
  const cube = m.screens[0].components.find((c) => c.id === "e-cube").props;
  await openEditor();
  await selectEntity("Cube");
  const cubeAfter = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props;
  const gizmoBack = await readHandles(page);
  check("G30: save/reload preserves the transform (model + gizmo re-attached)",
    Math.abs(cubeAfter.px - cube.px) < 1e-6 && gizmoBack !== null && gizmoBack.lines.length === 3,
    `px ${cube.px} persisted; gizmo lines=${gizmoBack?.lines.length}`);
}

// ---- H. CANCEL ---------------------------------------------------------------------
{
  await selectEntity("Cube");
  const px0 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.px;
  const handlesC = await readHandles(page);
  const line = handlesC.lines.find((l) => l.axis === "x");
  const start = toPage(handlesC, [line.x1, line.y1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y, { steps: 4 });
  await page.keyboard.press("Escape"); // cancel mid-drag
  await page.mouse.up();
  await page.waitForTimeout(600);
  const px1 = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-cube").props.px;
  check("H31: Escape cancels the drag — the pre-drag transform is preserved",
    Math.abs(px1 - px0) < 1e-6, `px ${px0} → ${px1} after cancel`);
}
check("H32: zero console errors across the suite", errors.length === 0, errors.join("; "));

// ---- Report ------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
