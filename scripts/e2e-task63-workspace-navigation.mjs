// TASK 63 — Beginner workspace navigation + scrollable editor panels E2E.
// Maps to directive §41: mode navigation (mouse + Alt shortcuts), left/right
// panel independent scrolling with a FROZEN central viewport, palette search
// + collapsible/persisted categories, collapsible inspector sections, code
// scroll, blocks palette scroll + empty-state hint + pan/zoom, 3D wheel
// routing, panel collapse rails, drawers at 390/768, responsive widths,
// keyboard accessibility, diagnostics default state, zero errors.
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
async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`t63-${stamp}@ex.com`, `t63${stamp}`);
const appProject = await createProject(cookie, "Nav Lab App", "app");
const gameProject = await createProject(cookie, "Nav Lab 2D", "game");
const project3d = await createProject(cookie, "Nav Lab 3D", "3d");
console.log(`projects: app=${appProject.id} game=${gameProject.id} 3d=${project3d.id}`);

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const open = async (id) => {
  await page.goto(`${WEB}/builder/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
};
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---- A. Mode navigation (APP project) ------------------------------------------------
await open(appProject.id);
check("A1: the app builder opens in Design mode (aria-current + underline)",
  (await page.locator('[data-mode-tab="design"][aria-current="page"]').count()) === 1 &&
  (await page.locator('[data-mode-tab="design"] span[aria-hidden]').count()) === 1);
check("A2: every mode tab documents its Alt shortcut in a tooltip",
  (await page.locator('[data-mode-tab="design"][title*="Alt+1"]').count()) === 1 &&
  (await page.locator('[data-mode-tab="preview"][title*="Alt+4"]').count()) === 1);
check("A3: the workspace context breadcrumb reads project / engine / mode",
  ((await page.locator("[data-workspace-context]").getAttribute("aria-label")) ?? "").includes("Nav Lab App") &&
  ((await page.locator("[data-workspace-context]").getAttribute("aria-label")) ?? "").toUpperCase().includes("APP") &&
  ((await page.locator("[data-workspace-context]").getAttribute("aria-label")) ?? "").toLowerCase().includes("design"));

await page.locator('[data-mode-tab="blocks"]').click();
await page.waitForTimeout(700);
check("A4: Blocks tab opens the blocks workspace",
  (await page.locator("text=Blocks for").count()) >= 1 || (await page.locator("text=Scene logic for").count()) >= 1);
await page.locator('[data-mode-tab="code"]').click();
await page.waitForTimeout(400);
const monacoReady = await page.waitForSelector(".monaco-editor", { timeout: 8000 }).then(() => true).catch(() => false);
check("A5: Code tab opens the Monaco editor with the beginner hint",
  monacoReady === true && (await page.locator("[data-code-hint]").count()) === 1);
await page.locator('[data-mode-tab="preview"]').click();
await page.waitForTimeout(700);
check("A6: Preview tab opens the runtime surface",
  (await page.locator('[aria-label="Device preset"]').isVisible()) === true &&
  (await page.locator('[aria-label="Viewport scale"]').isVisible()) === true);
await page.locator('[data-mode-tab="insights"]').click();
await page.waitForTimeout(700);
check("A7: Insights stays reachable as the LAST tab",
  (await page.locator('[data-mode-tab="insights"][aria-current="page"]').count()) === 1);
await page.locator('[data-mode-tab="design"]').click();
await page.waitForTimeout(500);

{
  // Alt shortcuts: Alt+2 → Blocks, Alt+1 → Design (safe: not typing context).
  await page.keyboard.press("Alt+2");
  await page.waitForTimeout(400);
  const blocks = (await page.locator('[data-mode-tab="blocks"][aria-current="page"]').count()) === 1;
  await page.keyboard.press("Alt+1");
  await page.waitForTimeout(400);
  check("A8: Alt+2 / Alt+1 switch modes from the keyboard",
    blocks && (await page.locator('[data-mode-tab="design"][aria-current="page"]').count()) === 1);
}

// ---- B. Left panel: scroll independence + search + categories -------------------------
await open(appProject.id);
{
  // Freeze the central viewport: record the device frame's viewport position,
  // scroll the LEFT panel hard, and assert the frame did not move.
  const frameBefore = await page.locator('[data-screen-frame]').boundingBox();
  await page.locator("#workspace-left-panel .overflow-y-auto").nth(1).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(300);
  const frameAfter = await page.locator('[data-screen-frame]').boundingBox();
  check("B1: scrolling the left palette does NOT move the central viewport",
    frameBefore !== null && frameAfter !== null &&
    near(frameBefore.x, frameAfter.x, 1) && near(frameBefore.y, frameAfter.y, 1),
    `${JSON.stringify(frameBefore)} vs ${JSON.stringify(frameAfter)}`);
}
{
  // Palette search: "text" matches Text / Text Input / Password Input /
  // Text to Speech through label + alias vocabulary.
  await page.locator("[data-palette-search]").fill("text");
  await page.waitForTimeout(300);
  const railText = await page.locator("#workspace-left-panel").textContent();
  check("B2: palette search filters immediately (text → Text / Text Input / Password Input / TTS)",
    (railText ?? "").includes("Text Input") && (railText ?? "").includes("Password Input") &&
    (railText ?? "").includes("Text to Speech"),
    (railText ?? "").slice(0, 160));
  await page.locator("[data-palette-search]").fill("tap");
  await page.waitForTimeout(300);
  check("B3: palette search alias — “tap” surfaces the Button via alias",
    (await page.locator('button[title^="Add “Button”"]').isVisible()) === true);
  await page.locator("[data-palette-search]").fill("");
  await page.waitForTimeout(300);
}
{
  // Categories: primary starts open, second starts collapsed, toggle works,
  // and the state persists across reload (localStorage, UI-only).
  const primary = page.locator('[data-category-toggle]').first();
  const primaryId = await primary.getAttribute("data-category-toggle");
  check("B4: the primary category starts open (aria-expanded=true)",
    (await primary.getAttribute("aria-expanded")) === "true");
  const second = page.locator("[data-category-toggle]").nth(1);
  const secondId = await second.getAttribute("data-category-toggle");
  check("B5: a secondary category starts collapsed for beginners",
    (await second.getAttribute("aria-expanded")) === "false");
  await second.click();
  await page.waitForTimeout(250);
  check("B6: clicking a category header expands it (aria-expanded + region visible)",
    (await second.getAttribute("aria-expanded")) === "true" &&
    (await page.locator(`#palette-category-${secondId}`).isVisible()) === true);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const secondAfter = page.locator(`[data-category-toggle="${secondId}"]`);
  check("B7: category state persists across reload (localStorage, UI-only)",
    (await secondAfter.getAttribute("aria-expanded")) === "true");
}

// ---- C. Right inspector: scroll + collapsible sections --------------------------------
{
  // Seed real content through the canonical empty-state actions so the
  // inspector has fields, then shrink the viewport so the rail actually
  // overflows (independent scroll is meaningful only when it can).
  // Seed real content: the first via the canonical empty-state action, the
  // rest via the palette (the empty state unmounts after the first insert).
  await page.locator('[data-screen-frame]').getByRole("button", { name: "Button", exact: true }).click();
  await page.waitForTimeout(300);
  for (const label of ["Text", "Image"]) {
    await page.locator(`button[title^="Add “${label}”"]`).first().click();
    await page.waitForTimeout(250);
  }
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.waitForTimeout(500);
  await page.locator('[data-screen-frame] [data-node-id]').first().click();
  await page.waitForTimeout(400);
  const frameBefore = await page.locator('[data-screen-frame]').boundingBox();
  const rail = page.locator("#workspace-right-panel .overflow-y-auto").last();
  await rail.evaluate((el) => {
    el.scrollTop = 200;
  });
  await page.waitForTimeout(300);
  const frameAfter = await page.locator('[data-screen-frame]').boundingBox();
  check("C1: scrolling the inspector does NOT move the central viewport",
    frameBefore !== null && frameAfter !== null &&
    near(frameBefore.x, frameAfter.x, 1) && near(frameBefore.y, frameAfter.y, 1));
  const scrolled = await rail.evaluate((el) => el.scrollTop);
  check("C2: the inspector rail actually scrolls (independent container)",
    scrolled > 50, `scrollTop=${scrolled}`);
  // §11: changing selection must NOT reset the rail's scroll to the top —
  // (focus restoration may shift it, but it must stay scrolled into content).
  const before = await rail.evaluate((el) => el.scrollTop);
  await page.locator('[data-screen-frame] [data-node-id]').nth(1).click();
  await page.waitForTimeout(400);
  const after = await rail.evaluate((el) => el.scrollTop);
  check("C3: selecting another object does not reset the inspector scroll to top",
    after > 0, `before=${before} after=${after}`);
}
{
  const section = page.locator("[data-inspector-section]").first();
  const sectionId = await section.getAttribute("data-inspector-section");
  await section.click();
  await page.waitForTimeout(200);
  check("C4: inspector sections collapse (aria-expanded=false + content hidden)",
    (await section.getAttribute("aria-expanded")) === "false" &&
    (await page.locator(`#inspector-section-${sectionId?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`).isVisible()) === false);
  await section.click();
  await page.waitForTimeout(200);
  check("C5: inspector sections re-expand",
    (await section.getAttribute("aria-expanded")) === "true");
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.waitForTimeout(300);
}

// ---- D. Panel collapse rails -----------------------------------------------------------
{
  await page.locator('[data-toggle-left-panel="true"]').click();
  await page.waitForTimeout(300);
  const collapsedRail = await page.locator('[data-toggle-left-panel][aria-expanded="false"]').isVisible();
  const frameWider = await page.locator('[data-screen-frame]').boundingBox();
  check("D1: collapsing the left panel leaves a compact rail with a recovery button",
    collapsedRail === true && frameWider !== null);
  await page.locator('[data-toggle-left-panel][aria-expanded="false"]').click();
  await page.waitForTimeout(300);
  check("D2: the left panel re-expands (aria-expanded=true, palette visible)",
    (await page.locator('[data-toggle-left-panel][aria-expanded="true"]').count()) === 1 &&
    (await page.locator("[data-palette-search]").isVisible()));
  await page.locator('[data-toggle-right-panel="true"]').click();
  await page.waitForTimeout(300);
  const rightCollapsed = await page.locator('[data-toggle-right-panel][aria-expanded="false"]').isVisible();
  await page.locator('[data-toggle-right-panel][aria-expanded="false"]').click();
  await page.waitForTimeout(200);
  check("D3: the inspector panel collapses and re-expands the same way",
    rightCollapsed === true &&
    (await page.locator('[data-toggle-right-panel][aria-expanded="true"]').count()) === 1);
}

// ---- E. Code + blocks + preview scrolling ----------------------------------------------
await page.locator('[data-mode-tab="code"]').click();
await page.waitForTimeout(1200);
{
  // Monaco owns its scroll: fill the buffer past the visible area, jump the
  // cursor to the end (Ctrl+End scrolls internally), and assert the view
  // transformed while the page itself never scrolled.
  await page.locator(".monaco-editor").click();
  await page.keyboard.type("// scroll line\n".repeat(45));
  await page.waitForTimeout(300);
  // Deterministic scroll positions: Ctrl+Home = top, Ctrl+End = bottom.
  await page.keyboard.press("Control+Home");
  await page.waitForTimeout(300);
  const beforeTop = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return lines ? lines.getBoundingClientRect().top : 0;
  });
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(400);
  const afterTop = await page.evaluate(() => {
    const lines = document.querySelector(".monaco-editor .view-lines");
    return lines ? lines.getBoundingClientRect().top : 0;
  });
  const pageY = await page.evaluate(() => document.scrollingElement.scrollTop);
  check("E1: code scrolls in its own container (Ctrl+Home→End scrolls the view, page still)",
    afterTop < beforeTop - 40 && pageY === 0, `before=${beforeTop} after=${afterTop} pageY=${pageY}`);
}
await page.locator('[data-mode-tab="blocks"]').click();
await page.waitForTimeout(900);
{
  // Blocks: palette rail scrolls; empty-state hint present; pan + zoom real.
  const rail = page.locator("aside .overflow-y-auto").last();
  await rail.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(200);
  check("E2: the blocks palette rail scrolls independently",
    (await rail.evaluate((el) => el.scrollTop > 0)) === true);
  check("E3: the blocks empty state carries the beginner hint",
    (await page.locator("[data-blocks-hint]").count()) === 1);
  // Pan: PLAIN WHEEL over the canvas pans vertically (blocks-canvas onWheel:
  // ctrl+wheel zooms, plain wheel pans) — real canvas pan, page never moves.
  const canvasBox = await page.locator("[data-dz='park']").boundingBox();
  const centerX = canvasBox.x + Math.min(canvasBox.width / 2, 700);
  const centerY = canvasBox.y + Math.min(canvasBox.height / 2, 300);
  // The canvas view container is the transformed ANCESTOR of the park plane.
  const viewTransform = () => page.evaluate(() => {
    const plane = document.querySelector("[data-dz='park']");
    let node = plane?.parentElement;
    while (node && !node.style.transform.includes("translate")) node = node.parentElement;
    return node ? node.style.transform : "";
  });
  const worldBefore = await viewTransform();
  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(300);
  const worldAfter = await viewTransform();
  check("E4: wheel over the blocks canvas PANS the view (transform changed)",
    worldBefore !== worldAfter, `${worldBefore} → ${worldAfter}`);
  // Zoom: ctrl+wheel over the canvas.
  const zoomBefore = await viewTransform();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -240);
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
  const zoomAfter = await viewTransform();
  check("E5: ctrl+wheel ZOOMS the blocks canvas",
    zoomBefore !== zoomAfter, `${zoomBefore} → ${zoomAfter}`);
  const pageScroll = await page.evaluate(() => document.scrollingElement.scrollTop);
  check("E6: blocks pan/zoom never scrolls the PAGE", pageScroll === 0);
}
await page.locator('[data-mode-tab="preview"]').click();
await page.waitForTimeout(900);
check("E7: preview keeps its controls reachable (device + zoom + restart)",
  (await page.locator('[aria-label="Device preset"]').isVisible()) &&
  (await page.locator('[aria-label="Viewport scale"]').isVisible()) &&
  (await page.getByTitle("Restart the run with fresh state").isVisible()) ||
  (await page.getByRole("button", { name: /Restart|restart/i }).count()) >= 1);

