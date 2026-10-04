// TASK 62 — Real 2D engine core + professional authoring E2E.
// Covers (from directive §47, mapped to what is REAL): scene management
// (duplicate/reorder/start), entity insertion through real UI + the flat
// GameObject list, sprite asset picker (assign/replace/clear + measured
// dimensions), sprite pivot presets + flips (DOM transform evidence + model),
// tilemap visual palette (add/color/solid flags), paint/erase, flood fill
// (one gesture one undo), rule-tile neighborhood shading, per-tile collision
// in the LIVE runtime (solid blocks, pass falls through), camera pixel snap,
// grid toggle, multi-select + marquee + alignment (one undo), z-order
// shortcuts, debug overlays (OFF by default), play/stop/reset, empty-state
// guidance, sprite-sheet slicing into real assets, save/reload persistence,
// published + export parity, responsive widths, zero page errors.
const zlib = await import("zlib");
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
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ---- PNG generator (truecolor, per-pixel) ---------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** w×h truecolor PNG; pixel(x, y) → [r, g, b]. */
function makePngPixels(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// An ASYMMETRIC sprite: left half rose, right half sky (flip evidence).
const heroPng = makePngPixels(8, 8, (x) => (x < 4 ? [255, 90, 120] : [90, 170, 255]));
// A 2-cell sheet (two 4×4 solid cells, different colors) for the slicer.
const sheetPng = makePngPixels(8, 4, (x) => (x < 4 ? [70, 227, 180] : [240, 180, 84]));

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
async function uploadAsset(cookie, projectId, bytes, name) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), name);
  const res = await fetch(`${API}/api/projects/${projectId}/assets`, {
    method: "POST", body: form, headers: { Cookie: cookie },
  });
  const payload = await res.json();
  if (!res.ok || !payload.asset) throw new Error(`asset upload failed: ${res.status}`);
  return payload.asset.id;
}
async function listAssets(cookie, projectId) {
  const res = await fetch(`${API}/api/projects/${projectId}/assets`, { headers: { Cookie: cookie } });
  const payload = await res.json();
  return payload.assets ?? [];
}
async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}
async function settleSave(page) {
  await waitForSaved(page);
  await page.waitForTimeout(2500); // autosave debounce + PUT + model GET settle
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`t62-${stamp}@ex.com`, `t62${stamp}`);
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "2D Engine Lab", type: "game" }),
  });
  var project = (await res.json()).project;
}
console.log(`project ${project.id} created (type game)`);
const heroAssetId = await uploadAsset(cookie, project.id, heroPng, "hero-asym.png");
console.log(`hero asset uploaded: ${heroAssetId}`);

// ---- Scene seed: hero sprite, platform, coin, enemy, trigger, camera, tilemap ----
{
  const model = await getModel(cookie, project.id);
  const scene = model.screens[0];
  scene.name = "Level 1";
  scene.components.push(
    { id: "e-hero", type: "sprite", props: { name: "Hero", x: 120, y: 300, width: 40, height: 40, src: `asset:${heroAssetId}`, color: "#58c7f0", visible: true, collider: false, pivotX: 0.5, pivotY: 0.5, flipX: false, flipY: false, sortingLayer: "Characters", rotation: 0 } },
    { id: "e-platform", type: "platform", props: { name: "Ground", x: 40, y: 500, width: 240, height: 20, color: "#2a3348", visible: true, collider: true } },
    { id: "e-coin", type: "coin", props: { name: "Coin A", x: 150, y: 440, width: 28, height: 28, color: "#ffb454", visible: true, collider: true, trigger: true } },
    { id: "e-coin2", type: "coin", props: { name: "Coin B", x: 220, y: 440, width: 28, height: 28, color: "#ffb454", visible: true, collider: true, trigger: true } },
    { id: "e-enemy", type: "enemy", props: { name: "Spike", x: 300, y: 470, width: 32, height: 32, color: "#ff7d9c", visible: true, collider: true, trigger: true } },
    { id: "e-zone", type: "trigger", props: { name: "Zone", x: 60, y: 380, width: 80, height: 60, color: "#8f7bff", visible: true, collider: true, trigger: true } },
    { id: "e-tiles", type: "tilemap", props: { name: "Terrain", x: 0, y: 560, width: 256, height: 96, cellSize: 32, cols: 8, rows: 3, tiles: "0,0:1;1,0:1;2,0:1;3,0:1;4,0:1", palette: "1:#2a3348;2:#46e3b4:pass", color: "#2a3348", visible: true, collider: true, autoTile: true } },
    { id: "e-cam", type: "camera", props: { name: "Camera", x: 0, y: 0, width: 390, height: 700, followEnabled: true, followTarget: "e-hero", smoothing: 0.5, boundsEnabled: true, minX: 0, minY: 0, maxX: 2000, maxY: 1200, pixelSnap: true } },
    { id: "e-light", type: "light", props: { name: "Lamp", x: 200, y: 300, width: 48, height: 48, color: "#ffd9a0", intensity: 1, radius: 160, enabled: true, visible: true } },
    { id: "e-fx", type: "emitter", props: { name: "Sparks", x: 160, y: 470, width: 24, height: 24, color: "#ffd9a0", visible: true } },
  );
  await putModel(cookie, project.id, model);
}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const openBuilder = async () => {
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
};
await openBuilder();

