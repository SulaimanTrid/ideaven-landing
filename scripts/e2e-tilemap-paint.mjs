// Tilemap painting slice (SYSTEM 4, PHASE F continuation): the real UI path —
// add a tilemap, paint/erase cells by pointer, verify the canonical model,
// reload persistence, and per-cell collision in the preview runtime.
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
  const body = await res.json();
  return body.project.model;
}

async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`tilemap-${stamp}@ex.com`, `tilemap${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Tilemap Paint", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the coin-runner template`);

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ---- 1. Open the Play (scene) screen ----------------------------------------
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
check("scene stage open for the Play screen", await page.getByText(/scene · Play/).count() > 0);

// ---- 2. Add a tilemap through the palette -----------------------------------
await page.getByRole("button", { name: "Tilemap", exact: true }).click();
await page.waitForTimeout(600);
const tilemapNode = page.locator('[data-node-id]:has(> [data-tile-count])');
check("tilemap entity added to the design stage", await tilemapNode.count() === 1);

// ---- 3. Select it and switch to Paint ---------------------------------------
await tilemapNode.click();
await page.waitForTimeout(400);
const paintBtn = page.getByRole("button", { name: /Paint/ });
check("tilemap tools appear in the toolbar", await paintBtn.count() === 1);
await paintBtn.click();
await page.waitForTimeout(200);
check("paint tool engages", await paintBtn.getAttribute("aria-pressed") === "true");

const box = await tilemapNode.boundingBox();
const scale = box.width / 390; // tilemap default width is 390
const cellPx = 32 * scale;
const cellCenter = (col, row) => ({ x: box.x + (col + 0.5) * cellPx, y: box.y + (row + 0.5) * cellPx });

// ---- 4. Paint one cell by a real click --------------------------------------
const c11 = cellCenter(1, 1);
await page.mouse.click(c11.x, c11.y);
await page.waitForTimeout(400);
check("painted cell renders on the design canvas", await tilemapNode.locator('[data-cell="1,1"]').count() === 1);