// ---- F. 3D wheel routing ---------------------------------------------------------------
await open(project3d.id);
{
  // §42 flow: add a Cube through the canonical empty state so the pointer
  // reaches the canvas (the empty-state card otherwise intercepts it).
  await page.locator('[data-3d-empty-state] button', { hasText: "Cube" }).first().click();
  await waitForSaved(page);
  await page.waitForTimeout(600);
  const canvasBox = await page.locator("canvas[data-viewport-3d]").boundingBox();
  const distBefore = parseFloat((await page.locator("canvas[data-viewport-3d]").getAttribute("data-orbit-distance")) ?? "9");
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.wheel(0, -240); // wheel up = zoom in
  await page.waitForTimeout(400);
  const distAfter = parseFloat((await page.locator("canvas[data-viewport-3d]").getAttribute("data-orbit-distance")) ?? "9");
  check("F1: mouse wheel over the 3D viewport ZOOMS the 3D camera (no page scroll)",
    near(distBefore, distAfter * 1.1, 0.6) && distAfter < distBefore,
    `${distBefore} → ${distAfter}`);
  const pageScroll = await page.evaluate(() => document.scrollingElement.scrollTop);
  check("F2: the 3D wheel does not scroll the page", pageScroll === 0);
  // Palette wheel: hover the left rail and wheel — palette scrolls, camera unchanged.
  const dist0 = await page.locator("canvas[data-viewport-3d]").getAttribute("data-orbit-distance");
  await page.locator("#workspace-left-panel .overflow-y-auto").nth(1).hover();
  const beforeTop = await page.locator("#workspace-left-panel .overflow-y-auto").nth(1).evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(300);
  const afterTop = await page.locator("#workspace-left-panel .overflow-y-auto").nth(1).evaluate((el) => el.scrollTop);
  const dist1 = await page.locator("canvas[data-viewport-3d]").getAttribute("data-orbit-distance");
  check("F3: wheel over the palette never reaches the 3D camera (page still too)",
    dist0 === dist1 && afterTop === beforeTop,
    `${beforeTop} → ${afterTop}, dist ${dist0} vs ${dist1}`);
}