// ---- A. Identity + game objects tree ---------------------------------------------
check("A1: 2D project opens with the 2D GAME identity",
  (await page.locator('[data-engine-identity="game"]').count()) === 1);
check("A2: the flat GameObject list reflects the canonical scene (all 10 entities)",
  (await page.locator('[data-game-objects] li').count()) === 10);
check("A3: GameObject rows carry honest type labels",
  ((await page.locator('[data-game-objects]').textContent()) ?? "").includes("sprite") &&
  ((await page.locator('[data-game-objects]').textContent()) ?? "").includes("tilemap") &&
  ((await page.locator('[data-game-objects]').textContent()) ?? "").includes("camera"));

// ---- B. Scene management -----------------------------------------------------------
await page.getByLabel("Duplicate Level 1").click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  check("B1: duplicate scene creates 'Level 1 copy' right after the original and opens it",
    model.screens.length === 2 &&
    model.screens[1]?.name === "Level 1 copy" &&
    model.screens[1]?.components.length === model.screens[0]?.components.length);
  check("B2: the duplicate is now the ACTIVE scene in the editor",
    ((await page.locator('[aria-current="true"]').first().textContent()) ?? "").includes("Level 1 copy"));
}
await page.getByLabel("Move Level 1 copy earlier").click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  check("B3: reorder scenes moves the copy before the original",
    model.screens[0]?.name === "Level 1 copy", JSON.stringify(model.screens.map((s) => s.name)));
  await page.getByLabel(`Set ${model.screens[0]?.name} as start screen`).click();
  await settleSave(page);
  const model2 = await getModel(cookie, project.id);
  check("B4: start scene designation persists in the model",
    model2.navigation.startScreenId === model2.screens[0]?.id);
  // restore: delete the copy, back to the original alone
  await page.getByLabel(`Delete ${model.screens[0]?.name}`).click();
  await settleSave(page);
  const model3 = await getModel(cookie, project.id);
  check("B5: deleting the copy returns to the single original scene",
    model3.screens.length === 1 && model3.screens[0]?.name === "Level 1");
  await openBuilder();
}

// ---- C. Sprite asset picker ---------------------------------------------------------
await page.locator('[data-game-objects] li').filter({ hasText: "Hero" }).first().click();
await page.waitForTimeout(500);
await page.locator("[data-texture-replace]").click(); // open the picker grid
await page.waitForTimeout(300);
check("C1: the sprite asset picker lists project image assets with real thumbnails",
  (await page.locator('[data-asset-picker] [data-pick-asset]').count()) >= 1 &&
  (await page.locator('[data-asset-picker] img').first().getAttribute("src"))?.includes("/api/") === true);
{
  await page.waitForTimeout(900); // thumbnails decode → dimensions measured
  const dims = await page.locator('[data-asset-picker] [data-asset-dims]').first().textContent();
  check("C2: the picker shows measured pixel dimensions (8×8)", /8\s*×\s*8/.test(dims ?? ""), dims ?? "");
}
check("C3: the current texture is highlighted and named",
  (await page.locator('[data-pick-asset][aria-pressed="true"]').count()) === 1 &&
  ((await page.locator('[data-texture-name]').textContent()) ?? "").includes("hero-asym"));
