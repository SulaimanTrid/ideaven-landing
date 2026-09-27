// 3D character controller (TASK 57) E2E: real keyboard-driven gameplay on
// the TASK 54 physics + 55/56 stack. Evidence: runtime observability
// attributes (data-physics-bodies with x/y/z, data-3d-player,
// data-controller-*), canonical model values, published runtime, and the
// exported game run from disk. Editor-only UI must never leak into runtime.
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
const playerOf = (page, sel = "canvas[data-viewport-3d]") => page.evaluate((s) => {
  const canvas = document.querySelector(s);
  const raw = canvas?.getAttribute("data-physics-bodies");
  return raw ? JSON.parse(raw).find((b) => b.id === "e-player") : null;
}, sel);
const attr = (page, name, sel = "canvas[data-viewport-3d]") => page.evaluate(([s, a]) =>
  document.querySelector(s)?.getAttribute(a) ?? null, [sel, name]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`cc-${stamp}@ex.com`, `cc${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Controller Lab", type: "3d" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (type 3d)`);

// ---- Scene: ground + player(controller) + wall + active camera -------------------
// The active camera looks toward −z, so W (move-forward) decreases pz and the
// wall (face at z −2.5) blocks the forward path. Collider sizes are 1 and the
// entity scales provide the world size (TASK 54 collider convention).
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens.find((s) => s.id === "screen-scene-1");
  scene.components.push(
    { id: "e-ground", type: "plane3d", props: { name: "Ground", px: 0, py: -0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 12, sy: 1, sz: 12, color: "#2a3348", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1, isTrigger: false } },
    { id: "e-player", type: "cube3d", props: { name: "Player", px: 0, py: 3, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1, isTrigger: false, gravityEnabled: true, controllerEnabled: true, moveSpeed: 5, acceleration: 40, deceleration: 60, jumpForce: 6, airControl: 0.4 } },
    { id: "e-wall", type: "cube3d", props: { name: "Wall", px: 0, py: 1, pz: -3, rx: 0, ry: 0, rz: 0, sx: 6, sy: 3, sz: 1, color: "#8f7bff", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1, isTrigger: false } },
    { id: "e-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 4, pz: 9, rx: -20, ry: 0, rz: 0, fov: 60, near: 0.1, far: 2000, active: true, visible: true } },
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
const openPreview = async () => {
  await page.getByRole("button", { name: "Preview", exact: true }).first().click();
  await page.locator("canvas[data-viewport-3d]").waitFor({ state: "visible", timeout: 8000 });
  await sleep(2200); // fall from py 3 (≈0.74 s) + settle
};
const releaseAll = async () => {
  for (const k of ["w", "a", "s", "d", "Space", "arrowup", "arrowdown", "arrowleft", "arrowright"]) {
    await page.keyboard.up(k).catch(() => undefined);
  }
  await sleep(900); // deceleration 60 → rest in ≈0.1 s
};

await openEditor();

// ---- A. PROJECT / CONFIG -----------------------------------------------------------
check("A1: 3D project opens in the editor", (await page.locator("canvas[data-viewport-3d]").count()) === 1);
check("A2: 3D viewport is visible", await page.locator("canvas[data-viewport-3d]").isVisible());
await page.getByLabel("Select Player", { exact: true }).click();
await page.waitForTimeout(400);
check("A3: player entity exists and is selectable", true);
check("A4: controller inspector section is visible",
  (await page.getByText("Controller (3D player)", { exact: true }).count()) === 1);
check("A5: controller is enabled (canonical checkbox)",
  await page.getByLabel("Controller enabled").isChecked());
{
  const p = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-player").props;
  check("A6: controller values persist in the canonical model",
    p.controllerEnabled === true && p.moveSpeed === 5 && p.acceleration === 40 &&
    p.deceleration === 60 && p.jumpForce === 6 && p.airControl === 0.4,
    JSON.stringify({ moveSpeed: p.moveSpeed, jumpForce: p.jumpForce }));
}

// ---- D. GRAVITY (fresh preview catches the fall) ------------------------------------
await openPreview();
check("D19: grounded becomes true after landing", (await attr(page, "data-controller-grounded")) === "true");
{
  const rest1 = await playerOf(page);
  await sleep(1200);
  const rest2 = await playerOf(page);
  check("D18: player lands ON the ground (y ≈ 0.5)", rest1 !== null && Math.abs(rest1.y - 0.5) < 0.15, `y=${rest1?.y}`);
  check("D20: no endless downward movement (rest is stable)",
    rest2 !== null && Math.abs(rest2.y - rest1.y) < 0.05 && rest2.y > 0.35,
    `y ${rest1?.y} → ${rest2?.y}`);
}

// ---- B/C. INPUT → MOVEMENT -----------------------------------------------------------
{
  const before = await playerOf(page);
  await page.keyboard.down("w");
  await sleep(250); // speed sample BEFORE the wall (accel reaches 5 in ≈0.13 s)
  const speedW = parseFloat((await attr(page, "data-controller-speed")) ?? "0");
  await sleep(750);
  const during = await playerOf(page);
  await page.keyboard.up("w");
  await releaseAll();
  const after = await playerOf(page);
  check("B7/C12: W moves the player forward (pz decreases, real displacement)",
    before !== null && during !== null && during.z < before.z - 1 && Math.abs(after.z - during.z) < 0.4,
    `pz ${before?.z.toFixed(2)} → ${during?.z.toFixed(2)} → rest ${after?.z.toFixed(2)}`);
  check("B11: solo W speed ≈ moveSpeed (5)", Math.abs(speedW - 5) < 1.2, `speed=${speedW}`);
}
{
  const before = await playerOf(page);
  await page.keyboard.down("s");
  await sleep(800);
  const during = await playerOf(page);
  await page.keyboard.up("s");
  await releaseAll();
  check("B8/C13: S moves the player backward (pz increases)",
    before !== null && during !== null && during.z > before.z + 0.5,
    `pz ${before?.z.toFixed(2)} → ${during?.z.toFixed(2)}`);
}
{
  const before = await playerOf(page);
  await page.keyboard.down("a");
  await sleep(800);
  const during = await playerOf(page);
  await page.keyboard.up("a");
  await releaseAll();
  check("B9/C14: A moves the player left (px decreases)",
    before !== null && during !== null && during.x < before.x - 0.5,
    `px ${before?.x.toFixed(2)} → ${during?.x.toFixed(2)}`);
}
{
  const before = await playerOf(page);
  await page.keyboard.down("d");
  await sleep(800);
  const during = await playerOf(page);
  await page.keyboard.up("d");
  await releaseAll();
  check("B10/C15: D moves the player right (px increases)",
    before !== null && during !== null && during.x > before.x + 0.5,
    `px ${before?.x.toFixed(2)} → ${during?.x.toFixed(2)}`);
}
{
  // Diagonal normalization: W+D holds speed ≈ moveSpeed (never √2×5 ≈ 7.07).
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await sleep(900);
  const speedDiag = parseFloat((await attr(page, "data-controller-speed")) ?? "0");
  await releaseAll();
  check("B11a: diagonal input is normalized (speed stays ≈ moveSpeed)",
    Math.abs(speedDiag - 5) < 1.2, `diag speed=${speedDiag} (7.07 would mean no normalization)`);
  // Release → deceleration brings the player to rest.
  check("C16: release decelerates to rest (speed ≈ 0)", speedDiag >= 0 && (await attr(page, "data-controller-speed")) === "0.00",
    `speed=${await attr(page, "data-controller-speed")}`);
}

// ---- E. JUMP --------------------------------------------------------------------------
{
  const groundY = (await playerOf(page)).y;
  await page.keyboard.press("Space");
  let maxY = groundY;
  for (let i = 0; i < 30; i++) {
    await sleep(60);
    const p = await playerOf(page);
    if (p && p.y > maxY) maxY = p.y;
  }
  const landed = await playerOf(page);
  check("E21: Space while grounded jumps (physics-driven rise)",
    maxY > groundY + 0.8, `ground=${groundY.toFixed(2)} apex=${maxY.toFixed(2)}`);
  check("E22: the player returns to the ground", landed !== null && Math.abs(landed.y - 0.5) < 0.15, `y=${landed?.y}`);
}
{
  // Holding Space: one edge → one jump (no infinite stacking).
  const groundY = (await playerOf(page)).y;
  let maxY = groundY;
  await page.keyboard.down("Space");
  for (let i = 0; i < 40; i++) {
    await sleep(60);
    const p = await playerOf(page);
    if (p && p.y > maxY) maxY = p.y;
  }
  await page.keyboard.up("Space");
  await sleep(600);
  check("E23: holding Space does not auto-jump repeatedly (single-jump apex)",
    maxY < groundY + 2.4, `apex rise=${(maxY - groundY).toFixed(2)} (double jump would exceed ≈1.83×2)`);
}
{
  // Airborne jump is rejected: re-press at the apex adds no height.
  const groundY = (await playerOf(page)).y;
  let maxY = groundY;
  await page.keyboard.press("Space");
  for (let i = 0; i < 30; i++) {
    await sleep(60);
    const p = await playerOf(page);
    if (p && p.y > maxY) maxY = p.y;
    if (i === 8) await page.keyboard.press("Space"); // airborne re-press (new edge)
  }
  await releaseAll();
  check("E24: jump while airborne is rejected (apex stays single-jump)",
    maxY < groundY + 2.4, `apex rise=${(maxY - groundY).toFixed(2)}`);
}

// ---- F. COLLISION ----------------------------------------------------------------------
{
  // Reset to a known spot: hold S back to positive z first, then approach.
  const before = await playerOf(page);
  await page.keyboard.down("w");
  let minZ = before?.z ?? 0;
  let last = before?.z ?? 0;
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    const p = await playerOf(page);
    if (p) { minZ = Math.min(minZ, p.z); last = p.z; }
  }
  await releaseAll();
  const rest = await playerOf(page);
  check("F25: the wall blocks forward movement (stops near the wall face)",
    rest !== null && rest.z >= -2.35 && rest.z <= -1.5, `rest pz=${rest?.z.toFixed(2)} (wall face −2.5 + half 0.5 ≈ −2.0)`);
  check("F26: no tunneling through the wall", minZ > -2.6, `min pz=${minZ.toFixed(2)}`);
  const ground = await page.evaluate(() =>
    JSON.parse(document.querySelector("canvas[data-viewport-3d]").getAttribute("data-physics-bodies")).find((b) => b.id === "e-ground"));
  check("F27: the ground remains stable (static body unmoved)",
    ground !== null && Math.abs(ground.y - (-0.5)) < 0.001, `ground y=${ground?.y}`);
}

// ---- G. RESTART -------------------------------------------------------------------------
{
  await page.getByRole("button", { name: /Restart/ }).first().click();
  let restarted = null;
  for (let i = 0; i < 30 && !restarted; i++) {
    await sleep(80);
    const p = await playerOf(page);
    if (p && p.y > 2.4) restarted = p;
  }
  check("G28: restart restores the authored start transform (py 3)",
    restarted !== null, `no sample back near py 3`);
  await sleep(2200); // fall + land
  const settled = await playerOf(page);
  const speed = await attr(page, "data-controller-speed");
  const grounded = await attr(page, "data-controller-grounded");
  check("G29/G30: velocity and grounded reset (rest, speed 0, grounded true after landing)",
    settled !== null && Math.abs(settled.y - 0.5) < 0.15 && speed === "0.00" && grounded === "true",
    `y=${settled?.y} speed=${speed} grounded=${grounded}`);
  check("G31: runtime still simulates after restart (attributes live)",
    (await attr(page, "data-3d-player")) === "e-player");
}

// ---- H. PERSISTENCE ----------------------------------------------------------------------
{
  await openEditor();
  const p = (await getModel(cookie, project.id)).screens[0].components.find((c) => c.id === "e-player").props;
  check("H32: save/reload retains the controller configuration",
    p.controllerEnabled === true && p.moveSpeed === 5 && p.jumpForce === 6,
    `enabled=${p.controllerEnabled} moveSpeed=${p.moveSpeed}`);
  await page.getByRole("button", { name: "Preview", exact: true }).first().click();
  await page.locator("canvas[data-viewport-3d]").waitFor({ state: "visible", timeout: 8000 });
  await sleep(2200);
  const before = await playerOf(page);
  await page.keyboard.down("w");
  await sleep(700);
  const during = await playerOf(page);
  await page.keyboard.up("w");
  await releaseAll();
  check("H33: preview retains controller behavior after reload",
    before !== null && during !== null && during.z < before.z - 0.5,
    `pz ${before?.z.toFixed(2)} → ${during?.z.toFixed(2)}`);
}

// ---- I. PARITY (published + exported) ------------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  const slug = body?.project?.slug;
  check("I34a: publish succeeds", Boolean(slug));
  await page.goto(`${WEB}/p/${slug}`, { waitUntil: "networkidle" });
  await page.locator("canvas[data-viewport-3d]").waitFor({ state: "visible", timeout: 8000 });
  await sleep(2200);
  const grounded = await attr(page, "data-controller-grounded");
  const before = await playerOf(page);
  await page.keyboard.down("w");
  await sleep(800);
  const during = await playerOf(page);
  await page.keyboard.up("w");
  check("I34b: published runtime movement works (W forward)", grounded === "true" &&
    before !== null && during !== null && during.z < before.z - 0.5,
    `grounded=${grounded} pz ${before?.z.toFixed(2)} → ${during?.z.toFixed(2)}`);
  const editorUI = await page.evaluate(() => ({
    toolbar: document.querySelector('[role="toolbar"]') !== null,
    hierarchy: document.querySelector("[data-hierarchy-panel]") !== null,
    transformMode: document.querySelector("[data-transform-mode]") !== null,
  }));
  check("I36: no editor-only UI leaks into the published runtime",
    !editorUI.toolbar && !editorUI.hierarchy && !editorUI.transformMode, JSON.stringify(editorUI));
}
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("I35a: export ships the controller engine",
    html.includes("applyController3D") && html.includes("controllerEnabled") && html.includes("move-forward"));
  const dir = mkdtempSync(join(tmpdir(), "ideaven-cc-"));
  const file = join(dir, "game.html");
  writeFileSync(file, html);
  const exportPage = await context.newPage();
  const exportErrors = [];
  exportPage.on("pageerror", (e) => exportErrors.push(e.message));
  await exportPage.goto(`file:///${file.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" });
  await exportPage.locator("canvas[data-3d-canvas]").waitFor({ state: "visible", timeout: 8000 });
  await exportPage.waitForTimeout(2500);
  const landed = await playerOf(exportPage, "canvas[data-3d-canvas]");
  const before = landed;
  await exportPage.keyboard.down("w");
  await sleep(800);
  const during = await playerOf(exportPage, "canvas[data-3d-canvas]");
  await exportPage.keyboard.up("w");
  await exportPage.keyboard.press("Space");
  let maxY = during?.y ?? 0;
  for (let i = 0; i < 25; i++) {
    await sleep(60);
    const p = await playerOf(exportPage, "canvas[data-3d-canvas]");
    if (p && p.y > maxY) maxY = p.y;
  }
  check("I35b: exported runtime movement works (W forward)",
    before !== null && during !== null && during.z < before.z - 0.4,
    `pz ${before?.z?.toFixed(2)} → ${during?.z?.toFixed(2)}`);
  check("I35c: exported runtime jump works", maxY > (landed?.y ?? 0) + 0.6,
    `apex=${maxY.toFixed(2)}`);
  check("I35d: exported game runs without page errors", exportErrors.length === 0, exportErrors.join("; "));
  await exportPage.close();
  rmSync(dir, { recursive: true, force: true });
}

// ---- Report ------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
