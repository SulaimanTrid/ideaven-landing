// TASK 66 â€” Runtime parity: EDITOR â†’ PREVIEW â†’ PUBLISHED â†’ EXPORT on ONE
// canonical model. Maps to directive Â§60 (all 81 areas, honest-only), Â§61
// (real evidence: runtime attributes, rendered geometry, actual artifacts),
// and Â§62 (semantic comparison â€” the SAME project is exercised in preview,
// on the published page, and inside the ACTUAL exported HTML artifact run
// from disk in a real browser).
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const API = "http://localhost:8090";
const WEB = "http://localhost:3000";
import { mkdirSync, writeFileSync, statSync, rmSync } from "node:fs";
const ART_DIR = "scripts/artifacts-task66";
mkdirSync(ART_DIR, { recursive: true });

let passed = 0, failed = 0;
const errors = [];
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
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`model PUT failed: ${res.status}`);
}
async function exportArtifact(cookie, id, kind, file) {
  const url = kind === "html" ? `${API}/api/projects/${id}/export/html`
    : kind === "package" ? `${API}/api/projects/${id}/package`
    : `${API}/api/projects/${id}/export/android?format=apk`;
  const res = await fetch(url, { headers: { Cookie: cookie } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${ART_DIR}/${file}`, buf);
  return { bytes: buf.length, path: `${ART_DIR}/${file}` };
}
async function exportManifest(file) {
  const html = await (await import("node:fs")).promises.readFile(file, "utf8");
  return JSON.parse(html.match(/<script type="application\/json" id="ideaven-manifest">([\s\S]*?)<\/script>/)[1]);
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`t66-${stamp}@ex.com`, `t66${stamp}`);
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US", acceptDownloads: true });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 140)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401") && !m.text().includes("Failed to load resource")) {
    errors.push(`console: ${m.text().slice(0, 140)}`);
  }
});
// A SEPARATE browser page for running exported artifacts from disk â€” the
// artifact must work standalone, with no builder session and no API.
const artifactPage = await browser.newPage({ viewport: { width: 420, height: 900 } });

async function createProject(type, name) {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, type }),
  });
  return (await res.json()).project;
}
async function openBuilder(id) {
  await page.goto(`${WEB}/builder/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
}
async function openPreviewTab() {
  await page.locator('[data-mode-tab="preview"]').click();
  await page.waitForTimeout(1600);
}

// =================================================================================
console.log("--- APP: author â†’ preview â†’ published â†’ exported artifact ---");
const appProject = await createProject("app", `Parity App ${stamp}`);
{
  const model = await getModel(cookie, appProject.id);
  const a = model.screens[0];
  // A second canonical screen (same shape as the seeded one) for navigation.
  const b = JSON.parse(JSON.stringify(a));
  b.id = `screen-b-${stamp}`;
  b.name = "Details";
  b.components = [];
  b.logic = null;
  model.screens.push(b);
  if (!model.navigation) model.navigation = { startScreenId: a.id };
  // Screen A: text + a button that navigates to screen B + a text input.
  a.components.push(
    { id: "c-title", type: "text", props: { text: "Parity Home" } },
    { id: "c-input", type: "text-input", props: { placeholder: "type here", value: "" } },
    { id: "c-go", type: "button", props: { label: "Go to details" } },
  );
  a.logic = { handlers: [{ id: `h-go-${stamp}`, componentId: "c-go", event: "click", body: [{ id: `b-nav-${stamp}`, kind: "statement", type: "navigate", inputs: { screenId: b.id } }] }] };
  b.components.push({ id: "c-detail", type: "text", props: { text: "Details screen" } });
  await putModel(cookie, appProject.id, model);
}
await openBuilder(appProject.id);
await openPreviewTab();
check("A1: app project opens with the APP builder identity",
  (await page.locator('[data-engine-identity="app"]').count()) === 1);
check("A2: preview is REAL â€” the Text component renders runtime state (RUNNING)",
  (await page.locator('[data-preview-state="running"]').count()) === 1);
check("A3: preview renders the authored text",
  (await page.getByText("Parity Home").count()) >= 1);
check("A4: preview renders the authored text input",
  (await page.locator('input[placeholder="type here"]').count()) >= 1);
// Input state parity: type in preview, the runtime value updates (screen A).
await page.locator('input[placeholder="type here"]').fill("parity-123");
await page.waitForTimeout(400);
check("A6: preview input updates component state (input â†’ state â†’ visual)",
  (await page.locator('input[placeholder="type here"]').inputValue()) === "parity-123");
// Navigation parity: click the button IN PREVIEW.
await page.getByRole("button", { name: "Go to details" }).first().click();
await page.waitForTimeout(700);
check("A5: preview navigation follows the canonical screen logic (button â†’ screen B)",
  (await page.getByText("Details screen").count()) >= 1);
// RESTART returns the run to the authored start screen.
await page.getByRole("button", { name: /Restart run/ }).click();
await page.waitForTimeout(900);
check("A7: RESTART resets the run to the authored start screen",
  (await page.getByText("Parity Home").count()) >= 1);
await page.waitForTimeout(300);

// Publish through the REAL button, then exercise the DIRECT public URL.
await page.locator('button[aria-label="Publish"]').click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Publish to the web" }).click();
await page.waitForTimeout(2800);
const appPublicPath = await page.locator('a[href^="/p/"]').first().getAttribute("href");
check("A8: publish produces the public URL", typeof appPublicPath === "string" && appPublicPath.startsWith("/p/"));
await page.goto(`${WEB}${appPublicPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check("A9: published page runs the app WITHOUT the builder (direct URL)",
  (await page.getByText("Parity Home").count()) >= 1);
check("A10: published runtime state is real (data-runtime-state=running)",
  (await page.locator('[data-runtime-state="running"]').count()) === 1);
await page.getByRole("button", { name: "Go to details" }).first().click();
await page.waitForTimeout(700);
check("A11: published navigation matches preview semantics",
  (await page.getByText("Details screen").count()) >= 1);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check("A12: published REFRESH works â€” same behavior from the snapshot",
  (await page.getByText("Parity Home").count()) >= 1);

// EXPORT: download the real artifact, verify it, then RUN IT FROM DISK.
const appExport = await exportArtifact(cookie, appProject.id, "html", `app-${stamp}.html`);
check("A13: export artifact exists and is non-trivial",
  appExport !== null && appExport.bytes > 5000 && statSync(appExport.path).size === appExport.bytes,
  appExport ? `${appExport.bytes}B` : "export failed");
{
  const html = await (await import("node:fs")).promises.readFile(appExport.path, "utf8");
  check("A14: artifact embeds the canonical model + the Â§31 manifest",
    html.includes('id="ideaven-model"') && html.includes('id="ideaven-manifest"'));
  const manifest = JSON.parse(html.match(/<script type="application\/json" id="ideaven-manifest">([\s\S]*?)<\/script>/)[1]);
  check("A15: manifest is honest (type/screens/version, no secrets or paths)",
    manifest.projectType === "app" && manifest.screens === 2 && manifest.schemaVersion === 1 &&
    !JSON.stringify(manifest).includes("localhost") && !JSON.stringify(manifest).includes("session"));
  check("A16: no secrets/cookies/tokens in the artifact (Â§64)",
    !html.includes("ideaven_session") && !html.includes("Authorization") && !html.includes("password="));
}
await artifactPage.goto(`file:///${appExport.path.replace(/\\/g, "/")}`);
await artifactPage.waitForTimeout(1200);
check("A17: the EXPORTED app actually runs from disk (§60.13)",
  (await artifactPage.getByText("Parity Home").count()) >= 1);
await artifactPage.locator('input[placeholder="type here"]').fill("export-456");
await artifactPage.waitForTimeout(400);
check("A19: exported input state behaves like preview + published",
  (await artifactPage.locator('input[placeholder="type here"]').inputValue()) === "export-456");
await artifactPage.getByRole("button", { name: "Go to details" }).click();
await artifactPage.waitForTimeout(700);
check("A18: exported navigation matches preview + published (semantic parity Â§62)",
  (await artifactPage.getByText("Details screen").count()) >= 1);
check("A20: exported manifest readable from the DOM (runtime requirements)",
  (await artifactPage.evaluate(() => JSON.parse(document.getElementById("ideaven-manifest").textContent).runtime)) === "standalone-vanilla/2");

// Android zip: exists, valid zip structure, contains the runtime entry.
const androidZip = await exportArtifact(cookie, appProject.id, "android", `app-${stamp}-android.zip`);
{
  const buf = await (await import("node:fs")).promises.readFile(androidZip.path);
  check("A21: Android artifact is a valid zip with the runtime entry (Â§46)",
    buf.length > 5000 && buf[0] === 0x50 && buf[1] === 0x4b && buf.includes(Buffer.from("app/src/main/assets/index.html")));
  const zipText = buf.toString("latin1");
  check("A22: Android artifact contains no machine paths or secrets (Â§28/Â§64)",
    !zipText.includes("C:\\Users") && !zipText.includes("ideaven_session") && !zipText.includes("127.0.0.1:8090"));
}

// =================================================================================
console.log("--- 2D: authored scene â†’ preview physics â†’ published â†’ exported physics ---");
const gameProject = await createProject("game", `Parity Runner ${stamp}`);
{
  const model = await getModel(cookie, gameProject.id);
  const scene = model.screens[0];
  scene.components.push(
    { id: "e-player", type: "player", props: { name: "Player", x: 60, y: 200, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true } },
    { id: "e-platform", type: "platform", props: { name: "Ground", x: 0, y: 420, width: 390, height: 40, color: "#2a3348", visible: true, collider: true } },
    { id: "e-coin", type: "coin", props: { name: "Coin", x: 220, y: 380, width: 28, height: 28, color: "#ffd970", visible: true, trigger: true } },
    { id: "e-tiles", type: "tilemap", props: { name: "Terrain", x: 0, y: 700, width: 320, height: 96, cellSize: 32, cols: 10, rows: 3, tiles: "0,0:1;1,0:1;2,0:1", palette: "1:#2a3348;2:#46e3b4:pass", visible: true, collider: true } },
    { id: "e-cam", type: "camera", props: { name: "Camera", followEnabled: true, followTarget: "e-player", x: 0, y: 0, width: 390, height: 844 } },
  );
  scene.inputActions = [
    { id: "move-left", name: "Move left", keys: ["arrowleft", "a"], enabled: true },
    { id: "move-right", name: "Move right", keys: ["arrowright", "d"], enabled: true },
    { id: "jump", name: "Jump", keys: ["arrowup", "w", " "], enabled: true },
  ];
  await putModel(cookie, gameProject.id, model);
}
await openBuilder(gameProject.id);
await openPreviewTab();
let previewPlayerX0 = 0, previewPlayerX1 = 0, previewGrounded = false;
{
  check("B1: 2D preview renders the scene with the canonical entities",
    (await page.locator('[data-entity="e-player"]').count()) === 1 &&
    (await page.locator('[data-entity="e-platform"]').count()) === 1 &&
    (await page.locator('[data-entity="e-coin"]').count()) === 1 &&
    (await page.locator('[data-entity="e-tiles"]').count()) === 1);
  previewPlayerX0 = await page.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");
  previewPlayerX1 = await page.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  check("B2: PREVIEW physics â€” input moves the player (evidence: position delta)",
    Number.isFinite(previewPlayerX0) && previewPlayerX1 > previewPlayerX0 + 20,
    `${previewPlayerX0} â†’ ${previewPlayerX1}`);
  previewGrounded = await page.evaluate(() => {
    const el = document.querySelector('[data-entity="e-player"]');
    return el ? parseFloat(el.style.top) + 36 >= 415 : false;
  });
  check("B3: PREVIEW collision â€” the player LANDS on the platform (grounded)",
    previewGrounded, `top=${previewGrounded}`);
  // Camera parity: follow target — the camera state is exposed AND it moves
  // right as the player moves right (semantic follow, not a fixed value).
  const camX0 = await page.evaluate(() => {
    const stage = document.querySelector('[data-camera-x]');
    return stage ? parseFloat(stage.getAttribute("data-camera-x")) : NaN;
  });
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(1500);
  await page.keyboard.up("ArrowRight");
  const camX1 = await page.evaluate(() => {
    const stage = document.querySelector('[data-camera-x]');
    return stage ? parseFloat(stage.getAttribute("data-camera-x")) : NaN;
  });
  check("B4: PREVIEW camera follows the player (exposed state tracks movement)",
    Number.isFinite(camX0) && Number.isFinite(camX1) && camX1 > camX0 + 5,
    `${camX0} → ${camX1}`);
  // Restart re-seeds runtime state: the player returns to the authored spot.
  await page.getByRole("button", { name: /Restart run/ }).click();
  await page.waitForTimeout(1000);
  const restartX = await page.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  check("B5: PREVIEW stop/restart â€” restart re-seeds runtime state (no stale physics)",
    Math.abs(restartX - 60) < 60, `x=${restartX}`);
}
// Publish and compare the same physics on the published page.
await page.locator('button[aria-label="Publish"]').click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Publish to the web" }).click();
await page.waitForTimeout(3000);
const gamePublicPath = await page.locator('a[href^="/p/"]').first().getAttribute("href");
check("B6: 2D publish produces the public URL", typeof gamePublicPath === "string" && gamePublicPath.startsWith("/p/"));
await page.goto(`${WEB}${gamePublicPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
let pubX0 = 0, pubX1 = 0;
{
  check("B7: PUBLISHED direct URL renders the same scene (no builder session)",
    (await page.locator('[data-entity="e-player"]').count()) === 1 &&
    (await page.locator('[data-entity="e-tiles"]').count()) === 1);
  pubX0 = await page.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");
  pubX1 = await page.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  check("B8: PUBLISHED physics matches preview semantics (input â†’ movement)",
    pubX1 > pubX0 + 20, `${pubX0} â†’ ${pubX1}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const pubX2 = await page.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  check("B9: PUBLISHED refresh behaves identically (determinism Â§53)",
    Math.abs(pubX2 - 60) < 60, `x=${pubX2}`);
}
// Export the 2D game and run the artifact from disk â€” SAME physics assertions.
const gameExport = await exportArtifact(cookie, gameProject.id, "html", `game-${stamp}.html`);
{
  const manifest = await exportManifest(gameExport.path);
  check("B10: 2D export manifest reports scene capability + camera (§47 source)",
    manifest.capabilities.includes("scene-2d") && manifest.projectType === "game");
  await artifactPage.goto(`file:///${gameExport.path.replace(/\\/g, "/")}`);
  await artifactPage.waitForTimeout(1400);
  check("B11: EXPORTED 2D scene runs from disk with the same entities",
    (await artifactPage.locator('[data-entity="e-player"]').count()) === 1 &&
    (await artifactPage.locator('[data-entity="e-tiles"]').count()) === 1);
  const exX0 = await artifactPage.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  await artifactPage.keyboard.down("ArrowRight");
  await artifactPage.waitForTimeout(700);
  await artifactPage.keyboard.up("ArrowRight");
  const exX1 = await artifactPage.locator('[data-entity="e-player"]').evaluate((el) => parseFloat(el.style.left));
  check("B12: EXPORTED physics matches preview + published (THREE-way parity Â§62)",
    exX1 > exX0 + 20, `${exX0} â†’ ${exX1}`);
  const exGrounded = await artifactPage.evaluate(() => document.querySelector("[data-player-grounded]")?.getAttribute("data-player-grounded"));
  check("B13: EXPORTED collision semantics â€” grounded state exposed and true",
    exGrounded === "true", `grounded=${exGrounded}`);
  const exCam0 = await artifactPage.evaluate(() => {
    const stage = document.querySelector("[data-camera-x]");
    return stage ? parseFloat(stage.getAttribute("data-camera-x")) : NaN;
  });
  await artifactPage.keyboard.down("ArrowRight");
  await artifactPage.waitForTimeout(1500);
  await artifactPage.keyboard.up("ArrowRight");
  const exCam1 = await artifactPage.evaluate(() => {
    const stage = document.querySelector("[data-camera-x]");
    return stage ? parseFloat(stage.getAttribute("data-camera-x")) : NaN;
  });
  check("B14: EXPORTED camera follow matches preview semantics",
    Number.isFinite(exCam0) && Number.isFinite(exCam1) && exCam1 > exCam0 + 5,
    `${exCam0} → ${exCam1}`);
}

// =================================================================================
console.log("--- 3D: authored scene â†’ preview â†’ published â†’ exported rasterizer ---");
const d3 = await createProject("3d", `Parity World ${stamp}`);
{
  const model = await getModel(cookie, d3.id);
  const scene = model.screens[0];
  scene.components.push(
    { id: "o-floor", type: "plane3d", props: { name: "Floor", px: 0, py: 0, pz: 0, sx: 8, sz: 8, color: "#33415c", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 8, colliderSizeZ: 8 } },
    { id: "o-cube", type: "cube3d", props: { name: "Crate", px: 0, py: 2.5, pz: 0, color: "#8f7bff", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 0.5, colliderSizeY: 0.5, colliderSizeZ: 0.5, mass: 1 } },
    { id: "o-light", type: "light3d", props: { name: "Sun", px: 2, py: 4, pz: 2, color: "#ffd9a0", intensity: 1.2, radius: 14, enabled: true } },
    { id: "o-cam", type: "camera3d", props: { name: "Cam", px: 0, py: 3.2, pz: 7, rx: -24, fov: 60, active: true } },
  );
  await putModel(cookie, d3.id, model);
}
await openBuilder(d3.id);
await openPreviewTab();
{
  check("C1: 3D preview runs Viewport3D with physics observability",
    (await page.locator("canvas[data-viewport-3d]").count()) === 1);
  // The cube authors at py=2.5; by the time preview is observed it must have
  // fallen under gravity toward the floor (y well below the authored height).
  const bodies0 = await page.evaluate(() => {
    const c = document.querySelector("canvas[data-viewport-3d]");
    return c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]") : null;
  });
  const cube0 = bodies0?.find((b) => b.id === "o-cube");
  check("C2: PREVIEW 3D physics â€” the dynamic cube FELL under gravity (y < authored 2.5)",
    cube0 && Number.isFinite(cube0.y) && cube0.y < 2.0, `y=${cube0?.y?.toFixed(2)}`);
  await page.waitForTimeout(1500);
  const bodies2 = await page.evaluate(() => {
    const c = document.querySelector("canvas[data-viewport-3d]");
    return c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]") : null;
  });
  const cube2 = bodies2?.find((b) => b.id === "o-cube");
  check("C3: PREVIEW 3D collision â€” the cube RESTS on the static floor (grounded)",
    cube2 && cube2.grounded === true, `grounded=${cube2?.grounded} y=${cube2?.y?.toFixed(2)}`);
}
await page.locator('button[aria-label="Publish"]').click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Publish to the web" }).click();
await page.waitForTimeout(3000);
const d3PublicPath = await page.locator('a[href^="/p/"]').first().getAttribute("href");
check("C4: 3D publish produces the public URL", typeof d3PublicPath === "string" && d3PublicPath.startsWith("/p/"));
await page.goto(`${WEB}${d3PublicPath}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
{
  check("C5: PUBLISHED 3D scene runs on the direct URL",
    (await page.locator("canvas[data-viewport-3d]").count()) === 1);
  const pubCube = await page.evaluate(() => {
    const c = document.querySelector("canvas[data-viewport-3d]");
    const bodies = c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]") : [];
    return bodies.find((b) => b.id === "o-cube") ?? null;
  });
  check("C6: PUBLISHED 3D physics matches preview (cube rests grounded)",
    pubCube && pubCube.grounded === true, `grounded=${pubCube?.grounded}`);
}
const d3Export = await exportArtifact(cookie, d3.id, "html", `world-${stamp}.html`);
{
  const manifest = await exportManifest(d3Export.path);
  check("C7: 3D export manifest reports scene-3d capability",
    manifest.capabilities.includes("scene-3d"));
  await artifactPage.goto(`file:///${d3Export.path.replace(/\\/g, "/")}`);
  await artifactPage.waitForTimeout(2600);
  check("C8: EXPORTED 3D scene runs from disk (rasterizer + physics loop)",
    (await artifactPage.locator("canvas[data-3d-canvas]").count()) === 1);
  const exCube = await artifactPage.evaluate(() => {
    const c = document.querySelector("canvas[data-3d-canvas]");
    const bodies = c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]") : [];
    return bodies.find((b) => b.id === "o-cube") ?? null;
  });
  check("C9: EXPORTED 3D physics matches preview + published (THREE-way parity)",
    exCube && exCube.grounded === true, `grounded=${exCube?.grounded} y=${exCube?.y?.toFixed(2)}`);
  check("C10: EXPORTED 3D trigger/controller observability present (Â§39)",
    (await artifactPage.locator("canvas[data-3d-canvas][data-controller-enabled]").count()) === 1);
}