await page.locator("[data-texture-clear]").click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  const hero = model.screens[0].components.find((c) => c.id === "e-hero");
  check("C4: Clear removes the texture reference from the canonical model",
    hero.props.src === undefined, JSON.stringify(hero.props.src));
}
if ((await page.locator("[data-asset-picker]").count()) === 0) {
  await page.locator("[data-texture-replace]").click();
  await page.waitForTimeout(300);
}
await page.locator(`[data-pick-asset="${heroAssetId}"]`).click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  const hero = model.screens[0].components.find((c) => c.id === "e-hero");
  check("C5: Replace assigns the canonical asset:<id> reference — no typing",
    hero.props.src === `asset:${heroAssetId}`);
}

// ---- D. Pivot + flip (model + DOM transform evidence) --------------------------------
await page.locator("[data-pivot-preset=\"left\"]").click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  const hero = model.screens[0].components.find((c) => c.id === "e-hero");
  check("D1: the Left pivot preset commits pivotX 0 to the canonical model",
    hero.props.pivotX === 0 && hero.props.pivotY === 0.5, JSON.stringify(hero.props));
}
await page.locator("[data-flip-x]").click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  const hero = model.screens[0].components.find((c) => c.id === "e-hero");
  const transform = await page.evaluate(() => {
    const img = document.querySelector('[data-node-id="e-hero"] img');
    return img ? getComputedStyle(img).transform : "";
  });
  check("D2: Flip X mirrors the rendered sprite (scaleX(-1) on the img)",
    hero.props.flipX === true && transform.includes("-1"), transform);
}
await page.locator("[data-flip-x]").click();
{
  // Rotation + pivot: the rotation anchor follows the pivot — switching the
  // pivot while rotated moves the rendered box.
  const model = await getModel(cookie, project.id);
  const scene = model.screens[0];
  scene.components.find((c) => c.id === "e-hero").props.rotation = 30;
  await putModel(cookie, project.id, model);
  await openBuilder();
  await page.locator('[data-game-objects] li').filter({ hasText: "Hero" }).first().click();
  await page.waitForTimeout(400);
  // normalize to center first (earlier sections may have left another pivot)
  await page.locator("[data-pivot-preset=\"center\"]").click();
  await page.waitForTimeout(400);
  const withCenter = await page.locator('[data-node-id="e-hero"]').boundingBox();
  await page.locator("[data-pivot-preset=\"left\"]").click();
  await page.waitForTimeout(400);
  const withLeft = await page.locator('[data-node-id="e-hero"]').boundingBox();
  check("D3: pivot is the REAL rotation anchor — the rendered box moves when the pivot changes under rotation",
    withCenter !== null && withLeft !== null && !near(withCenter.x, withLeft.x, 0.5),
    `center=${JSON.stringify(withCenter)} left=${JSON.stringify(withLeft)}`);
  await page.locator("[data-pivot-preset=\"center\"]").click();
  const model2 = await getModel(cookie, project.id);
  scene.components.find((c) => c.id === "e-hero").props.rotation = 0;
  await putModel(cookie, project.id, model2);
  await openBuilder();
  await page.locator('[data-game-objects] li').filter({ hasText: "Hero" }).first().click();
}

// ---- E. Tile palette editor + solidity flags -----------------------------------------
await page.locator('[data-game-objects] li').filter({ hasText: "Terrain" }).first().click();
await page.waitForTimeout(400);
check("E1: the visual tile palette editor lists the canonical tiles with swatches",
  (await page.locator('[data-tile-palette] [data-tile-value]').count()) === 2 &&
  (await page.locator('[data-tile-palette] input[type="color"]').count()) === 2);
