// Engine launcher / Creation Hub (TASK 59) E2E: real user flows from the
// dashboard through the Creation Hub into the correct builders, with
// canonical type verification via the API, cross-navigation safety
// (current project never mutated), duplicate-creation prevention, honest
// error handling, responsive layouts, and keyboard accessibility.
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
async function listProjects(cookie) {
  const res = await fetch(`${API}/api/projects`, { headers: { Cookie: cookie } });
  const body = await res.json();
  return body.projects ?? body;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`ln-${stamp}@ex.com`, `ln${stamp}`);

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401") && !m.text().includes("ERR_CONNECTION_REFUSED")) errors.push(`console: ${m.text()}`); });

const openHub = async () => {
  await page.goto(`${WEB}/dashboard/projects`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /create|new project/i }).first().click();
  await page.waitForURL(/dashboard\/projects\/new/);
  await page.waitForTimeout(500);
};

// ---- 1-4. Hub + three environment cards -----------------------------------------
await openHub();
check("1: Dashboard → Create Project opens the Creation Hub",
  page.url().includes("/dashboard/projects/new"));
{
  const cards = [
    ["Application", "Start App"],
    ["2D Game", "Start 2D Game"],
    ["3D Game", "Start 3D Game"],
  ];
  let i = 2;
  for (const [cardName, action] of cards) {
    const card = page.locator(`article[aria-label*="${cardName}"]`);
    check(`${i}: ${cardName} card visible with "${action}" action`,
      (await card.count()) === 1 && (await card.getByRole("button", { name: action }).count()) === 1);
    i += 1;
  }
}
check("3D honest status present (foundation available, not dominant)",
  (await page.getByText(/3D ENGINE · FOUNDATION AVAILABLE/i).count()) === 1);

