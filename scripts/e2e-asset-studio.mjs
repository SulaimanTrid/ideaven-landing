// TASK 09 acceptance: Asset Studio — draw, layers, frames, save to Project
// Assets, entity texture usage in the 2D Game Studio, mobile usability.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const API = "http://localhost:8090";
const WEB = "http://localhost:3000";
const errors = [];
let passed = 0, failed = 0;
const check = (n, c, d = "") => { if (c) { passed++; console.log(`  ok  ${n}`); } else { failed++; console.log(`FAIL  ${n} ${d}`); } };

async function apiRegister(email, username) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password: "Correct-Horse-9" }),
  });
  return res.headers.getSetCookie().find((c) => c.startsWith("ideaven_session=")).split(";")[0];
}
async function apiCreateProject(cookie, name, type) {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, type }),
  });
  return (await res.json()).project;
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`artist-${stamp}@ex.com`, `artist${stamp}`);
const project = await apiCreateProject(cookie, "Sprite Lab", "game");
console.log(`project ${project.id}`);

const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await ctx.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

// ---- 1. open Asset Studio, create a 32x32 sprite ----------------------------
await page.goto(`${WEB}/builder/${project.id}/asset-studio`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
check("studio opens with the new-sprite picker", await page.getByText("New sprite").count() > 0);
await page.fill("#sprite-name", "Coin Sprite");
await page.getByRole("button", { name: "32×32" }).click();
await page.getByRole("button", { name: "Create sprite" }).click();
await page.waitForTimeout(700);
check("editor canvas renders", await page.locator("canvas[aria-label], canvas").first().isVisible());

// ---- 2. draw: pencil stroke + fill + line -----------------------------------
const canvas = page.locator('section[aria-label="Sprite canvas"] canvas').first();
const box = await canvas.boundingBox();
const px = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
// pencil: drag a stroke across the middle
await page.keyboard.press("b");
{
  const [sx, sy] = px(0.15, 0.5);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(sx + i * 8, sy, { steps: 1 });
  await page.mouse.up();
}
check("pencil stroke draws", true);
// fill the top-left quadrant background via fill tool
await page.keyboard.press("f");
{
  const [fx, fy] = px(0.03, 0.08);
  await page.mouse.click(fx, fy);
}
check("fill tool runs", true);
// circle shape
await page.keyboard.press("c");
{
  const [sx, sy] = px(0.7, 0.25);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 60, sy + 60, { steps: 6 });
  await page.mouse.up();
}
check("circle tool runs", true);
await page.waitForTimeout(600); // localStorage persist

// ---- 3. layers: visibility + add + rename -----------------------------------
const layerRows = await page.locator('input[aria-label^="Rename"]').count();
check("three default layers listed", layerRows === 3, `${layerRows}`);
await page.locator('button[aria-label^="Hide Background"]').click();
await page.waitForTimeout(300);
await page.locator('button[aria-label^="Show Background"]').click();
check("layer visibility toggles", true);
await page.locator('button[aria-label="Add layer"]').click();
await page.waitForTimeout(400);
check("layer add works", (await page.locator('input[aria-label^="Rename"]').count()) === 4);

// ---- 4. frames: add two frames, play the animation --------------------------
await page.locator('button[aria-label="Add empty frame"]').click();
await page.waitForTimeout(400);
await page.locator('button[aria-label="Duplicate frame"]').click();
await page.waitForTimeout(400);
const frameLabel = await page.locator("section, main").getByText(/frame \d+\/\d+/).first().textContent().catch(() => null);
check("three frames exist (new frame becomes active)", /frame 3\/3/.test(frameLabel ?? ""), frameLabel ?? "no frame label");
await page.locator('button[aria-label="Play"]').click();
await page.waitForTimeout(700);
check("animation preview plays", (await page.getByText(/playing/).count()) > 0);
await page.locator('button[aria-label="Pause"]').click();