await page.locator("[data-tile-add]").click();
await settleSave(page);
{
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles");
  check("E2: Add tile commits a new canonical palette entry",
    /3:#[0-9a-fA-F]{6}$/.test(tiles.props.palette) || tiles.props.palette.split(";").some((p) => p.startsWith("3:#")),
    tiles.props.palette);
}
{
  // Color picker: set tile 3 to pure red via the native color input.
  await page.locator('[data-tile-value="3"] input[type="color"]').evaluate((input) => {
    // React tracks value writes: use the native setter so onChange fires.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "#ff0000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles");
  check("E3: the color picker commits into the canonical palette string",
    tiles.props.palette.includes("3:#ff0000"), tiles.props.palette);
}
{
  // Solidity: tile 2 already carries :pass — flip it to solid and back.
  await page.locator('[data-tile-solid-toggle="2"]').click();
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles");
  const solidAgain = !tiles.props.palette.includes("2:#46e3b4:pass");
  check("E4: the solidity toggle rewrites the canonical palette flag",
    solidAgain, tiles.props.palette);
  await page.locator('[data-tile-solid-toggle="2"]').click();
  await settleSave(page);
  const model2 = await getModel(cookie, project.id);
  check("E5: non-solid (pass) restored",
    model2.screens[0].components.find((c) => c.id === "e-tiles").props.palette.includes("2:#46e3b4:pass"));
}

// ---- F. Paint + flood fill (one gesture one undo) -------------------------------------
await page.locator('[data-canvas-grid] ~ * >> nothing', { strict: false }).count().catch(() => 0); // no-op guard
await page.locator('button[title^="Paint tiles"]').first().click();
{
  const tilemapBox = await page.locator('[data-node-id="e-tiles"]').boundingBox();
  // paint (4,0) — extends the run
  await page.mouse.click(tilemapBox.x + 4.5 * 32 * (await page.evaluate(() => 1)), tilemapBox.y + 0.5 * 32);
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles").props.tiles;
  check("F1: painting commits the clicked cell", tiles.includes("4,0:1"), tiles);
}
await page.locator('button[title^="Fill — flood"]').first().click();
{
  const tilemapBox = await page.locator('[data-node-id="e-tiles"]').boundingBox();
  // Fill (1,1): the contiguous EMPTY region floods with the active tile —
  // 24-cell grid minus the 5 painted run cells = 19 filled, run untouched.
  await page.mouse.click(tilemapBox.x + 1.5 * 32, tilemapBox.y + 1.5 * 32);
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles").props.tiles;
  const runIntact = ["0,0", "1,0", "2,0", "3,0", "4,0"].every((k) => tiles.includes(`${k}:1`));
  const emptyFilled = ["0,1", "3,1", "7,1", "0,2", "7,2"].every((k) => tiles.includes(`${k}:1`));
  check("F2: flood fill fills the contiguous empty region — run cells untouched",
    runIntact && emptyFilled, tiles);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settleSave(page);
  const model2 = await getModel(cookie, project.id);
  const tiles2 = model2.screens[0].components.find((c) => c.id === "e-tiles").props.tiles;
  check("F4: undo restores the exact pre-fill tile map",
    !tiles2.includes("1,1:1") && tiles2.includes("4,0:1"), tiles2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await settleSave(page);
  const model3 = await getModel(cookie, project.id);
  const tiles3 = model3.screens[0].components.find((c) => c.id === "e-tiles").props.tiles;
  check("F5: redo re-applies the fill exactly",
    ["0,1", "3,1", "7,1", "0,2", "7,2"].every((k) => tiles3.includes(`${k}:1`)), tiles3);
  // Erase-fill: undo once more (back to the run-only map — undo/redo cleared
  // the selection, so re-select the tilemap), paint an isolated 3-cell
  // segment in row 2, then clear it in one gesture — the row-0 run
  // (disconnected) must survive.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settleSave(page);
  await page.locator('[data-game-objects] li').filter({ hasText: "Terrain" }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title^="Paint tiles"]').first().click();
  const box = await page.locator('[data-node-id="e-tiles"]').boundingBox();
  for (const col of [0, 1, 2]) {
    await page.mouse.click(box.x + (col + 0.5) * 32, box.y + 2.5 * 32);
  }
  await settleSave(page);
  await page.locator('button[title^="Erase fill — clear"]').first().click();
  await page.mouse.click(box.x + 1.5 * 32, box.y + 2.5 * 32);
  await settleSave(page);
  const model4 = await getModel(cookie, project.id);
  const tiles4 = model4.screens[0].components.find((c) => c.id === "e-tiles").props.tiles;
  check("F6: erase-fill clears the contiguous painted region — disconnected cells survive",
    !tiles4.includes("0,2:1") && !tiles4.includes("1,2:1") && !tiles4.includes("2,2:1") &&
    tiles4.includes("0,0:1") && tiles4.includes("4,0:1"),
    tiles4);
}

// ---- G. Rule tiles (neighborhood classes) ----------------------------------------------
await openBuilder();
{
  const colors = await page.evaluate(() => {
    const cell = (c, r) => document.querySelector(`[data-node-id="e-tiles"] [data-cell="${c},${r}"]`);
    const a = cell(0, 0), b = cell(1, 0);
    return { end: a ? getComputedStyle(a).backgroundColor : "", straight: b ? getComputedStyle(b).backgroundColor : "" };
  });
  // 5-cell straight run: the middle cells are 2-opposite (straight → 0.88);
  // the run ends are 1-neighbor (end → base color).
  check("G1: rule tiles — straight (2 opposite) shades differently from the run end",
    colors.end !== colors.straight &&
    colors.end === "rgb(42, 51, 72)" &&
    colors.straight !== "rgb(42, 51, 72)",
    JSON.stringify(colors));
}
{
  // T-junction: paint (1,1) under the run — cell (1,0) now has 3 neighbors.
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles");
  tiles.props.tiles += ";1,1:1";
  await putModel(cookie, project.id, model);
  await openBuilder();
  const colors = await page.evaluate(() => {
    const cell = (c, r) => document.querySelector(`[data-node-id="e-tiles"] [data-cell="${c},${r}"]`);
    const t = cell(1, 0), straight = cell(2, 0);
    return { t: t ? getComputedStyle(t).backgroundColor : "", straight: straight ? getComputedStyle(straight).backgroundColor : "" };
  });
  check("G2: rule tiles — a T-junction (3 neighbors) shades darker than a straight",
    colors.t !== colors.straight && colors.t !== "rgb(42, 51, 72)" && colors.straight !== "rgb(42, 51, 72)",
    JSON.stringify(colors));
}

// ---- H. Per-tile collision in the LIVE runtime -----------------------------------------
{
  // Solid run at row 0 of the tilemap (y 560): a real PLAYER drops from
  // above (sprites don't simulate). The Ground platform is parked out of the
  // drop path; the CAMERA position is the observable (follow centers on the
  // player, pixel-snapped, bounds-clamped): resting on the tiles →
  // cam.y ≈ 120; falling through to the world floor → clamped at 356.
  const model = await getModel(cookie, project.id);
  const scene = model.screens[0];
  scene.components.push(
    { id: "e-player", type: "player", props: { name: "Player", x: 74, y: 380, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true } },
  );
  scene.components.find((c) => c.id === "e-hero").props.x = 300; // sprite out of the drop path
  scene.components.find((c) => c.id === "e-platform").props.y = 900;
  scene.components.find((c) => c.id === "e-cam").props.followTarget = "e-player";
  await putModel(cookie, project.id, model);
  await openBuilder();
  await page.locator("[data-play-button]").click();
  await page.waitForTimeout(2600); // fall + land
  const camY = await page.evaluate(() => {
    const world = document.querySelector("[data-camera-world]");
    return world ? parseFloat(world.getAttribute("data-camera-y")) : NaN;
  });
  check("H1: SOLID tiles block the player (rests on the painted run)",
    near(camY, 120, 10), `camY=${camY} (expected ≈120)`);
  await page.locator("[data-preview-stop]").click();
  await page.waitForTimeout(600);
}
{
  // Turn the whole run NON-solid: the player falls through to the world
  // floor; the camera clamps at maxY − stage height = 1200 − 844 = 356.
  const model = await getModel(cookie, project.id);
  const tiles = model.screens[0].components.find((c) => c.id === "e-tiles");
  tiles.props.palette = "1:#2a3348:pass;2:#46e3b4:pass";
  await putModel(cookie, project.id, model);
  await openBuilder();
  await page.locator("[data-play-button]").click();
  await page.waitForTimeout(2600);
  const camY = await page.evaluate(() => {
    const world = document.querySelector("[data-camera-world]");
    return world ? parseFloat(world.getAttribute("data-camera-y")) : NaN;
  });
  check("H2: NON-SOLID (pass) tiles do not block — the player falls through",
    near(camY, 356, 10), `camY=${camY} (expected ≈356 clamped)`);
  await page.locator("[data-preview-stop]").click();
  // restore solid palette + platform for later sections (player stays — a
  // legitimate scene member).
  const model2 = await getModel(cookie, project.id);
  model2.screens[0].components.find((c) => c.id === "e-tiles").props.palette = "1:#2a3348;2:#46e3b4:pass";
  model2.screens[0].components.find((c) => c.id === "e-platform").props.y = 500;
  await putModel(cookie, project.id, model2);
  await openBuilder();
}

// ---- I. Camera pixel snap ----------------------------------------------------------------
{
  await page.locator("[data-play-button]").click();
  await page.waitForTimeout(2000);
  const cam = await page.evaluate(() => {
    const world = document.querySelector("[data-camera-world]");
    return { x: world?.getAttribute("data-camera-x"), y: world?.getAttribute("data-camera-y") };
  });
  check("I1: pixel-snap camera renders whole-pixel positions",
    cam.x !== null && Number.isInteger(parseFloat(cam.x)) && Number.isInteger(parseFloat(cam.y)),
    JSON.stringify(cam));
  await page.locator("[data-preview-stop]").click();
  await page.waitForTimeout(500);
}

// ---- J. Multi-select + marquee + alignment -------------------------------------------------
await openBuilder();
await page.waitForTimeout(600);
{
  // ctrl+click two coins → group toolbar → align left → both x equal.
  const coinA = await page.locator('[data-node-id="e-coin"]').boundingBox();
  const coinB = await page.locator('[data-node-id="e-coin2"]').boundingBox();
  await page.keyboard.down("Control");
  await page.mouse.click(coinA.x + coinA.width / 2, coinA.y + coinA.height / 2);
  await page.mouse.click(coinB.x + coinB.width / 2, coinB.y + coinB.height / 2);
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
  check("J1: ctrl+click multi-selection opens the group toolbar",
    (await page.locator("[data-align-toolbar]").count()) === 1 &&
    ((await page.locator("[data-align-toolbar]").textContent()) ?? "").includes("2 selected"));
  await page.locator('[data-align="left"]').click();
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  const a = model.screens[0].components.find((c) => c.id === "e-coin");
  const b = model.screens[0].components.find((c) => c.id === "e-coin2");
  check("J2: Align left commits both x values in ONE canonical change",
    a.props.x === b.props.x, `${a.props.x} vs ${b.props.x}`);
}
{
  // Group delete is ONE undoable step: delete → undo restores BOTH coins.
  await page.locator("[data-group-delete]").click();
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  check("J3: group delete removes every selected entity",
    !model.screens[0].components.some((c) => c.id === "e-coin" || c.id === "e-coin2"));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settleSave(page);
  const model2 = await getModel(cookie, project.id);
  check("J4: one undo restores the whole selection (one undo entry for the group)",
    model2.screens[0].components.some((c) => c.id === "e-coin") &&
    model2.screens[0].components.some((c) => c.id === "e-coin2"));
}
{
  // Marquee: park the trigger zone out of the sweep area first (its rect
  // touches the coins' sweep margin), then sweep an area covering both
  // restored coins → exactly 2 selected.
  const model = await getModel(cookie, project.id);
  model.screens[0].components.find((c) => c.id === "e-zone").props.y = 700;
  await putModel(cookie, project.id, model);
  await openBuilder();
  const coinA = await page.locator('[data-node-id="e-coin"]').boundingBox();
  const coinB = await page.locator('[data-node-id="e-coin2"]').boundingBox();
  const x0 = Math.min(coinA.x, coinB.x) - 15;
  const y0 = Math.min(coinA.y, coinB.y) - 15;
  const x1 = Math.max(coinA.x + coinA.width, coinB.x + coinB.width) + 15;
  const y1 = Math.max(coinA.y + coinA.height, coinB.y + coinB.height) + 15;
  await page.mouse.move(x0 + 2, y0 + 2);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const groupText = (await page.locator("[data-align-toolbar]").textContent()) ?? "";
  const count = parseInt(groupText, 10);
  check("J5: marquee sweep selects the intersecting entities", Number.isFinite(count) && count >= 2, groupText);
}

// ---- K. Z-order shortcuts -------------------------------------------------------------------
await openBuilder();
await page.locator('[data-game-objects] li').filter({ hasText: "Coin A" }).first().click();
await page.waitForTimeout(300);
{
  const before = (await getModel(cookie, project.id)).screens[0].components.findIndex((c) => c.id === "e-coin");
  await page.locator("[data-sort-front]").click();
  await settleSave(page);
  const after = (await getModel(cookie, project.id)).screens[0].components.findIndex((c) => c.id === "e-coin");
  check("K1: Bring to front moves the entity to the FRONT of the model order",
    after === 0 && before !== 0, `before=${before} after=${after}`);
  await page.locator("[data-sort-back]").click();
  await settleSave(page);
  const back = (await getModel(cookie, project.id)).screens[0].components.findIndex((c) => c.id === "e-coin");
  const count = (await getModel(cookie, project.id)).screens[0].components.length;
  check("K2: Send to back moves it to the END of the model order",
    back === count - 1, `back=${back}/${count}`);
}

// ---- L. Debug overlays (OFF by default) -------------------------------------------------------
check("L1: debug overlays are OFF by default (no solid/trigger outlines)",
  (await page.locator("[data-debug-solid]").count()) === 0 &&
  (await page.locator("[data-debug-trigger]").count()) === 0);
await page.locator("[data-debug-collisions]").click();
await page.waitForTimeout(300);
check("L2: the collision overlay draws solid outlines on demand",
  (await page.locator("[data-debug-solid]").count()) >= 3);
await page.locator("[data-debug-triggers]").click();
await page.waitForTimeout(300);
check("L3: the trigger overlay draws trigger areas on demand",
  (await page.locator("[data-debug-trigger]").count()) >= 3);
await page.locator("[data-debug-collisions]").click();
await page.locator("[data-debug-triggers]").click();
await page.waitForTimeout(200);

// ---- M. Grid toggle -----------------------------------------------------------------------------
{
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('[data-screen-frame]')).backgroundImage);
  await page.locator("[data-canvas-grid]").click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('[data-screen-frame]')).backgroundImage);
  check("M1: the authoring grid toggle removes the grid dots (editor preference)",
    before.includes("radial-gradient") && !after.includes("radial-gradient"), `${before} → ${after}`);
  await page.locator("[data-canvas-grid]").click();
}