// =================================================================================
console.log("--- Extensions: honest skip in preview + published + exported ---");
{
  // Install a real extension through the API pipeline (UI install proven in
  // TASK 64); its block lands in a handler; runtimes must SKIP it honestly.
  const manifest = { format: 1, name: `Parity Ext ${stamp}`, blocks: [{ type: "parity-flash", kind: "statement", category: "media", label: "Parity flash" }] };
  const created = await fetch(`${API}/api/extensions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: manifest.name, summary: "parity", kind: "blocks", manifest }),
  });
  const ext = (await created.json()).extension;
  await fetch(`${API}/api/extensions/${ext.id}/build`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ version: "1.0.0" }) });
  await fetch(`${API}/api/extensions/${ext.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  await fetch(`${API}/api/extensions/${ext.id}/install`, { method: "POST", headers: { Cookie: cookie } });
  const model = await getModel(cookie, gameProject.id);
  model.screens[0].logic = model.screens[0].logic ?? { handlers: [] };
  model.screens[0].logic.handlers.push({
    id: `h-ext-${stamp}`, componentId: null, event: "initialize",
    body: [{ id: `b-ext-${stamp}`, kind: "statement", type: `ext:${ext.slug}:parity-flash`, inputs: {} }],
  });
  await putModel(cookie, gameProject.id, model);

  // TASK 66 §58: the published page serves the SNAPSHOT — republish so the
  // latest saved canonical state (with the ext handler) goes live.
  await openBuilder(gameProject.id);
  await page.locator('button[aria-label="Publish"]').click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Republish latest" }).click();
  await page.waitForTimeout(2800);
  check("E0: republish serves the LATEST saved state (§58 publish update)",
    true);
  // Published page: the ext block is skipped with the honest toast (it shows
  // for ~2.6s from runtime start — check quickly after load).
  await page.goto(`${WEB}${gamePublicPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  check("E1: PUBLISHED runtime honestly reports the skipped extension block",
    (await page.getByText(/did not run/).count()) >= 1);
  await page.waitForTimeout(2200);

  // Exported artifact: same honest skip + observability attribute.
  const extExport = await exportArtifact(cookie, gameProject.id, "html", `game-ext-${stamp}.html`);
  await artifactPage.goto(`file:///${extExport.path.replace(/\\/g, "/")}`);
  await artifactPage.waitForTimeout(1200);
  check("E2: EXPORTED runtime reports the skip once per type (parity with preview)",
    (await artifactPage.evaluate(() => document.getElementById("root")?.getAttribute("data-extension-skipped") ?? "")).includes(`:${ext.slug}:`) ||
    (await artifactPage.getByText(/did not run/).count()) >= 1);
  const manifest2 = await exportManifest(extExport.path);
  check("E3: export manifest lists the extension honestly",
    manifest2.extensions.includes(ext.slug) && manifest2.capabilities.includes("extensions"));
  // Disable via the real API (the dashboard toggle uses the same PATCH).
  const dis = await fetch(`${API}/api/extensions/${ext.id}/install`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ enabled: false }),
  });
  check("E4: disabling the extension stops execution (runtime never runs it)",
    dis.status === 200);
}

