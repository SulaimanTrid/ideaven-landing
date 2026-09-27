// 3D foundation (TASK 51) E2E: real software-rendered 3D — perspective
// projection, painter's depth sorting (REAL occlusion evidence via pixel
// sampling), palette insertion, inspector transforms, undo/redo,
// persistence, published parity, export engine markers.
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
const cookie = await apiRegister(`d3-${stamp}@ex.com`, `d3${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "3D Lab", type: "3d" }),
  });
  if (!res.ok) throw new Error(`project create failed: ${res.status} ${await res.text()}`);
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (type 3d)`);

// ---- Setup: cube (near, blue), cube (far, rose) — depth evidence; camera ----
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-near", type: "cube3d", props: { name: "Near", px: -0.15, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true } },
    { id: "e-far", type: "cube3d", props: { name: "Rose", px: 0.15, py: 0, pz: 2.5, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#ff7d9c", visible: true } },
    { id: "e-plane", type: "plane3d", props: { name: "Ground", px: 0, py: -0.75, pz: 0, rx: 0, ry: 0, rz: 0, sx: 8, sy: 1, sz: 8, color: "#1a2130", visible: true } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 1.6, pz: 5, rx: -14, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
  );
  await putModel(cookie, project.id, model);
  const round = (await getModel(cookie, project.id)).screens.find((s) => s.id === "screen-scene-1");
  check("3D entities persist in the canonical model",
    round.components.some((c) => c.id === "e-near" && c.type === "cube3d") &&
    round.components.some((c) => c.id === "e-far" && c.type === "cube3d") &&
    round.components.some((c) => c.id === "e-cam" && c.type === "camera3d"));
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// ---- 1. 3D viewport renders the scene -------------------------------------------
const canvas = page.locator("canvas[data-viewport-3d]");
check("3D viewport canvas present in the builder", (await canvas.count()) === 1);
check("3D Objects palette category appears for 3d projects",
  (await page.getByText("3D Objects").count()) === 1);

// Depth evidence (REAL 3D): the two cubes overlap on screen; the NEARER
// (blue #58c7f0) cube must occlude the FARTHER (rose #ff7d9c) one. Sample
// the whole canvas and classify pixels by their nearest clip color.
const sampleOverlapColor = () => page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let blue = 0, rose = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (b > 150 && g > 150 && r < 150) blue++;
    if (r > 180 && g < 160 && b < 190 && b > 90) rose++;
  }
  return { blue, rose };
});

let overlap = await sampleOverlapColor();
check("REAL 3D depth: the closer cube (rose, pz 2.5) occludes the farther (blue, pz 0)",
  overlap.rose > overlap.blue, JSON.stringify(overlap));
let model = await getModel(cookie, project.id);
{
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.find((c) => c.id === "e-near").props.pz = 3.5;
  await putModel(cookie, project.id, model);
}
// HTTP PUT doesn't update the builder's React state — reload to re-render.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
overlap = await sampleOverlapColor();
check("swapping depth swaps occlusion (blue, pz 3.5, now nearest)",
  overlap.blue > overlap.rose, JSON.stringify(overlap));
model = await getModel(cookie, project.id);
{
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.find((c) => c.id === "e-near").props.pz = 0;
  await putModel(cookie, project.id, model);
}
await page.waitForTimeout(900);

// ---- 2. Palette insertion through the real UI ------------------------------------
await page.getByRole("button", { name: "Sphere", exact: true }).first().click();
await page.waitForTimeout(400);
await waitForSaved(page);
model = await getModel(cookie, project.id);
check("palette inserts a sphere3d through the real UI",
  model.screens.find((s) => s.id === "screen-scene-1").components.some((c) => c.type === "sphere3d"),
  model.screens.find((s) => s.id === "screen-scene-1").components.map((c) => c.type).join(","));

// ---- 3. Inspector transforms through the tree ------------------------------------
await page.getByRole("treeitem").filter({ hasText: /Near/ }).first().click();
await page.waitForTimeout(500);
const pxField = page.getByLabel("Position X");
check("inspector exposes the canonical 3D transform fields",
  (await pxField.count()) === 1 && (await page.getByLabel("Position Y").count()) === 1 &&
  (await page.getByLabel("Position Z").count()) === 1 &&
  (await page.getByLabel("Scale X").count()) === 1);
await pxField.fill("1.5");
await page.keyboard.press("Tab");
await waitForSaved(page);
model = await getModel(cookie, project.id);
check("transform edit persists (px 1.5)",
  model.screens.find((s) => s.id === "screen-scene-1").components.find((c) => c.id === "e-near").props.px === 1.5);
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
const undoPx = model.screens.find((s) => s.id === "screen-scene-1").components.find((c) => c.id === "e-near").props.px;
check("undo reverts the transform", undoPx === -0.15, `px=${undoPx}`);
await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
check("redo re-applies the transform",
  model.screens.find((s) => s.id === "screen-scene-1").components.find((c) => c.id === "e-near").props.px === 1.5);

// ---- 4. Camera: fov edit + no-crash with malformed data ---------------------------
{
  const m = await getModel(cookie, project.id);
  const scene = m.screens.find((s) => s.id === "screen-scene-1");
  scene.components.find((c) => c.id === "e-cam").props.fov = 999;
  scene.components.find((c) => c.id === "e-near").props.px = "not-a-number";
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
check("malformed transform/fov do not crash the runtime (viewport still renders)",
  (await canvas.count()) === 1 && (await page.getByText(/outside 20–120/).count()) >= 1);
{
  const m = await getModel(cookie, project.id);
  const scene = m.screens.find((s) => s.id === "screen-scene-1");
  scene.components.find((c) => c.id === "e-cam").props.fov = 60;
  scene.components.find((c) => c.id === "e-near").props.px = 0;
  await putModel(cookie, project.id, m);
}

// ---- 5. Preview: the same scene through the runtime ------------------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1500);
const previewCanvas = page.locator("canvas[data-viewport-3d]");
check("preview renders the 3D scene through the same renderer",
  (await previewCanvas.count()) === 1);
const previewPixels = await previewCanvas.evaluate((el) => {
  const ctx = el.getContext("2d");
  const data = ctx.getImageData(0, 0, el.width, el.height).data;
  let colored = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && !(data[i] === 12 && data[i + 1] === 15 && data[i + 2] === 23)) colored++;
  return colored > 500;
});
check("preview canvas shows the rendered meshes (pixel evidence)", previewPixels);

// ---- 6. Published parity -----------------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("published page renders the 3D scene",
    (await page.locator("canvas[data-3d-canvas], canvas[data-viewport-3d]").count()) === 1);
  const pubPixels = await page.evaluate(() => {
    const el = document.querySelector("canvas[data-3d-canvas], canvas[data-viewport-3d]");
    const ctx = el.getContext("2d");
    const data = ctx.getImageData(0, 0, el.width, el.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && !(data[i] === 12 && data[i + 1] === 15 && data[i + 2] === 23)) colored++;
    return colored > 500;
  });
  check("published canvas shows the rendered meshes (pixel evidence)", pubPixels);
}

// ---- 7. Export carries the 3D runtime ----------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds the 3D entities", html.includes("e-near") && html.includes("cube3d"));
  check("export ships the 3D renderer (painter + projection mirror)",
    html.includes("draw3D") && html.includes("render3DScene"));
}

// ---- 8. No console errors -----------------------------------------------------------
check("no console errors across the whole run", errors.length === 0, errors.slice(0, 2).join(" | "));

// ---- Report --------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