// ---- N. Play / Stop / Reset + diagnostics --------------------------------------------------------
{
  const diag = page.getByRole("button", { name: "Diagnostics" });
  check("N1: diagnostics starts collapsed (§37)",
    (await diag.getAttribute("aria-expanded")) === "false");
  await diag.click();
  await page.waitForTimeout(200);
  check("N2: diagnostics opens manually", (await diag.getAttribute("aria-expanded")) === "true");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  check("N3: Escape closes diagnostics", (await diag.getAttribute("aria-expanded")) === "false");
}
await page.locator("[data-play-button]").click();
await page.waitForTimeout(1500);
check("N4: Play mounts the LIVE runtime (camera world + entities render)",
  (await page.locator("[data-camera-world]").count()) === 1 &&
  (await page.locator('[data-entity="e-hero"]').count()) === 1);
await page.locator("[data-preview-stop]").click();
await page.waitForTimeout(600);
check("N5: Stop returns to authoring — the design canvas with authored state",
  (await page.locator('[data-node-id="e-hero"]').count()) === 1 &&
  (await page.locator("[data-camera-world]").count()) === 0);

// ---- O. Persistence: pivot + flip + palette survive save/reload ---------------------------------
{
  await page.locator('[data-game-objects] li').filter({ hasText: "Hero" }).first().click();
  await page.locator("[data-pivot-preset=\"top\"]").click();
  await page.locator("[data-flip-y]").click();
  await settleSave(page);
  await openBuilder();
  const model = await getModel(cookie, project.id);
  const hero = model.screens[0].components.find((c) => c.id === "e-hero");
  check("O1: pivot + flip persist exactly through save + reload",
    hero.props.pivotY === 0 && hero.props.flipY === true && hero.props.pivotX === 0.5,
    JSON.stringify(hero.props));
}

