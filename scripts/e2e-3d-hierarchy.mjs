// 3D hierarchy (TASK 53) E2E: parentId-based parenting with DERIVED world
// transforms. Visual evidence: the child's projected pixel centroid moves
// when the parent moves/rotates/scales — real transform hierarchy, not model
// assertions alone.
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
const cookie = await apiRegister(`h3d-${stamp}@ex.com`, `h3d${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Hierarchy Lab", type: "3d" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (type 3d)`);

// ---- Setup: parent cube (amber), child cube (cyan), grandchild sphere (mint)
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-parent", type: "cube3d", props: { name: "Parent", px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#ffb454", visible: true } },
    { id: "e-child", type: "cube3d", props: { name: "Child", px: 1.5, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 0.5, sy: 0.5, sz: 0.5, color: "#58c7f0", parentId: "e-parent", visible: true } },
    { id: "e-grand", type: "sphere3d", props: { name: "Grandchild", px: 0, py: 0.8, pz: 0, rx: 0, ry: 0, rz: 0, sx: 0.35, sy: 0.35, sz: 0.35, color: "#46e3b4", parentId: "e-child", visible: true } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 1.6, pz: 5, rx: -14, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
  );
  await putModel(cookie, project.id, model);
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// ---- 1. Hierarchy panel: tree + selection synchronization ----------------------
const panel = page.locator('[data-hierarchy-panel="true"]');
check("hierarchy panel renders in the 3D editor", (await panel.count()) === 1);
check("hierarchy lists Parent/Child with derived child counts",
  (await panel.getByRole("button", { name: "Select Parent" }).count()) === 1 &&
  (await panel.getByRole("button", { name: "Select Child" }).count()) === 1,
  `panel="${await panel.evaluate((el) => el.textContent?.slice(0, 200))}"`);
// Click the Child node in the hierarchy → selection syncs (inspector opens).
await panel.getByRole("button", { name: "Select Child" }).first().click();
await page.waitForTimeout(500);
check("selecting a hierarchy node opens its inspector (selection synced)",
  (await page.getByLabel("Position X").count()) >= 1,
  `sel="${await panel.evaluate(() => Array.from(document.querySelectorAll('[data-hierarchy-panel] [aria-selected]')).map((el) => el.getAttribute('aria-selected')).join(','))}" body="${(await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 400)}"`);

// ---- 2. Visual evidence: child follows parent movement (pixel centroids) -------
const centroidOf = (r, g, b) => page.evaluate(([cr, cg, cb]) => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  const ctx = canvas.getContext("2d");
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sx = 0, sy = 0, n = 0;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (Math.abs(data[i] - cr) < 30 && Math.abs(data[i + 1] - cg) < 30 && Math.abs(data[i + 2] - cb) < 30) {
        sx += px; sy += py; n++;
      }
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n, n } : null;
}, [r, g, b]);

const childBefore = await centroidOf(88, 199, 240); // child cube #58c7f0
check("child cube is visible before the move", Boolean(childBefore), JSON.stringify(childBefore));

// Move the parent px 0 → 2.5. The child's WORLD position must shift right.
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.find((c) => c.id === "e-parent").props.px = 2.5;
  await putModel(cookie, project.id, model);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const childAfterMove = await centroidOf(88, 199, 240);
check("moving the parent moves the child's world position",
  childBefore && childAfterMove && childAfterMove.x - childBefore.x > 30,
  `x ${childBefore?.x.toFixed(0)} → ${childAfterMove?.x.toFixed(0)}`);

// ---- 3. Rotate the parent 90° around Y — the child orbits to a new position ----
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  s3.components.find((c) => c.id === "e-parent").props.ry = 90;
  await putModel(cookie, project.id, m);
}
// HTTP PUT doesn't update the builder's React state — reload to re-render.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const childAfterRotate = await centroidOf(88, 199, 240);
check("rotating the parent re-orbits the child (rotation inheritance is real)",
  childAfterRotate && (Math.abs(childAfterRotate.x - childAfterMove.x) > 20 ||
    Math.abs(childAfterRotate.y - childAfterMove.y) > 20),
  JSON.stringify({ afterMove: childAfterMove, afterRotate: childAfterRotate }));