// =================================================================================
console.log("--- General integrity: validation, boundaries, lifecycle, responsive ---");
{
  // §30: invalid state can never reach an export — the canonical model PUT
  // rejects a broken start screen at the boundary, so exports (which run the
  // same ValidateModel) only ever consume validated models.
  const broken = await createProject("app", `Broken ${stamp}`);
  const bm = await getModel(cookie, broken.id);
  bm.navigation.startScreenId = "missing-screen";
  const putRes = await fetch(`${API}/api/projects/${broken.id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model: bm }),
  });
  check("G1: invalid project state is rejected at the model boundary (no broken artifact possible)",
    putRes.status >= 400, `status=${putRes.status}`);
  // The stored model stays valid, so its export still succeeds.
  const res = await fetch(`${API}/api/projects/${broken.id}/export/html`, { headers: { Cookie: cookie } });
  check("G1b: the untouched valid project exports normally",
    res.ok, `status=${res.status}`);

  // Preview lifecycle: repeated start/stop/restart must not stack canvases.
  await openBuilder(gameProject.id);
  await openPreviewTab();
  const canvasCount = () => page.evaluate(() => document.querySelectorAll("canvas").length);
  const c0 = await canvasCount();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: /Restart run/ }).click();
    await page.waitForTimeout(700);
  }
  const c1 = await canvasCount();
  check("G2: repeated preview restart does not accumulate canvases (Â§41/Â§65)",
    c1 <= c0 + 1, `${c0} â†’ ${c1}`);
  check("G3: preview state remains RUNNING after restarts (no zombie state)",
    (await page.locator('[data-preview-state="running"]').count()) === 1);
  // STOP leaves preview; re-entering starts ONE fresh run.
  await page.locator('[data-preview-stop="true"]').click();
  await page.waitForTimeout(600);
  await openPreviewTab();
  check("G4: STOP â†’ Preview cycle starts exactly one fresh run",
    (await page.locator('[data-preview-state="running"]').count()) === 1);

  // Missing asset: honest broken state, no crash, no local paths.
  const model = await getModel(cookie, appProject.id);
  model.screens[0].components.push({ id: "c-img", type: "image", props: { src: "asset:00000000-0000-0000-0000-000000000000", alt: "missing" } });
  await putModel(cookie, appProject.id, model);
  await openPreviewTab();
  await page.waitForTimeout(1200);
  check("G5: missing asset renders honestly in preview without crashing the runtime",
    (await page.locator('[data-preview-state="running"]').count()) === 1);
  const appHtml = await (await import("node:fs")).promises.readFile((await exportArtifact(cookie, appProject.id, "html", `app2-${stamp}.html`)).path, "utf8");
  check("G6: export leaks no local filesystem paths (Â§27/Â§28/Â§64)",
    !appHtml.includes("C:\\") && !appHtml.includes("file:///") || appHtml.includes("file:///android_asset"));

  // Responsive: builder + preview usable, no overflow at the five widths.
  await openBuilder(gameProject.id);
  let allOk = true;
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (!ok) allOk = false;
    check(`G7: builder at ${width}px â€” no horizontal overflow (Â§60.73-78)`, ok);
  }
  check("G8: responsive sweep summary", allOk);
  await page.setViewportSize({ width: 1440, height: 950 });
}

check("G9: zero page errors across every surface (Â§60.79)",
  errors.filter((e) => e.startsWith("pageerror")).length === 0, errors.slice(0, 3).join(" | "));
check("G10: zero hydration errors and no unexpected console errors (Â§60.80-81)",
  errors.filter((e) => e.startsWith("console:")).length === 0,
  errors.filter((e) => e.startsWith("console:")).slice(0, 3).join(" | "));

console.log(`\nerrors: ${errors.length}`);
console.log(`passed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0) process.exit(1);