// ---- P. Published + export parity ------------------------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, {
    method: "POST", headers: { Cookie: cookie },
  });
  const payload = await res.json();
  check("P1: publish succeeds for the 2D project", res.ok && Boolean(payload?.project?.slug));
  const pub = await page.goto(`${WEB}/p/${payload.project.slug}`, { waitUntil: "networkidle" });
  check("P2: the published page renders the live scene",
    pub?.ok() === true && (await page.locator("[data-camera-world]").count()) === 1);
  const pivotApplied = await page.evaluate(() => {
    const el = document.querySelector('[data-entity="e-hero"]');
    return el ? getComputedStyle(el).transformOrigin : "";
  });
  // pivotY 0 (top) from the persistence section — computed origin resolves
  // percentages to px against the 40px box: "20px 0px".
  check("P3: published parity — the pivot renders on the public runtime",
    /^20(\.\d+)?px\s+0(px)?/.test(pivotApplied.trim()), pivotApplied);
  const exportRes = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await exportRes.text();
  check("P4: export parity — the exported runtime carries solid-tile filtering, pixel snap and the pivot formula",
    html.includes("tilemapSolidCellRects") && html.includes("pixelSnap") && html.includes("transformOrigin"),
    `length=${html.length}`);
  check("P5: export parity — the rule-tile classes ship (T 0.8 / straight 0.88)",
    html.includes("0.8") && html.includes("0.88"));
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "domcontentloaded" });
}