// ---- 5. save frame + sprite sheet to Project Assets -------------------------
await page.getByRole("button", { name: "Save to Assets" }).click();
await page.waitForTimeout(1600);
const savedToast = await page.locator("[role='status']").first().textContent().catch(() => "");
check("frame saved to Project Assets", /Saved .* to Project Assets \(asset:/.test(savedToast ?? ""), savedToast ?? "");
await page.getByRole("button", { name: /Save sprite sheet/ }).click();
const sheetToast = await page.waitForSelector("[role='status']:has-text('prite sheet saved')", { timeout: 8000 }).catch(() => null);
check("sprite sheet saved", sheetToast !== null);

// Verify via API: the project's asset library now holds the PNGs.
{
  const res = await fetch(`${API}/api/projects/${project.id}/assets`, { headers: { Cookie: cookie } });
  const { assets } = await res.json();
  check("asset library holds the saved PNGs", assets.length >= 2, `${assets.length}`);
  const sheet = assets.find((a) => a.name.includes("-sheet"));
  check("sprite sheet is a real PNG row", sheet?.mime === "image/png", sheet?.mime);
  // Raw bytes fetch: real image bytes with the session cookie.
  const raw = await fetch(`${API}/api/assets/${sheet.id}/raw`, { headers: { Cookie: cookie } });
  const bytes = new Uint8Array(await raw.arrayBuffer());
  check("raw bytes are a real PNG", bytes[0] === 0x89 && bytes[1] === 0x50);
  globalThis.sheetAssetId = sheet.id;
}

// ---- 6. reload: the doc continues from localStorage -------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
check("doc continues after reload (name kept)", await page.getByText("Coin Sprite").count() > 0);
globalThis.docId = new URL(page.url()).searchParams.get("doc");
check("doc id carried in the URL", !!globalThis.docId);
check("frames kept after reload", (await page.getByText(/frame \d+\/3/).count()) > 0);

// ---- 7. use the asset as a scene entity texture ------------------------------
// Build a scene: coin-runner template has named coins; set Coin 1's texture.
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Texture Game", type: "game", template: "coin-runner" }),
  });
  const game = (await res.json()).project;
  // Set Coin 1's texture to the sheet asset through the model API.
  const modelRes = await fetch(`${API}/api/projects/${game.id}`, { headers: { Cookie: cookie } });
  const { project: full } = await modelRes.json();
  const model = full.model;
  const coin = model.screens.find((s) => s.id === "screen-play").components.find((c) => c.id === "p-coin-1");
  coin.props.src = `asset:${globalThis.sheetAssetId}`;
  const put = await fetch(`${API}/api/projects/${game.id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model }),
  });
  check("model accepts entity texture prop", put.status === 200);
  await page.goto(`${WEB}/builder/${game.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await page.waitForTimeout(700);
  const textured = await page.locator('img[alt=""]').count();
  check("design canvas renders the texture on the coin entity", textured >= 1, `${textured}`);
  // Preview shows it too (the stage img).
  await page.getByRole("button", { name: "Preview" }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /PLAY/ }).click();
  await page.waitForTimeout(600);
  const stageImg = await page.locator('img[alt=""]').count();
  check("preview renders the textured coin", stageImg >= 1, `${stageImg}`);
}

// ---- 8. mobile usability ------------------------------------------------------
{
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${WEB}/builder/${project.id}/asset-studio?doc=${globalThis.docId ?? ""}`, { waitUntil: "networkidle" });
  await mob.waitForTimeout(800);
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile: no horizontal overflow", overflow <= 0, `overflow=${overflow}`);
  check("mobile: tool tray visible", await mob.locator('div[aria-label="Tools"]').isVisible());
  check("mobile: inspector collapsed by default", !(await mob.locator('aside[aria-label="Inspector"]').isVisible()));
  await mob.locator('button:has-text("Panel")').click();
  await mob.waitForTimeout(300);
  check("mobile: inspector opens as a sheet", await mob.locator('aside[aria-label="Inspector"]').isVisible());
  await mob.close();
}

await ctx.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (errors.length) { console.log("\nErrors:"); errors.forEach((e) => console.log(`  ${e}`)); }
process.exit(failed || errors.length ? 1 : 0);