// ---- 5. Paint a drag stroke (5,1 → 6,1) -------------------------------------
const c51 = cellCenter(5, 1), c61 = cellCenter(6, 1);
await page.mouse.move(c51.x, c51.y);
await page.mouse.down();
await page.mouse.move(c61.x, c61.y, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(400);
check("drag paints every cell it crosses", await tilemapNode.locator('[data-cell="5,1"]').count() === 1 && await tilemapNode.locator('[data-cell="6,1"]').count() === 1);

// ---- 6. The canonical model carries the cells -------------------------------
await waitForSaved(page);
let model = await getModel(cookie, project.id);
let play = model.screens.find((s) => s.id === "screen-play");
let tm = play.components.find((c) => c.type === "tilemap");
check("model holds the painted tilemap", Boolean(tm));
const tiles = String(tm?.props?.tiles ?? "");
check("model contains 1,1:1 from the click", tiles.includes("1,1:1"), `tiles="${tiles}"`);
check("model contains the drag stroke 5,1:1 and 6,1:1", tiles.includes("5,1:1") && tiles.includes("6,1:1"), `tiles="${tiles}"`);

// ---- 7. Erase a cell by a real click ----------------------------------------
await page.getByRole("button", { name: "⌫ Erase", exact: true }).click();
await page.waitForTimeout(200);
await page.mouse.click(c51.x, c51.y);
await page.waitForTimeout(400);
check("erased cell disappears from the canvas", await tilemapNode.locator('[data-cell="5,1"]').count() === 0);
await waitForSaved(page);
model = await getModel(cookie, project.id);
tm = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap");
const tiles2 = String(tm?.props?.tiles ?? "");
check("model drops 5,1:1 but keeps the rest", !tiles2.includes("5,1:1") && tiles2.includes("6,1:1") && tiles2.includes("1,1:1"), `tiles="${tiles2}"`);

// ---- 8. Hard reload — persistence -------------------------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
const tilemapNode2 = page.locator('[data-node-id]:has(> [data-tile-count])');
check("tilemap survives reload", await tilemapNode2.count() === 1);
check("painted cells survive reload (1,1 present, 5,1 gone)",
  await tilemapNode2.locator('[data-cell="1,1"]').count() === 1 && await tilemapNode2.locator('[data-cell="5,1"]').count() === 0);
model = await getModel(cookie, project.id);
const tiles3 = String(model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap")?.props?.tiles ?? "");
check("reloaded model still contains 1,1:1", tiles3.includes("1,1:1"), `tiles="${tiles3}"`);

// ---- 9. Multi-tile painting: pick tile 2 from the palette swatches ----------
await tilemapNode2.click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Tile 2", exact: true }).click();
await page.getByRole("button", { name: "▦ Paint", exact: true }).click();
await page.waitForTimeout(200);
let box2 = await tilemapNode2.boundingBox();
const scale2 = box2.width / 390;
let cellPx2 = 32 * scale2; // re-measured after the mid-test reload (§9f)
await page.mouse.click(box2.x + 4.5 * cellPx2, box2.y + 2.5 * cellPx2); // col 4, row 2
await page.waitForTimeout(400);
const cell42 = tilemapNode2.locator('[data-cell="4,2"]');
check("tile-2 cell paints on the design canvas", (await cell42.count()) === 1 && (await cell42.getAttribute("data-tile")) === "2");
const cellColor = await cell42.evaluate((el) => getComputedStyle(el).backgroundColor);
check("tile-2 cell renders in its palette color", cellColor === "rgb(143, 123, 255)", `color=${cellColor}`);
await waitForSaved(page);
model = await getModel(cookie, project.id);
const tiles4 = String(model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap")?.props?.tiles ?? "");
check("model carries the tile VALUE (4,2:2)", tiles4.includes("4,2:2"), `tiles="${tiles4}"`);

// ---- 9b. Rule tiles: a 3×3 block shades interior/edge/corner differently ----
// tile 2 palette color #8f7bff → interior ×0.72 rgb(103,89,184), edge ×0.86
// rgb(123,106,219), corner ×1 rgb(143,123,255). The block sits at cols 8-10,
// rows 3-5, clear of every other painted cell and template entity.
for (const row of [3, 4, 5]) {
  for (const col of [8, 9, 10]) {
    await page.mouse.click(box2.x + (col + 0.5) * cellPx2, box2.y + (row + 0.5) * cellPx2);
  }
}
await page.waitForTimeout(500);
const shadeOf = (col, row) => tilemapNode2.locator(`[data-cell="${col},${row}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);
const interior = await shadeOf(9, 4);
const edge = await shadeOf(9, 3);
const corner = await shadeOf(8, 3);
// TASK 62 rule-tile classes: cross (4) darkest, T (3) next, corner (2
// adjacent) / end (1) / isolated keep the base color.
check("auto-tile interior cell (4 neighbors) is darkest", interior === "rgb(103, 89, 184)", interior);
check("auto-tile T cell (3 neighbors) is intermediate", edge === "rgb(114, 98, 204)", edge);
check("auto-tile corner cell (2 neighbors) keeps the base color", corner === "rgb(143, 123, 255)", corner);
await waitForSaved(page);
model = await getModel(cookie, project.id);
const tilesBlock = String(model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap")?.props?.tiles ?? "");
check("model carries the 3×3 block (9,4:2)", tilesBlock.includes("9,4:2"), `tiles="${tilesBlock}"`);

// ---- 9c. Rule tiles one step at a time: painting a neighbor restyles the ------
// previous cell. The rule (scene.ts autoTileFactor, TASK 62): cross (4
// painted neighbors) darkest, T (3) shades 0.8, straight (2 opposite) shades
// 0.88, corner/end/isolated keep the base — so a cell flips base→T exactly
// when its 3rd neighbor lands. Row 0 is clear of every other painted cell.
// Tile 2 palette color #8f7bff = rgb(143,123,255); ×0.8 = rgb(114,98,204);
// ×0.88 = rgb(126,108,224).
const BASE_TILE2 = "rgb(143, 123, 255)";
const T_TILE2 = "rgb(114, 98, 204)";
const STRAIGHT_TILE2 = "rgb(126, 108, 224)";
await page.mouse.click(box2.x + 1.5 * cellPx2, box2.y + 0.5 * cellPx2); // col 1, row 0
await page.mouse.click(box2.x + 2.5 * cellPx2, box2.y + 0.5 * cellPx2); // col 2, row 0
await page.mouse.click(box2.x + 3.5 * cellPx2, box2.y + 0.5 * cellPx2); // col 3, row 0
await page.waitForTimeout(400);
check("run end (1 neighbor) and straight (2 opposite) shade distinctly from base",
  (await shadeOf(1, 0)) === BASE_TILE2 && (await shadeOf(2, 0)) === STRAIGHT_TILE2,
  `1,0=${await shadeOf(1, 0)} 2,0=${await shadeOf(2, 0)}`);
await page.mouse.click(box2.x + 2.5 * cellPx2, box2.y + 1.5 * cellPx2); // col 2, row 1 — 3rd neighbor of (2,0)
await page.waitForTimeout(400);
check("painting a neighbor restyles the previous cell (straight → T at 3 neighbors)",
  (await shadeOf(2, 0)) === T_TILE2, `2,0=${await shadeOf(2, 0)}`);
check("the newly painted neighbor keeps the base color (1 neighbor so far)",
  (await tilemapNode2.locator('[data-cell="2,1"]').count()) === 1 &&
  (await shadeOf(2, 1)) === BASE_TILE2, `2,1=${await shadeOf(2, 1)}`);
await waitForSaved(page);
model = await getModel(cookie, project.id);
tm = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap");
const tilesNeighbors = String(tm?.props?.tiles ?? "");
check("canonical model keeps the autoTile flag and BASE tile values (no baked variants)",
  tm?.props?.autoTile === true && tilesNeighbors.includes("2,0:2") && tilesNeighbors.includes("2,1:2"),
  `autoTile=${tm?.props?.autoTile} tiles="${tilesNeighbors}"`);

// ---- 9d. Undo/redo must restore the EXACT tile state across a restyle ---------
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved(page);
check("undo restores the exact previous canvas state (neighbor gone, survivor back to straight)",
  (await tilemapNode2.locator('[data-cell="2,1"]').count()) === 0 &&
  (await tilemapNode2.locator('[data-cell="2,0"]').count()) === 1 &&
  (await shadeOf(2, 0)) === STRAIGHT_TILE2, `2,0=${await shadeOf(2, 0)}`);
model = await getModel(cookie, project.id);
const tilesUndo = String(model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap")?.props?.tiles ?? "");
check("undo restores the exact previous canonical tiles", !tilesUndo.includes("2,1:2") && tilesUndo.includes("2,0:2"), `tiles="${tilesUndo}"`);

await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved(page);
check("redo restores the exact resulting canvas state (neighbor back, survivor T-shaded)",
  (await tilemapNode2.locator('[data-cell="2,1"]').count()) === 1 &&
  (await shadeOf(2, 0)) === T_TILE2 && (await shadeOf(2, 1)) === BASE_TILE2,
  `2,0=${await shadeOf(2, 0)} 2,1=${await shadeOf(2, 1)}`);
model = await getModel(cookie, project.id);
const tilesRedo = String(model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap")?.props?.tiles ?? "");
check("redo restores the exact resulting canonical tiles", tilesRedo.includes("2,0:2") && tilesRedo.includes("2,1:2"), `tiles="${tilesRedo}"`);

// ---- 9e. Hard reload — the rule-tiled region persists with the same variants --
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
check("rule-tiled cells survive reload (both present)",
  (await tilemapNode2.locator('[data-cell="2,0"]').count()) === 1 &&
  (await tilemapNode2.locator('[data-cell="2,1"]').count()) === 1);
check("reloaded rule-tiled cells render the same variants",
  (await shadeOf(2, 0)) === T_TILE2 && (await shadeOf(2, 1)) === BASE_TILE2,
  `2,0=${await shadeOf(2, 0)} 2,1=${await shadeOf(2, 1)}`);

// ---- 9f. Erasing a neighbor restyles the survivor (the reverse direction) -----
await tilemapNode2.click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "⌫ Erase", exact: true }).click();
await page.waitForTimeout(200);
box2 = await tilemapNode2.boundingBox();
cellPx2 = 32 * (box2.width / 390);
await page.mouse.click(box2.x + 2.5 * cellPx2, box2.y + 1.5 * cellPx2); // erase col 2, row 1
await page.waitForTimeout(400);
check("erasing the neighbor reverts the survivor to its base color",
  (await tilemapNode2.locator('[data-cell="2,1"]').count()) === 0 &&
  (await shadeOf(2, 0)) === STRAIGHT_TILE2, `2,0=${await shadeOf(2, 0)}`);
await waitForSaved(page);
model = await getModel(cookie, project.id);
const tilesErase = String(model.screens.find((s) => s.id === "screen-play").components.find((c) => c.type === "tilemap")?.props?.tiles ?? "");
check("model drops the erased neighbor but keeps the survivor", !tilesErase.includes("2,1:2") && tilesErase.includes("2,0:2"), `tiles="${tilesErase}"`);

// The Auto-tile edges checkbox is a real control: off = every cell renders its
// base palette color, on = the derived shading returns.
const autoTileToggle = page.getByLabel("Auto-tile edges");
await autoTileToggle.uncheck();
await page.waitForTimeout(400);
check("Auto-tile edges OFF renders every cell in its base color",
  (await shadeOf(9, 4)) === BASE_TILE2, `9,4=${await shadeOf(9, 4)}`);
await autoTileToggle.check();
await page.waitForTimeout(400);
check("Auto-tile edges ON restores the derived shading",
  (await shadeOf(9, 4)) === "rgb(103, 89, 184)", `9,4=${await shadeOf(9, 4)}`);
await waitForSaved(page);

// Restore the painting context for the landing-strip section below.
await page.getByRole("button", { name: "Tile 2", exact: true }).click();
await page.getByRole("button", { name: "▦ Paint", exact: true }).click();
await page.waitForTimeout(200);

// ---- 10. Paint a landing strip and drop the player onto it -------------------
await page.mouse.click(box2.x + 8.5 * cellPx2, box2.y + 1.5 * cellPx2); // col 8, row 1
await page.mouse.click(box2.x + 9.5 * cellPx2, box2.y + 1.5 * cellPx2); // col 9, row 1
await page.waitForTimeout(400);
check("landing strip painted (8,1)+(9,1)",
  (await tilemapNode2.locator('[data-cell="8,1"]').count()) === 1 && (await tilemapNode2.locator('[data-cell="9,1"]').count()) === 1);

// Move the player over the strip, high above it (columns 8-9 are clear of
// every template platform; the floor is far below at y=780). The tilemap
// node overlaps the player on the canvas, so select via the layer tree.
await page.getByRole("treeitem").filter({ hasText: "Player 1" }).first().click();
await page.waitForTimeout(500);
const xField = page.getByLabel("X", { exact: true }).first();
const yField = page.getByLabel("Y", { exact: true }).first();
check("inspector exposes the player transform", (await xField.count()) > 0 && (await yField.count()) > 0);
await xField.fill("280");
await yField.fill("560");
await page.keyboard.press("Tab");
await waitForSaved(page);

// ---- 11. Preview: the player must land ON the painted cells ------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /PLAY/ }).click(); // start screen → Play scene
await page.locator('[data-entity="p-player"]').waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(2000); // fall + settle (drop from 560 → cell top 652)
const player = page.locator('[data-entity="p-player"]');
const cell81 = page.locator('[data-cell="8,1"]');
check("preview renders the painted cell", (await cell81.count()) >= 1);
check("preview renders the tile-2 cell with its value",
  (await page.locator('[data-cell="4,2"][data-tile="2"]').count()) === 1);
const cell42PreviewColor = await page.locator('[data-cell="4,2"][data-tile="2"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
check("preview honors the palette color", cell42PreviewColor === "rgb(143, 123, 255)", `color=${cell42PreviewColor}`);
const interiorPreview = await page.locator('[data-cell="9,4"][data-tile="2"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
check("preview auto-tiles like the design canvas", interiorPreview === "rgb(103, 89, 184)", interiorPreview);
const survivorPreview = await page.locator('[data-cell="2,0"][data-tile="2"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
check("preview renders the restyled survivor exactly like the editor", survivorPreview === STRAIGHT_TILE2, `color=${survivorPreview}`);
const pBox = await player.boundingBox();
const cBox = await cell81.first().boundingBox();
const gap = pBox && cBox ? pBox.y + pBox.height - cBox.y : NaN;
check("player lands on the painted tile (bottom ≈ cell top)", Number.isFinite(gap) && Math.abs(gap) <= 8, `gap=${gap?.toFixed(1)}px playerBottom=${pBox ? (pBox.y + pBox.height).toFixed(0) : "?"} cellTop=${cBox ? cBox.y.toFixed(0) : "?"}`);
// The floor is 128 model-px below the cell top; the preview zoom scales both,
// so compare relative distances: the player must rest well above the floor.
const floorBox = await page.locator('[data-entity="p-floor"]').boundingBox();
const aboveFloor = floorBox && pBox ? floorBox.y - (pBox.y + pBox.height) : NaN;
check("player did NOT fall to the floor (tile is what caught it)", Number.isFinite(aboveFloor) && aboveFloor > 30, `aboveFloor=${Number.isFinite(aboveFloor) ? aboveFloor.toFixed(1) : "?"}px`);

await page.screenshot({ path: "/tmp/e2e-tilemap-preview.png" });

// ---- Report ------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed, ${errors.length} console/page errors`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