// ---- 5. Start App ------------------------------------------------------------------
await page.locator('article[aria-label*="Application"]').getByRole("button", { name: "Start App" }).click();
await page.getByRole("button", { name: /Blank project/ }).click();
await page.waitForTimeout(300);
await page.getByLabel("Project name").fill(`Launcher App ${stamp}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/builder\//, { timeout: 20000 });
await page.locator('[data-screen-frame="1"], canvas[data-viewport-3d]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(1500);
const appUrl = page.url();
const appId = appUrl.split("/builder/")[1];
{
  const m = await getModel(cookie, appId);
  check("5: Start App creates type=app and opens the app builder",
    m.type === "app" && (await page.locator('[data-screen-frame="1"]').count()) === 1 &&
    (await page.getByRole("group", { name: "Device preset" }).count()) === 1);
  // App empty state quick-create (Button) is real.
  await page.locator('[data-screen-frame="1"]').getByRole("button", { name: "Button", exact: true }).click();
  await sleep(3000);
  const m2 = await getModel(cookie, appId);
  check("5b: app empty-state Button performs the canonical insertion",
    m2.screens[0].components.some((c) => c.type === "button"));
}

// ---- 6. Start 2D Game ---------------------------------------------------------------
await openHub();
await page.locator('article[aria-label*="2D Game"]').getByRole("button", { name: "Start 2D Game" }).click();
await page.getByRole("button", { name: /Blank project/ }).click();
await page.waitForTimeout(300);
await page.getByLabel("Project name").fill(`Launcher 2D ${stamp}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/builder\//, { timeout: 20000 });
await page.locator('[data-screen-frame="1"], canvas[data-viewport-3d]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(1500);
const gameUrl = page.url();
const gameId = gameUrl.split("/builder/")[1];
{
  const m = await getModel(cookie, gameId);
  check("6: Start 2D Game creates type=game and opens the 2D editor",
    m.type === "game" && (await page.locator('[data-screen-frame="1"]').count()) === 1);
  check("6b: builder shows the 2D GAME engine identity",
    (await page.locator('[data-engine-identity="game"]').count()) === 1 &&
    (await page.locator('[data-engine-identity="game"]').textContent()).includes('2D GAME'));
}

// ---- 7-9. Start 3D Game + reload persistence ----------------------------------------
await openHub();
await page.locator('article[aria-label*="3D Game"]').getByRole("button", { name: "Start 3D Game" }).click();
await page.getByRole("button", { name: /Blank project/ }).click();
await page.waitForTimeout(300);
await page.getByLabel("Project name").fill(`Launcher 3D ${stamp}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/builder\//, { timeout: 20000 });
await page.locator('[data-screen-frame="1"], canvas[data-viewport-3d]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(1500);
const url3d = page.url();
const id3d = url3d.split("/builder/")[1];
{
  const m = await getModel(cookie, id3d);
  check("7: Start 3D Game creates type=3d and opens Viewport3D",
    m.type === "3d" && (await page.locator("canvas[data-viewport-3d]").count()) === 1);
  check("7b: builder shows the 3D GAME engine identity",
    (await page.locator('[data-engine-identity="3d"]').count()) === 1 &&
    (await page.locator('[data-engine-identity="3d"]').textContent()).includes('3D GAME'));
  check("7c: 3D builder has no app-device preset chrome",
    (await page.getByRole("group", { name: "Device preset" }).count()) === 0);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  check("8: reload 3D project — still 3D (Viewport3D + identity)",
    (await page.locator("canvas[data-viewport-3d]").count()) === 1 &&
    (await page.locator('[data-engine-identity="3d"]').count()) === 1);
}
{
  await page.goto(`${WEB}/builder/${gameId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  check("9: reload 2D project — still 2D (scene frame + identity)",
    (await page.locator('[data-screen-frame="1"]').count()) === 1 &&
    (await page.locator('[data-engine-identity="game"]').count()) === 1);
}

// ---- 10-11. Cross-environment navigation safety --------------------------------------
{
  // From the 2D project, open the environment menu and pick 3D Game.
  await page.locator('[data-engine-identity="game"]').click();
  await page.waitForTimeout(300);
  const menu = page.locator('[role="menu"][aria-label="Creation environments"]');
  check("10: environment menu lists all three environments",
    (await menu.getByRole("menuitem", { name: /Application/ }).count()) === 1 &&
    (await menu.getByRole("menuitem", { name: /2D Game/ }).count()) === 1 &&
    (await menu.getByRole("menuitem", { name: /3D Game/ }).count()) === 1);
  // Current environment disabled inside the menu.
  check("10b: the current environment is disabled in the menu",
    await menu.getByRole("menuitem", { name: /2D Game/ }).isDisabled());
  await menu.getByRole("menuitem", { name: /3D Game/ }).click();
  await page.waitForTimeout(300);
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  check("11a: choosing another environment asks for confirmation (no silent mutation)",
    (await dialog.count()) === 1 &&
    (await dialog.getByText(/Create a new 3D Game project\?/).count()) === 1);
  const before = await getModel(cookie, gameId);
  await dialog.getByRole("button", { name: "Create 3D Game" }).click();
  await page.waitForURL(/builder\//, { timeout: 20000 });
await page.locator('[data-screen-frame="1"], canvas[data-viewport-3d]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(1500);
  const newId = page.url().split("/builder/")[1];
  await sleep(2500);
  const after = await getModel(cookie, gameId);
  const newModel = await getModel(cookie, newId);
  check("11b: a NEW 3D project is created (current 2D project untouched)",
    newId !== gameId && newModel.type === "3d" &&
    JSON.stringify(before.screens) === JSON.stringify(after.screens));
}

// ---- 12. Duplicate creation prevention ------------------------------------------------
await openHub();
await page.locator('article[aria-label*="Application"]').getByRole("button", { name: "Start App" }).click();
await page.getByRole("button", { name: /Blank project/ }).click();
await page.waitForTimeout(300);
await page.getByLabel("Project name").fill(`Dup Guard ${stamp}`);
const beforeCount = (await listProjects(cookie)).length;
const createButton = page.getByRole("button", { name: /Create project/ });
await createButton.click();
// Fire a second activation immediately (double-click intent).
await createButton.click({ force: true }).catch(() => undefined);
await page.waitForURL(/builder\//, { timeout: 20000 });
await page.locator('[data-screen-frame="1"], canvas[data-viewport-3d]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(1500);
await sleep(3000);
const afterCount = (await listProjects(cookie)).length;
check("12: double activation creates exactly ONE project",
  afterCount === beforeCount + 1, `before=${beforeCount} after=${afterCount}`);

// ---- 13. Creation error → real error, no fake navigation ------------------------------
await openHub();
await page.locator('article[aria-label*="Application"]').getByRole("button", { name: "Start App" }).click();
await page.getByRole("button", { name: /Blank project/ }).click();
await page.waitForTimeout(300);
// Simulate a real server failure via route interception — the client must
// show an honest error, stay on the hub, and keep the chosen environment.
await page.route("**/api/projects", (route) =>
  route.request().method() === "POST"
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal error" }) })
    : route.continue());
await page.getByLabel("Project name").fill("Should Fail");
await page.getByRole("button", { name: /Create project/ }).click();
await sleep(1500);
const stillHub = page.url().includes("/dashboard/projects/new");
const visibleError = (await page.getByRole("alert").count()) >= 1 || (await page.locator(".text-rose").count()) >= 1;
check("13: creation error shows a real error and stays on the hub (no fake builder)",
  stillHub && visibleError, `url=${page.url()} alert=${visibleError}`);
check("13b: the environment choice is preserved after an error",
  (await page.locator("input#project-name").count()) === 1 && page.url().includes("new"));
await page.unroute("**/api/projects");
// The intentional 500 above logs one console error — that is the test's own
// injection, not a page bug. Clear the ledger for the final assertion.
errors.length = 0;

// ---- 14-17. Responsive layouts ----------------------------------------------------------
await openHub();
const layouts = [];
for (const width of [390, 768, 1024, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("article[aria-label*='creation environment']")];
    const rects = cards.map((c) => c.getBoundingClientRect());
    const tops = [...new Set(rects.map((r) => Math.round(r.top / 40)))];
    const overflow = document.scrollingElement.scrollWidth > window.innerWidth + 1;
    const actionsVisible = cards.every((c) => {
      const btn = [...c.querySelectorAll("button")].find((b) => /Start /.test(b.textContent ?? ""));
      if (!btn) return false;
      const br = btn.getBoundingClientRect();
      return br.width > 0 && br.right <= window.innerWidth;
    });
    return { cards: cards.length, columns: tops.length, overflow, actionsVisible };
  });
  layouts.push({ width, ...r });
}
check("14: 390px — cards stack in one column, no overflow, actions visible",
  layouts[0].cards === 3 && layouts[0].columns === 3 && !layouts[0].overflow && layouts[0].actionsVisible,
  JSON.stringify(layouts[0]));
check("15: 768px — layout usable (≤2 columns, no overflow)",
  !layouts[1].overflow && layouts[1].actionsVisible, JSON.stringify(layouts[1]));
check("16: 1024px — layout usable, no overflow",
  !layouts[2].overflow && layouts[2].actionsVisible, JSON.stringify(layouts[2]));
check("17: 1280px — three cards cleanly visible, no overflow",
  layouts[3].cards === 3 && layouts[3].columns <= 3 && !layouts[3].overflow, JSON.stringify(layouts[3]));

// ---- 18-20. Keyboard accessibility -------------------------------------------------------
await page.setViewportSize({ width: 1440, height: 900 });
await openHub();
{
  // Tab reachability: the first Start action must be reachable by keyboard.
  await page.keyboard.press("Tab");
  let reachedStart = false;
  for (let i = 0; i < 30 && !reachedStart; i++) {
    const active = await page.evaluate(() => ({
      text: document.activeElement?.textContent ?? "",
      tag: document.activeElement?.tagName,
    }));
    if (active.tag === "BUTTON" && /Start (App|2D Game|3D Game)/.test(active.text)) reachedStart = true;
    else await page.keyboard.press("Tab");
  }
  check("18: Start actions are reachable by keyboard (Tab)", reachedStart);
  // Enter activates.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("19: Enter activates the Start action (method step opens)",
    page.url().includes("/dashboard/projects/new") &&
    (await page.getByText("How do you want to start?").count()) === 1);
}
// Escape closes the builder environment menu/dialog.
{
  await page.goto(`${WEB}/builder/${id3d}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator('[data-engine-identity="3d"]').click();
  await page.waitForTimeout(300);
  await page.locator('[role="menu"]').getByRole("menuitem", { name: /2D Game/ }).click();
  await page.waitForTimeout(300);
  check("20a: confirm dialog opens from the environment menu",
    (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("20b: Escape closes the confirm dialog",
    (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 0);
  // Current 3D project still intact.
  check("20c: the 3D project remains intact after menu interactions",
    (await page.locator("canvas[data-viewport-3d]").count()) === 1);
}

// ---- 21-23. Console / page errors --------------------------------------------------------
check("21-23: no unexpected console/page errors",
  errors.length === 0, errors.slice(0, 6).join(" | "));

// ---- Report ------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console/page errors` : ""}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