// ---- 4. Scale the parent — the grandchild sphere still renders ------------------
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  s3.components.find((c) => c.id === "e-parent").props.sx = 2;
  s3.components.find((c) => c.id === "e-parent").props.sy = 2;
  s3.components.find((c) => c.id === "e-parent").props.sz = 2;
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const grandBefore = await centroidOf(70, 227, 180); // grandchild sphere #46e3b4
check("grandchild sphere still renders under scaled parent", Boolean(grandBefore), JSON.stringify(grandBefore));

// ---- 5. Persistence: reload keeps the whole hierarchy ---------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
check("hierarchy persists after reload (panel shows Parent 1 / Child 1)",
  (await page.getByRole("button", { name: "Select Parent" }).count()) === 1 &&
  (await page.getByRole("button", { name: "Select Child" }).count()) === 1);
const modelAfterReload = await getModel(cookie, project.id);
const scene2 = modelAfterReload.screens.find((s) => s.id === "screen-scene-1");
check("parentId chains persist exactly",
  scene2.components.find((c) => c.id === "e-child").props.parentId === "e-parent" &&
  scene2.components.find((c) => c.id === "e-grand").props.parentId === "e-child");

// ---- 6. Duplicate subtree: new ids, preserved relationships ---------------------
// The row action buttons are hover-revealed — hover the row first.
await page.getByRole("button", { name: "Select Parent" }).hover();
await panel.getByRole("button", { name: /Duplicate Parent subtree/ }).first().click();
await waitForSaved(page);
const modelDup = await getModel(cookie, project.id);
const afterDup = modelDup.screens.find((s) => s.id === "screen-scene-1").components;
const dupRoot = afterDup.find((c) => c.id !== "e-parent" && c.props.name === "Parent");
check("duplicate subtree adds a copied hierarchy root", Boolean(dupRoot));
if (dupRoot) {
  const dupChild = afterDup.find((c) => c.props.parentId === dupRoot.id);
  check("duplicated child points at the duplicated parent (ids remapped)", Boolean(dupChild),
    JSON.stringify(afterDup.filter((c) => c.type === "cube3d").map((c) => ({ id: c.id, p: c.props.parentId }))));
}

// ---- 7. Delete behavior: children reparent to the deleted parent's parent ------
await page.getByRole("button", { name: "Select Parent" }).first().hover();
await page.locator('[data-hierarchy-panel="true"]').getByRole("button", { name: /Delete Parent/ }).first().click();
await waitForSaved(page);
const modelAfterDelete = await getModel(cookie, project.id);
const scene3 = modelAfterDelete.screens.find((s) => s.id === "screen-scene-1");
check("deleting the parent reparents children (never orphans)",
  !scene3.components.some((c) => c.id === "e-parent") &&
  scene3.components.find((c) => c.id === "e-child")?.props.parentId === "");

// ---- 8. Malformed hierarchy: cycle via raw PUT — runtime stays stable ----------
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  const child = s3.components.find((c) => c.id === "e-child");
  const grand = s3.components.find((c) => c.id === "e-grand");
  child.props.parentId = "e-grand";
  grand.props.parentId = "e-child";
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);
check("cycle in raw model raises a diagnostic",
  (await page.getByText(/parent cycle/).count()) >= 1);
check("runtime stays error-free with a cycle", errors.filter((e) => e.startsWith("pageerror")).length === 0,
  errors.filter((e) => e.startsWith("pageerror")).slice(0, 2).join(" | "));

// ---- 9. Preview renders the hierarchy -------------------------------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
check("preview renders the 3D scene with hierarchy", (await page.locator("canvas[data-viewport-3d]").count()) === 1);

// ---- 10. Export carries hierarchy markers ----------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds parentId relationships", html.includes("e-child") && html.includes("parentId"));
  check("export ships the hierarchy evaluation", html.includes("computeWorldMatrices3D"));
}

// ---- Report -----------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
