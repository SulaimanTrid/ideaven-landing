// TASK 08 acceptance: real coin-collision gameplay in the builder preview,
// scene editor persistence, restart reset, public page, export, landing chip.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
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

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`gamedev-${stamp}@ex.com`, `gamedev${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Scene Runner", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the scene template`);

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ---- 1. Design: switch to the Play (scene) screen ----------------------------
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
const sceneChip = await page.getByText(/scene · Play/).count() > 0;
check("design canvas shows SCENE stage for the Play screen", sceneChip);
const playerBox = await page.locator('[data-node-id="p-player"]').count();
check("player entity rendered on the design stage", playerBox === 1);
const coinBoxes = await page.locator('[data-node-id^="p-coin-"]').count();
check("all six coin entities rendered", coinBoxes === 6);

await page.locator('[data-node-id="p-player"]').click();
await page.waitForTimeout(700);
await page.screenshot({ path: "/tmp/dbg-inspector.png" });
const xField = await page.getByLabel("X", { exact: true }).count();
check("inspector exposes transform fields (X)", xField > 0);

// Drag the player right by ~60 screen px.
const box = await page.locator('[data-node-id="p-player"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(2200); // autosave debounce

let model;
{
  const res = await fetch(`${API}/api/projects/${project.id}`, { headers: { Cookie: cookie } });
  model = (await res.json()).project.model;
}
const play = model.screens.find((s) => s.id === "screen-play");
const playerModel = play.components.find((c) => c.id === "p-player");
check("drag-move persisted to the canonical model (x ≈ 90)", Math.abs(playerModel.props.x - 90) <= 12, `x=${playerModel.props.x}`);
const touchHandlers = play.logic.handlers.filter((h) => h.event.startsWith("touches-"));
check("template carries 6 touch handlers", touchHandlers.length === 6, `${touchHandlers.length}`);

// ---- 2. Blocks mode: touch handlers visible ---------------------------------
await page.getByRole("button", { name: "Blocks" }).first().click();
await page.waitForTimeout(600);
const touchHandlerRow = await page.getByText(/touches/i).count();
check("blocks mode lists touch handlers", touchHandlerRow > 0);

// ---- 3. Preview: real gameplay — walk right, touch coin 1, score 1 ----------
await page.getByRole("button", { name: "Preview" }).first().click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /PLAY/ }).click();
await page.waitForTimeout(600);
await page.locator('[data-entity="p-player"]').waitFor({ state: "visible", timeout: 8000 }).catch(() => null);

const scoreBefore = await page.locator('[data-entity="p-hud-score"]').textContent();
check("HUD score starts at 0", (scoreBefore ?? "").trim() === "0", scoreBefore);
const coinVisibleBefore = await page.locator('[data-entity="p-coin-1"]').isVisible();

await page.keyboard.down("ArrowRight");
await page.waitForTimeout(1200);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(600);

const scoreAfter = await page.locator('[data-entity="p-hud-score"]').textContent();
// Walking right from x≈90 passes coin-1 (x150) AND coin-6 (x330) on the
// ground path — two collections is the correct deterministic outcome.
check("SCORE incremented by touching coins (2 collected)", (scoreAfter ?? "").trim() === "2", scoreAfter);
const coinHidden = await page.locator('[data-entity="p-coin-1"]').isHidden();
check("coin disappears after collection", coinHidden && coinVisibleBefore);
const playerLeft = await page.locator('[data-entity="p-player"]').evaluate((el) => parseFloat(el.style.left));
check("player actually moved (collision is positional)", playerLeft > 100, `x=${playerLeft}`);

await page.getByRole("button", { name: /Runtime trace/ }).click();
await page.waitForTimeout(300);
const traceLine = await page.getByText(/collision: player ↔/).count();
check("runtime trace records the collision event", traceLine > 0);

await page.keyboard.down("ArrowRight");
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(350);
await page.keyboard.up("ArrowUp");
await page.keyboard.up("ArrowRight");
const playerTop = await page.locator('[data-entity="p-player"]').evaluate((el) => parseFloat(el.style.top));
check("jump lifts the player (gravity loop runs)", playerTop < 700, `y=${playerTop}`);

// ---- 4. Restart resets everything -------------------------------------------
await page.getByRole("button", { name: /Restart run/ }).click();
await page.waitForTimeout(1200);
// A fresh run starts on the start screen (Menu) — enter Play again.
await page.getByRole("button", { name: /PLAY/ }).click();
await page.waitForTimeout(600);
await page.locator('[data-entity="p-player"]').waitFor({ state: "visible", timeout: 8000 }).catch(() => null);
const scoreReset = await page.locator('[data-entity="p-hud-score"]').textContent();
check("restart resets score to 0", (scoreReset ?? "").trim() === "0", scoreReset);
const coinBack = await page.locator('[data-entity="p-coin-1"]').isVisible();
check("restart restores the collected coin", coinBack);
const pLeft = await page.locator('[data-entity="p-player"]').evaluate((el) => parseFloat(el.style.left));
check("restart returns the player to spawn (x≈90 from the model)", Math.abs(pLeft - 90) <= 12, `x=${pLeft}`);

// ---- 5. Publish + public page plays the same scene --------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}",
  });
  check("publish via API", res.status === 200);
}
{
  const pub = await context.newPage();
  pub.on("pageerror", (e) => errors.push(`public pageerror: ${e.message}`));
  await pub.goto(`${WEB}/p/${project.slug}`, { waitUntil: "networkidle" });
  await pub.getByRole("button", { name: /PLAY/ }).click();
  await pub.waitForTimeout(500);
  await pub.locator('[data-entity="p-player"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
  await pub.keyboard.down("ArrowRight");
  await pub.waitForTimeout(1200);
  await pub.keyboard.up("ArrowRight");
  await pub.waitForTimeout(500);
  const pubScore = await pub.locator('[data-entity="p-hud-score"]').textContent();
  check("published page: gameplay works (2 coins on the walk path)", (pubScore ?? "").trim() === "2", pubScore);
  await pub.close();
}

// ---- 6. Exported HTML carries the scene engine ------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export contains the scene engine", html.includes("touches-") && html.includes("sceneTick"));
  check("export evaluates boolean blocks", html.includes('"boolean"'));
}

// ---- 7. Landing demo score chip ---------------------------------------------
{
  const land = await context.newPage();
  await land.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await land.locator('button[aria-label="Run project"]').click();
  await land.keyboard.down("ArrowRight");
  await land.waitForTimeout(2500);
  await land.keyboard.up("ArrowRight");
  const chip = await land.getByText(/SCORE \d/).first().textContent();
  check("landing TopBar shows the live score chip", /SCORE 0[1-3]/.test((chip ?? "").trim()), chip);
  await land.close();
}

await context.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (errors.length) { console.log("\nErrors:"); errors.forEach((e) => console.log(`  ${e}`)); }
process.exit(failed || errors.length ? 1 : 0);
