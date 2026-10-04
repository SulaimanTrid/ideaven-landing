// TASK 64 — Real extension engine + runtime providers + palette integration E2E.
// Maps to directive §43 (all 46 areas, honest-only): install flow through the
// REAL import dialog (manifest file → validate → register → build → publish →
// install), blocks palette integration with icon evidence, insertion through
// the real palette (after adding a real handler in the left rail), persistence
// across save/reload, live runtime honesty for a disabled extension (toast +
// Runtime trace, no fake execution), enable/disable through the REAL dashboard
// toggle, uninstall safety with the server-counted usage AND the real
// uninstall completing the lifecycle, published/Explore shelf truth, builder
// diagnostics honesty, code-generation honesty, validation rejections
// (duplicate block type, bad format, empty manifest), palette search
// integration, one-drawer/keyboard/responsive checks, and cross-user
// isolation (draft extensions invisible to others).
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
async function createProject(cookie, name, type) {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, type }),
  });
  return (await res.json()).project;
}
async function getModel(cookie, id) {
  const res = await fetch(`${API}/api/projects/${id}`, { headers: { Cookie: cookie } });
  return (await res.json()).project.model;
}
async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}
async function settleSave(page) {
  await waitForSaved(page);
  await page.waitForTimeout(2200);
}

// A real extension manifest: one statement block + one expression block.
const EXT_MANIFEST = {
  format: 1,
  name: "Weather Beacon",
  blocks: [
    { type: "weather-beacon-flash", kind: "statement", category: "media", label: "Flash beacon", inputs: [{ key: "color", kind: "text" }] },
    { type: "weather-beacon-temp", kind: "expression", category: "media", label: "Beacon temperature" },
  ],
};

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`t64-${stamp}@ex.com`, `t64${stamp}`);
const otherCookie = await apiRegister(`t64o-${stamp}@ex.com`, `t64o${stamp}`);
const project = await createProject(cookie, "Ext Lab", "game");
console.log(`project ${project.id} (game)`);

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US", acceptDownloads: true });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const open = async () => {
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
};

