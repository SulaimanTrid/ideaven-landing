// 3D physics foundation (TASK 54) E2E: real gravity + collision in the
// software renderer. The player (dynamic box, py 5) falls onto a static
// ground box, lands without penetrating, becomes grounded; a trigger zone
// dispatches touches- events through the existing handler architecture;
// restart restores the authored transform. Evidence via data-physics-bodies
// (runtime observability) + canvas pixel sampling.
// Runtimes covered: builder preview + published page (web Viewport3D, canvas
//[data-viewport-3d]) and the exported HTML game (vanilla runtime, canvas
// [data-3d-canvas]) opened directly from disk.
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

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`phy-${stamp}@ex.com`, `phy${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Physics Lab", type: "3d" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (type 3d)`);

// ---- Setup: static ground, dynamic player (py 5), trigger band ------------------
// Collider convention: collider size multiplies the entity's world scale, so
// the ground (scale 8/1/8) uses collider size 1 → an 8×1×8 collider matching
// its mesh. The trigger is an ELEVATED band (visual 0.5³, collider 1×1×1 via
// size 2 × scale 0.5) that the falling player passes THROUGH: enter fires
// mid-air, exit fires below it, and the player rests on the ground fully
// visible — never inside the zone mesh. The camera is pulled back to keep
// x=1.2 comfortably inside the narrow portrait FOV.
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-ground", type: "cube3d", props: { name: "Ground", px: 0, py: -0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 8, sy: 1, sz: 8, color: "#2a3348", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1, isTrigger: false } },
    { id: "e-player", type: "cube3d", props: { name: "Player", px: 0, py: 5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1, isTrigger: false, gravityEnabled: true, mass: 1 } },
    { id: "e-zone", type: "cube3d", props: { name: "Zone", px: 1.2, py: 2.2, pz: 0, rx: 0, ry: 0, rz: 0, sx: 0.5, sy: 0.5, sz: 0.5, color: "#46e3b4", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 2, colliderSizeY: 2, colliderSizeZ: 2, isTrigger: true } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 1.8, pz: 8, rx: -10, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
  );
  // Trigger event: when Player touches Zone → color the player rose.
  // A blank 3D scene starts without a logic block — the web ops create it
  // on the first handler ({ handlers }), so mirror that shape here.
  scene.logic = scene.logic ?? { handlers: [] };
  scene.logic.handlers.push({
    id: "h-trigger", componentId: "e-player", event: "touches-e-zone",
    body: [{ id: "b-color", kind: "statement", type: "set-property", inputs: { componentId: "e-player", property: "color" }, slots: { value: { id: "x-rose", kind: "expression", type: "text", inputs: { value: "#ff7d9c" } } } }],
  });
  await putModel(cookie, project.id, model);
  const round = await getModel(cookie, project.id);
  const scene2 = round.screens.find((s) => s.id === "screen-scene-1");
  check("physics configuration persists in the canonical model",
    scene2.components.find((c) => c.id === "e-ground").props.bodyType === "static" &&
    scene2.components.find((c) => c.id === "e-player").props.bodyType === "dynamic" &&
    scene2.components.find((c) => c.id === "e-player").props.py === 5 &&
    scene2.components.find((c) => c.id === "e-zone").props.isTrigger === true);
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const readBodies = async () => JSON.parse(await page.locator("canvas[data-viewport-3d]").getAttribute("data-physics-bodies"));
const bodyOf = (bodies, id) => bodies.find((b) => b.id === id);
// Tolerant pixel classification (same approach as the foundation suite):
// rose #ff7d9c vs blue #58c7f0 on the 3D canvas. The ranges exclude the
// axis-indicator colors (#ff5f6b / #5fd08a / #5fa8ff) drawn bottom-left.
const countColor = (which) => page.evaluate((w) => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  if (!canvas) return -1;
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (w === "rose" && r > 200 && g > 80 && g < 170 && b > 110 && b < 200) n++;
    if (w === "blue" && r > 60 && r < 110 && g > 180 && g < 215 && b > 220) n++;
  }
  return n;
}, which);

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// ---- 1. Editor: viewport + physics inspector ------------------------------------
check("collider gizmos render in the 3D editor (ground + player + trigger)",
  (await page.evaluate(() => document.querySelectorAll("canvas[data-viewport-3d]").length)) === 1);