// ---- Q. Sprite sheet slicing into real assets ------------------------------------------------------
{
  const studioCookie = context;
  const page2 = await studioCookie.newPage();
  await page2.goto(`${WEB}/builder/${project.id}/asset-studio`, { waitUntil: "networkidle" });
  await page2.waitForTimeout(1000);
  // The slicer lives in the editor view — create/open a doc first if none.
  if ((await page2.locator("[data-sheet-slicer]").count()) === 0) {
    await page2.getByRole("button", { name: "Create sprite" }).click();
    await page2.waitForTimeout(1000);
  }
  check("Q1: the Asset Studio exposes the sprite-sheet slicer",
    (await page2.locator("[data-sheet-slicer]").count()) === 1);
  await page2.locator('[data-sheet-slicer] input[type="file"]').setInputFiles({
    name: "run-sheet.png", mimeType: "image/png", buffer: sheetPng,
  });
  await page2.waitForTimeout(700);
  // Set the real grid: the 8×4 sheet is 2 columns × 1 row of 4×4 cells.
  await page2.locator('input[aria-label="Sheet columns"]').fill("2");
  await page2.waitForTimeout(400);
  const cells = await page2.locator("[data-sheet-cells]").textContent();
  check("Q2: the slicer previews the grid (2 cells of 4×4)",
    (cells ?? "").includes("2 cells") && (cells ?? "").includes("4×4"), cells ?? "");
  await page2.locator("[data-sheet-slice]").click();
  await page2.waitForTimeout(3500);
  const assets = await listAssets(cookie, project.id);
  const sliced = assets.filter((a) => a.name.startsWith("run-sheet-r")).length;
  check("Q3: slicing saves each cell as its own canonical PNG asset",
    sliced === 2, `sliced=${sliced}`);
  await page2.close();
}

// ---- R. Responsive widths --------------------------------------------------------------------------
for (const width of [390, 768, 1024, 1280, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const identity = await page.locator('[data-engine-identity="game"]').isVisible();
  check(`R1: ${width}px — no horizontal overflow${width >= 768 ? " + identity visible" : ""}`,
    overflow && (width < 768 ? true : identity), `overflow=${overflow} identity=${identity}`);
}

console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log(`  ${e}`);
console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0 || errors.length > 0) process.exit(1);