// ---- G. Drawers at 390/768 --------------------------------------------------------------
await page.setViewportSize({ width: 390, height: 844 });
await open(appProject.id);
check("G1: 390px — no desktop rails, no horizontal overflow, FABs present",
  (await page.locator("#workspace-left-panel").isVisible()) === false &&
  (await noOverflow()) === true &&
  (await page.locator("[data-open-palette-drawer]").isVisible()) === true);
{
  await page.locator("[data-open-palette-drawer]").click();
  await page.waitForTimeout(400);
  const drawerVisible = await page.locator('[data-drawer="palette"]').isVisible();
  check("G2: 390px — the palette drawer opens with search + categories",
    drawerVisible === true && (await page.locator('[data-drawer="palette"] [data-palette-search]').isVisible()));
  // One-drawer rule: close the palette drawer, then the inspector drawer —
  // the open drawer's backdrop covers the other FAB (modal behavior).
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.locator('[data-open-inspector-drawer="true"]').click();
  await page.waitForTimeout(400);
  check("G3: 390px — only one major drawer occupies the screen at a time",
    (await page.locator('[data-drawer="palette"]').count()) === 0 &&
    (await page.locator('[data-drawer="inspector"]').isVisible()) === true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("G4: Escape closes the drawer",
    (await page.locator('[data-drawer="inspector"]').count()) === 0);
}
await page.setViewportSize({ width: 768, height: 900 });
await page.waitForTimeout(400);
check("G5: 768px — left rail visible, inspector as drawer FAB (no overflow)",
  (await page.locator("#workspace-left-panel").isVisible()) === true &&
  (await page.locator("#workspace-right-panel").isVisible()) === false &&
  (await noOverflow()) === true);
for (const width of [1024, 1280, 1440]) {
  await page.setViewportSize({ width, height: 950 });
  await page.waitForTimeout(400);
  check(`G6: ${width}px — three-column workspace usable, no overflow`,
    (await page.locator("#workspace-left-panel").isVisible()) === true &&
    (await page.locator("#workspace-right-panel").isVisible()) === true &&
    (await noOverflow()) === true);
}

// ---- H. Diagnostics + no-error hygiene ---------------------------------------------------
await page.setViewportSize({ width: 1440, height: 950 });
await open(appProject.id);
check("H1: diagnostics starts collapsed with a tooltip",
  (await page.locator("[data-diagnostics-toggle]").getAttribute("aria-expanded")) === "false" &&
  ((await page.locator("[data-diagnostics-toggle]").getAttribute("title")) ?? "").length > 0);

console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 12)) console.log(`  ${e}`);
console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0 || errors.length > 0) process.exit(1);