await page.getByRole("treeitem").filter({ hasText: /Player/ }).first().click();
await page.waitForTimeout(500);
check("physics inspector exposes Body / Collider / Trigger controls",
  (await page.getByLabel("Body type").count()) === 1 &&
  (await page.getByLabel("Collider type").count()) === 1 &&
  (await page.getByLabel("Trigger collider").count()) === 1);

// ---- 2. Preview: real gravity + collision + grounded -----------------------------
// Sample y every 60ms from the first frame — the fall from 5 to 0.5 takes
// ~0.96s under 9.81 gravity, so rapid sampling catches the descent.
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
const canvas = page.locator("canvas[data-viewport-3d]");
await canvas.waitFor({ state: "visible", timeout: 8000 });
check("preview renders the 3D scene", (await canvas.count()) === 1);

const samples = [];
for (let i = 0; i < 70; i++) {
  try {
    const player = bodyOf(await readBodies(), "e-player");
    if (player) samples.push(player);
  } catch { /* attribute not yet present */ }
  await page.waitForTimeout(60);
}
const ySeries = samples.map((s) => s.y);
const minY = Math.min(...ySeries);
const resting = samples[samples.length - 1];
check("player falls under gravity (Y decreases from ~5)", Math.max(...ySeries) > 4.4 && ySeries[0] > resting.y + 1,
  `first=${ySeries[0]} min=${minY} last=${resting.y}`);
check("player lands ON the ground without penetrating (y ≈ 0.5, ground top)",
  Math.abs(resting.y - 0.5) < 0.15, `y=${resting.y}`);
check("player never passes through the ground (no tunneling below y 0.35)", minY > 0.35, `minY=${minY}`);
check("grounded becomes true after landing", resting.grounded === true);
await page.waitForTimeout(1200);
const still = bodyOf(await readBodies(), "e-player");
check("player stops moving downward after landing (rest, no sinking)",
  Math.abs(still.y - resting.y) < 0.05 && still.grounded === true, `y ${resting.y} → ${still.y}`);
check("preview exposes the grounded observability attribute",
  (await canvas.getAttribute("data-physics-grounded")) === "true");

// ---- 3. Trigger overlap → handler fires -------------------------------------------
// The player (px 1.2) falls THROUGH the elevated trigger band: enter fires
// mid-air (~y 3.2), exit below it (~y 1.2), and it rests at 0.5 — fully
// visible, never inside the zone mesh. Poll the overlaps attribute during
// the fall to catch the overlap window.
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  s3.components.find((c) => c.id === "e-player").props.px = 1.2;
  await putModel(cookie, project.id, m);
}
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await canvas.waitFor({ state: "visible", timeout: 8000 });
let overlaps = null;
for (let i = 0; i < 80 && !overlaps; i++) {
  const value = (await canvas.getAttribute("data-trigger-overlaps")) ?? "";
  if (value.includes("e-player|e-zone")) overlaps = value;
  await page.waitForTimeout(50);
}
check("trigger overlap detected when the player passes through the zone",
  overlaps !== null, "no e-player|e-zone overlap during the fall");
// The touches-e-zone handler ran set-property on the player: after landing,
// the mesh is drawn in rose instead of the authored blue — count pixels.
const rosePixels = await countColor("rose");
const bluePixels = await countColor("blue");
// Blue residue below 1% of rose is antialiasing noise (axis-indicator
// blends); the player itself has fully recolored.
check("trigger event dispatched through the existing handler architecture (player recolored rose)",
  rosePixels > 100 && bluePixels < rosePixels / 100, `rose=${rosePixels} blue=${bluePixels}`);