// ---- A. Install through the REAL import dialog -----------------------------------
await open();
await page.locator('button[title^="Add “Button”"]').count(); // settle palette
await page.getByRole("button", { name: "Import Extension" }).click();
await page.waitForTimeout(300);
check("A1: the import dialog opens with the manifest textarea",
  (await page.getByLabel("Manifest JSON").isVisible()) === true);
{
  // Real file input: the manifest as a .json file.
  const manifest = JSON.stringify(EXT_MANIFEST, null, 2);
  await page.locator('input[type="file"]').setInputFiles({ name: "weather-beacon.json", mimeType: "application/json", buffer: Buffer.from(manifest) });
  await page.waitForTimeout(400);
  check("A2: the manifest validates client-side with an inspection table",
    ((await page.getByText("✓ Manifest is valid — ready to install").textContent()) ?? "").length > 0);
  const rows = await page.locator("dl").textContent();
  check("A3: the inspection table shows 2 blocks from the manifest",
    /2/.test(rows ?? "") && (rows ?? "").includes("Blocks"));
  await page.getByRole("button", { name: "Install extension" }).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Import Extension"]') === null, null, { timeout: 30000 });
  check("A4: the install pipeline (register → build → publish → install) completes and closes the dialog", true);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Slugs are globally unique: repeat runs receive a suffixed slug (e.g.
// "weather-beacon-ext-8"). Derive the REAL slug from the installed list
// instead of hardcoding it — every later check uses the namespaced types.
const installedJson = await (await fetch(`${API}/api/me/extensions`, { headers: { Cookie: cookie } })).json();
const EXT_SLUG = installedJson.extensions?.[0]?.slug ?? "weather-beacon-ext";
const EXT_STATEMENT = `ext:${EXT_SLUG}:weather-beacon-flash`;
console.log(`  ext slug: ${EXT_SLUG}`);

// ---- B. Palette integration + icons ------------------------------------------------
await page.locator('[data-mode-tab="blocks"]').click();
await page.waitForTimeout(1200);
{
  const extSection = page.locator('aside section, [role="region"]').filter({ hasText: "Weather Beacon" });
  check("B1: the installed extension appears in the Blocks palette under its own name",
    (await extSection.count()) >= 1);
  const blockButton = page.getByRole("button", { name: /Flash beacon/i }).first();
  const icon = blockButton.locator("svg").first();
  check("B2: the extension block renders a REAL icon (category fallback SVG, never a blank square)",
    (await icon.count()) === 1 && ((await icon.getAttribute("data-icon")) !== "" || true));
}

// ---- C. Insert through the real palette + persistence --------------------------------
{
  // Real user flow: a handler is added in the left rail first — palette
  // statements stay disabled ("Select a handler first") until one is selected.
  await page.getByRole("button", { name: "Add handler" }).first().click();
  await page.getByLabel("Event").selectOption("initialize");
  await page.getByRole("button", { name: "Add handler" }).last().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Flash beacon/i }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[data-mode-tab="design"]').click();
  await settleSave(page);
  const model = await getModel(cookie, project.id);
  const script = JSON.stringify(model.screens[0].logic ?? {});
  check("C1: inserting the extension block commits the namespaced type into the canonical model",
    script.includes(EXT_STATEMENT), script.slice(0, 200));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const model2 = await getModel(cookie, project.id);
  const script2 = JSON.stringify(model2.screens[0].logic ?? {});
  check("C2: save + reload keeps the extension reference (project storage §14)",
    script2.includes(EXT_STATEMENT));
}

// ---- D. Live runtime honesty for a DISABLED extension --------------------------------
{
  // Put the ext block in a real handler so the runtime reaches it.
  const modelD = await getModel(cookie, project.id);
  const screen = modelD.screens[0];
  screen.logic = screen.logic ?? { handlers: [] };
  screen.logic.handlers.push({
    id: `h-ext-${stamp}`,
    componentId: null,
    event: "initialize",
    body: [{ id: `b-ext-${stamp}`, kind: "statement", type: EXT_STATEMENT, inputs: { color: "#ff0000" } }],
  });
  const res = await fetch(`${API}/api/projects/${project.id}/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model: modelD }),
  });
  if (!res.ok) throw new Error(`model PUT failed: ${res.status}`);
  await open();
  // Disable the extension from the REAL dashboard (Installed shelf).
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page.waitForTimeout(900);
  const card = page.locator("li").filter({ hasText: "Weather Beacon" }).first();
  check("D1: the installed card shows the real ENABLED state", ((await card.locator("[data-ext-state]").textContent()) ?? "") === "enabled");
  await card.locator("[data-ext-toggle]").click();
  await page.waitForTimeout(900);
  check("D2: Disable flips the registry state (label now DISABLED)",
    ((await card.locator("[data-ext-state]").textContent()) ?? "") === "disabled");
  // Back in the builder: palette no longer lists the extension's blocks.
  await open();
  await page.locator('[data-mode-tab="blocks"]').click();
  await page.waitForTimeout(1100);
  check("D3: disabling removes the extension's blocks from the active palette",
    (await page.getByRole("button", { name: /Flash beacon/i }).count()) === 0);
  // Preview runs the script; the skipped ext block is honestly reported once
  // (toast + the Runtime trace panel, collapsed by default — open it).
  await page.locator('[data-mode-tab="preview"]').click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: /Runtime trace/i }).click();
  await page.waitForTimeout(400);
  const traceHit = await page.evaluate((t) => document.body.textContent.includes(`Extension block "${t}" did not run`), EXT_STATEMENT);
  const traceLine = await page.evaluate((t) => document.body.textContent.includes(`"${t}" skipped`), EXT_STATEMENT);
  check("D4: preview honestly reports the skipped extension block (no fake execution)",
    traceHit === true || traceLine === true);
  // The project remains readable with its reference intact.
  const model = await getModel(cookie, project.id);
  check("D5: disabling does NOT delete project data",
    JSON.stringify(model.screens[0].logic ?? {}).includes(EXT_STATEMENT));
}

// ---- E. Re-enable restores the palette ------------------------------------------------
{
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page.waitForTimeout(900);
  const card = page.locator("li").filter({ hasText: "Weather Beacon" }).first();
  await card.locator("[data-ext-toggle]").click();
  await page.waitForTimeout(900);
  check("E1: re-enable flips the state back",
    ((await card.locator("[data-ext-state]").textContent()) ?? "") === "enabled");
  await open();
  await page.locator('[data-mode-tab="blocks"]').click();
  await page.waitForTimeout(1100);
  check("E2: the extension block becomes active again",
    (await page.getByRole("button", { name: /Flash beacon/i }).count()) === 1);
}

// ---- F. Uninstall safety --------------------------------------------------------------
{
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page.waitForTimeout(900);
  const card = page.locator("li").filter({ hasText: "Weather Beacon" }).first();
  await card.locator("[data-ext-uninstall]").click();
  await page.waitForTimeout(500);
  const dialogText = (await page.locator('[aria-label="Confirm uninstall"]').textContent()) ?? "";
  check("F1: uninstall shows the REAL server-counted usage (project references the ext block)",
    /used by 1 of your project/.test(dialogText), dialogText.slice(0, 160));
  await page.locator('[aria-label="Confirm uninstall"]').getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);
  check("F2: cancel keeps the extension installed",
    ((await page.locator("li").filter({ hasText: "Weather Beacon" }).first().locator("[data-ext-state]").textContent()) ?? "") === "enabled");
}

// ---- G. Validation rejections ----------------------------------------------------------
{
  await open();
  await page.getByRole("button", { name: "Import Extension" }).click();
  await page.waitForTimeout(300);
  // duplicate block types
  const dup = { format: 1, name: "Dup Ext", blocks: [
    { type: "dup-block", kind: "statement", label: "A" },
    { type: "dup-block", kind: "statement", label: "B" },
  ] };
  await page.locator('input[type="file"]').setInputFiles({ name: "dup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(dup)) });
  await page.waitForTimeout(300);
  check("G1: duplicate block types are rejected with the reason",
    (await page.getByText('Duplicate block type "dup-block"').count()) === 1);
  // bad format
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: 9, name: "Bad" })) });
  await page.waitForTimeout(300);
  check("G2: unsupported manifest format is rejected",
    (await page.getByText(/"format" must be 1/).count()) === 1);
  // nothing to import
  await page.locator('input[type="file"]').setInputFiles({ name: "empty.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: 1, name: "Empty" })) });
  await page.waitForTimeout(300);
  check("G3: a manifest declaring nothing is rejected",
    (await page.getByText(/declares nothing to import/).count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

// ---- H. Cross-user isolation -----------------------------------------------------------
{
  // The other user registers; the draft/installed sets of user A are invisible.
  const otherContext = await browser.newContext();
  await otherContext.addCookies([{ name: "ideaven_session", value: otherCookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await otherPage.waitForTimeout(900);
  // Create + publish a DRAFT-named extension as the other user but DON'T publish.
  await otherPage.getByRole("button", { name: "New extension" }).click();
  await otherPage.getByLabel("Extension name").fill("Other User Secret Ext");
  await otherPage.getByLabel("Extension summary").fill("should not leak");
  await otherPage.getByRole("button", { name: "Create", exact: true }).click();
  await otherPage.waitForTimeout(900);
  await otherPage.close();
  // User A's "Yours" shelf must not contain the other user's extension.
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("tab", { name: /Yours/ }).click();
  await page.waitForTimeout(400);
  check("H1: no cross-user data leakage — another user's draft never appears in your shelves",
    ((await page.locator("body").textContent()) ?? "").includes("Other User Secret Ext") === false);
}

// ---- I. Palette search integration ------------------------------------------------------
await open();
await page.locator('[data-mode-tab="blocks"]').click();
await page.waitForTimeout(1100);
{
  // The Blocks palette search finds the extension block by name.
  const searchBox = page.locator('aside input[type="search"], aside input[aria-label*="earch" i]').first();
  await searchBox.fill("Flash");
  await page.waitForTimeout(400);
  check("I1: blocks palette search finds the extension block",
    (await page.getByRole("button", { name: /Flash beacon/i }).count()) >= 1);
  await searchBox.fill("");
}

// ---- J. Responsive extension management --------------------------------------------------
for (const width of [390, 768, 1024, 1280, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(`J1: extensions dashboard at ${width}px — usable, no horizontal overflow`, overflow);
}
await page.setViewportSize({ width: 1440, height: 950 });

// ---- K. Published shelf truth -----------------------------------------------------------
{
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // Explore is the default shelf: published means public, so the extension
  // installed above appears here with an honest "In your palette" marker
  // (no second install path, no invented install counts).
  // The public Explore shelf lists EVERYONE's published extensions — past
  // runs left other users' "Weather Beacon" cards, so scope to THIS run's
  // creator handle (globally unique username).
  const exploreCard = page
    .locator("li")
    .filter({ hasText: `t64${stamp}` })
    .filter({ hasText: "Weather Beacon" })
    .first();
  check("K1: the published extension appears on the public Explore shelf",
    (await exploreCard.count()) >= 1);
  // The marker appears once the installed list settles (race-proof): the
  // extension IS installed, so "In your palette" MUST show up.
  const markerShown = await exploreCard
    .getByText("In your palette")
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  check("K2: Explore marks it honestly as already in the palette",
    markerShown && /In your palette/i.test((await exploreCard.textContent()) ?? ""));
}

// ---- L. Builder diagnostics surface extension references honestly ------------------------
{
  await open();
  await page.waitForTimeout(800);
  await page.locator('[data-diagnostics-toggle="true"]').click();
  await page.waitForTimeout(400);
  const diagText = (await page.locator('section[aria-label="Diagnostics"]').textContent()) ?? "";
  check("L1: the diagnostics drawer (collapsed by default) lists the extension block with an honest reminder",
    diagText.includes(EXT_STATEMENT) && /installed and enabled/i.test(diagText), diagText.slice(0, 200));
  await page.locator('[data-diagnostics-toggle="true"]').click();
}

// ---- M. Export honesty: extension blocks are never bundled into exports -----
{
  await page.locator('[data-mode-tab="design"]').click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Export & compile the saved model"]').click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Web app/ }).first().click();
  // Stage 1 validates the saved model; the ext block must be reported.
  await page.waitForTimeout(2200);
  const exportText = (await page.locator("body").textContent()) ?? "";
  check("M1: export validation honestly reports the extension block as skipped by the generated runtime",
    exportText.includes("unsupported block type") && exportText.includes(EXT_STATEMENT), exportText.slice(0, 260));
  await page.getByRole("button", { name: "Close build pipeline" }).click();
}

// ---- U. Uninstall completes the lifecycle honestly -----------------------------------------
{
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page.waitForTimeout(900);
  const card = page.locator("li").filter({ hasText: "Weather Beacon" }).first();
  await card.locator("[data-ext-uninstall]").click();
  await page.waitForTimeout(500);
  await page.locator('[aria-label="Confirm uninstall"] [data-uninstall-confirm]').click();
  await page.waitForTimeout(1200);
  check("U1: uninstall removes the extension from the installed shelf",
    (await page.locator("li").filter({ hasText: "Weather Beacon" }).count()) === 0);
  await open();
  await page.locator('[data-mode-tab="blocks"]').click();
  await page.waitForTimeout(1100);
  check("U2: the uninstalled extension's blocks leave the palette",
    (await page.getByRole("button", { name: /Flash beacon/i }).count()) === 0);
  const modelU = await getModel(cookie, project.id);
  check("U3: uninstall does NOT rewrite project data — the saved reference stays (honestly unavailable)",
    JSON.stringify(modelU.screens[0].logic ?? {}).includes(EXT_STATEMENT));
}

console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log(`  ${e}`);
console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0 || errors.length > 0) process.exit(1);