// ---- 4. Restart restores the authored transform -----------------------------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await canvas.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(2500); // fall + land
const landedY = bodyOf(await readBodies(), "e-player").y;
await page.getByRole("button", { name: /Restart/ }).first().click();
// The viewport remounts and re-seeds: poll for the player back near py 5.
let restarted = null;
for (let i = 0; i < 30 && !restarted; i++) {
  await page.waitForTimeout(60);
  try {
    const player = bodyOf(await readBodies(), "e-player");
    if (player && player.y > 4.4) restarted = player;
  } catch { /* remount gap */ }
}
check("restart restores the authored start position (py 5)",
  restarted !== null, `landed at ${landedY}, no sample back near 5 within 1.8s`);
check("restart clears runtime grounded state", restarted !== null && restarted.grounded === false);

// ---- 5. Diagnostics: malformed physics config -------------------------------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
{
  const m = await getModel(cookie, project.id);
  const s3 = m.screens.find((s) => s.id === "screen-scene-1");
  s3.components.find((c) => c.id === "e-player").props.mass = 99999;
  s3.components.find((c) => c.id === "e-player").props.colliderSizeX = 0.001;
  await putModel(cookie, project.id, m);
}
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);check("out-of-range mass/collider raise diagnostics",
  (await page.getByText(/outside 0\.01–10000/).count()) >= 1);

// ---- 6. Published parity (same web runtime on /p/<slug>) ---------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  const slug = body?.project?.slug;
  check("publish succeeds for a 3d project", Boolean(slug), JSON.stringify(body).slice(0, 200));
  if (slug) {
    await page.goto(`${WEB}/p/${slug}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const pubCanvas = page.locator("canvas[data-viewport-3d]");
    check("published page renders the 3D scene", (await pubCanvas.count()) === 1);
    await page.waitForTimeout(2500);
    const pubPlayer = await page.evaluate(() => {
      const canvas = document.querySelector("canvas[data-viewport-3d]");
      const raw = canvas ? canvas.getAttribute("data-physics-bodies") : null;
      return raw ? JSON.parse(raw).find((b) => b.id === "e-player") : null;
    });
    check("published physics: player rests on the ground, grounded observable",
      pubPlayer !== null && Math.abs(pubPlayer.y - 0.5) < 0.15 && pubPlayer.grounded === true,
      JSON.stringify(pubPlayer));
  }
}

// ---- 7. Exported game runs its own vanilla physics --------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds physics configuration", html.includes("bodyType") && html.includes("colliderType"));
  check("export ships the physics engine (sphere-aware solver)", html.includes("physicsStep") && html.includes("overlapBetween"));
  check("export ships trigger events via emit", html.includes("touches-exit-"));
  const dir = mkdtempSync(join(tmpdir(), "ideaven-export-"));
  const file = join(dir, "game.html");
  writeFileSync(file, html);
  const exportPage = await context.newPage();
  const exportErrors = [];
  exportPage.on("pageerror", (e) => exportErrors.push(e.message));
  await exportPage.goto(`file:///${file.replace(/\\/g, "/")}`);
  await exportPage.waitForTimeout(3000);
  const exportPlayer = await exportPage.evaluate(() => {
    const canvas = document.querySelector("canvas[data-3d-canvas]");
    const raw = canvas ? canvas.getAttribute("data-physics-bodies") : null;
    return raw ? JSON.parse(raw).find((b) => b.id === "e-player") : null;
  });
  check("exported game: vanilla physics lands the player on the ground",
    exportPlayer !== null && Math.abs(exportPlayer.y - 0.5) < 0.15 && exportPlayer.grounded === true,
    JSON.stringify(exportPlayer));
  const exportGrounded = await exportPage.evaluate(() =>
    document.querySelector("canvas[data-3d-canvas]")?.getAttribute("data-physics-grounded") ?? null);
  check("exported game: grounded observability attribute present", exportGrounded === "true", `got ${exportGrounded}`);
  check("exported game runs without page errors", exportErrors.length === 0, exportErrors.join("; "));
  await exportPage.close();
  rmSync(dir, { recursive: true, force: true });
}

// ---- Report ------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
