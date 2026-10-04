// TASK 65 — Product coherence: landing → dashboard → creation hub → builder.
// Maps to directive §44 (all 36 areas), §45 cross-surface flows (no dead
// ends), §46 visual screenshots (390/768/1280/1440), and §47 builder
// regression spot-checks. Honest-only: every check exercises the real
// surfaces and the ONE canonical creation flow (/start → the Creation Hub).
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const API = "http://localhost:8090";
const WEB = "http://localhost:3000";
const SHOT_DIR = "scripts/screenshots-task65";
import { mkdirSync, statSync } from "node:fs";
mkdirSync(SHOT_DIR, { recursive: true });

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

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function capture(page, name) {
  const path = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  return statSync(path).size;
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);

// ---- Three real users: A builds + publishes; B remixes; C stays at zero. -------
const cookieA = await apiRegister(`t65a-${stamp}@ex.com`, `t65a${stamp}`);
const cookieB = await apiRegister(`t65b-${stamp}@ex.com`, `t65b${stamp}`);
const cookieC = await apiRegister(`t65c-${stamp}@ex.com`, `t65c${stamp}`); // zero projects (§35)

const contextA = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US", acceptDownloads: true });
const contextB = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US" });
const contextAnon = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US" });
for (const [ctx, cookie] of [[contextA, cookieA], [contextB, cookieB]]) {
  await ctx.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}
const page = await contextA.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401") && !m.text().includes("Failed to load resource")) {
    errors.push(`console: ${m.text().slice(0, 160)}`);
  }
});

// =================================================================================
console.log("--- 1. Landing (logged out) ---");
{
  const anon = await contextAnon.newPage();
  await anon.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await anon.waitForTimeout(900);
  check("1: landing loads with the hero product statement",
    ((await anon.locator("#hero-title").textContent()) ?? "").includes("Build it your way"));
  const navHrefs = await anon.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Primary"] a')].map((a) => a.getAttribute("href")));
  check("2: landing navigation points at real Learn/Explore/Community/Pricing/Create",
    ["/learn", "/explore", "/community", "/pricing", "/start"].every((h) => navHrefs.includes(h)),
    JSON.stringify(navHrefs));
  check("3: Start Building CTA present and canonical",
    (await anon.locator('a[href="/start"]').filter({ hasText: "Start Building" }).count()) >= 1);
  check("4: Explore CTA opens the real gallery",
    (await anon.locator('a[href="/explore"]').filter({ hasText: "Explore" }).count()) >= 1);
  const pathsSection = anon.locator("#ways-to-create");
  check("5: THREE WAYS TO CREATE section exists with App/2D/3D cards",
    (await pathsSection.count()) === 1 &&
    (await pathsSection.getByRole("link", { name: "Start App" }).count()) === 1 &&
    (await pathsSection.getByRole("link", { name: "Start 2D Game" }).count()) === 1 &&
    (await pathsSection.getByRole("link", { name: "Start 3D Game" }).count()) === 1);
  check("6: the three creation CTAs enter the canonical hub with a ?type preselect",
    (await pathsSection.locator('a[href="/start?type=app"]').count()) === 1 &&
    (await pathsSection.locator('a[href="/start?type=game"]').count()) === 1 &&
    (await pathsSection.locator('a[href="/start?type=3d"]').count()) === 1);
  check("7: extensions positioned honestly (real blocks → Blocks palette)",
    /publish your own blocks as extensions/i.test((await pathsSection.textContent()) ?? ""));
  const landingText = (await anon.locator("body").textContent()) ?? "";
  check("8: no fake creator/project/build counts",
    !/\d+[KM]\+\s*(creators|projects|builds|users)/i.test(landingText));
  check("9: logged-out header shows Log in + Start Building (no workspace chrome)",
    (await anon.getByRole("link", { name: "Log in" }).count()) >= 1 &&
    (await anon.locator('a[href="/start"]').count()) >= 1 &&
    (await anon.locator('a[href="/dashboard"]').count()) === 0);
  await anon.evaluate(() => localStorage.setItem("ideaven-locale", "id"));
  await anon.reload({ waitUntil: "networkidle" });
  await anon.waitForTimeout(700);
  check("10: ID works on the landing (translated creation section)",
    ((await anon.textContent("body")) ?? "").includes("Tiga cara mencipta"));
  await anon.evaluate(() => localStorage.setItem("ideaven-locale", "en"));
  await anon.evaluate(() => localStorage.setItem("ideaven-theme", "light"));
  await anon.reload({ waitUntil: "networkidle" });
  check("11: light theme applies (data-theme=light)",
    (await anon.evaluate(() => document.documentElement.dataset.theme)) === "light");
  await anon.evaluate(() => localStorage.setItem("ideaven-theme", "dark"));
  await anon.reload({ waitUntil: "networkidle" });
  check("12: dark theme applies (data-theme=dark)",
    (await anon.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  check("13: landing has exactly one h1 and a footer landmark",
    (await anon.locator("h1").count()) === 1 && (await anon.locator("footer").count()) >= 1);
  check("14: primary CTAs are accessible by name",
    (await anon.getByRole("link", { name: "Start Building" }).count()) >= 1 &&
    (await anon.getByRole("link", { name: "Explore", exact: true }).count()) >= 1);
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await anon.setViewportSize({ width, height: 900 });
    await anon.goto(`${WEB}/`, { waitUntil: "networkidle" });
    await anon.waitForTimeout(500);
    check(`15: landing at ${width}px — no horizontal overflow`, await overflow(anon));
  }
  await anon.setViewportSize({ width: 1440, height: 950 });
  const sizes = {};
  for (const width of [390, 768, 1280, 1440]) {
    await anon.setViewportSize({ width, height: 900 });
    await anon.goto(`${WEB}/`, { waitUntil: "networkidle" });
    await anon.waitForTimeout(500);
    sizes[width] = await capture(anon, `landing-${width}`);
  }
  check("16: landing screenshots captured at 390/768/1280/1440",
    Object.values(sizes).every((s) => s > 10000), JSON.stringify(sizes));
  await anon.goto(`${WEB}/explore`, { waitUntil: "networkidle" });
  check("17: /explore has real metadata title", (await anon.title()).includes("Explore"));
  await anon.close();
}

// =================================================================================
console.log("--- 2. /start router + Creation Hub (canonical flow) ---");
{
  const anon = await contextAnon.newPage();
  await anon.goto(`${WEB}/start?type=game`, { waitUntil: "domcontentloaded" });
  await anon.waitForURL(/\/register\?next=/, { timeout: 20000 });
  check("18: anonymous /start → sign-up with a next= return path (no dead end)", true);
  await anon.close();

  await page.goto(`${WEB}/start?type=game`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/projects\/new/, { timeout: 20000 });
  await page.waitForTimeout(900);
  check("19: authenticated /start opens the Creation Hub (one canonical flow)",
    page.url().includes("/dashboard/projects/new"));
  check("20: ?type=game preselects the environment (step 2 of the SAME hub)",
    ((await page.textContent("body")) ?? "").includes("How do you want to start?"));
  await page.getByRole("button", { name: "Change environment" }).click();
  await page.waitForTimeout(400);
  check("21: the environment step lists all three environments",
    (await page.getByRole("button", { name: "Start 2D Game" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Start 3D Game" }).count()) === 1 &&
    (await page.getByRole("button", { name: "Start App" }).count()) === 1);
}

// =================================================================================
console.log("--- 3. Create all three environments through the hub ---");
async function createViaHub(type, name) {
  await page.goto(`${WEB}/dashboard/projects/new?type=${type}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Blank project" }).click();
  await page.waitForTimeout(400);
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: /Create project/ }).click();
  await page.waitForURL(/\/builder\//, { timeout: 30000 });
  await page.waitForTimeout(1800);
  return page.url().split("/builder/")[1];
}
let gameId = null;
{
  await createViaHub("app", `Coherence App ${stamp}`);
  check("22: Start App creates type=app and opens the APP builder",
    (await page.locator('[data-engine-identity="app"]').count()) === 1);
  gameId = await createViaHub("game", `Coherence Runner ${stamp}`);
  check("23: Start 2D Game opens the builder with the 2D GAME identity",
    ((await page.locator('[data-engine-identity="game"]').textContent()) ?? "").includes("2D GAME"));
  await createViaHub("3d", `Coherence World ${stamp}`);
  check("24: Start 3D Game opens Viewport3D with the 3D GAME identity",
    (await page.locator("canvas[data-viewport-3d]").count()) >= 1 &&
    ((await page.locator('[data-engine-identity="3d"]').textContent()) ?? "").includes("3D GAME"));
}

// =================================================================================
console.log("--- 4. Dashboard: cards, identity, return state, empty state ---");
{
  await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  check("25: dashboard home answers 'what should I do now' (Create Project primary)",
    (await page.locator('a[href="/dashboard/projects/new"]').filter({ hasText: /Create Project/i }).count()) >= 1);
  check("26: dashboard shows real recent projects (return state, actual data)",
    (await page.locator("[data-engine-badge]").count()) >= 3);
  check("27: project cards carry the ENGINE IDENTITY badge (2D GAME / 3D GAME / APP)",
    ((await page.locator('[data-engine-badge="game"]').first().textContent()) ?? "").includes("2D GAME") &&
    ((await page.locator('[data-engine-badge="3d"]').first().textContent()) ?? "").includes("3D GAME"));
  check("28: dashboard home has the secondary doors (Templates / Learn / Community)",
    (await page.locator('a[href="/dashboard/templates"]').count()) >= 1 &&
    (await page.locator('a[href="/learn"]').count()) >= 1 &&
    (await page.locator('a[href="/community"]').count()) >= 1);
  await page.locator(`a[aria-label="Open Coherence Runner ${stamp}"]`).click();
  await page.waitForURL(/\/builder\//, { timeout: 15000 });
  check("29: opening a project card routes into the builder", page.url().includes("/builder/"));

  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US" });
  await ctxC.addCookies([{ name: "ideaven_session", value: cookieC.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const pageC = await ctxC.newPage();
  await pageC.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await pageC.waitForTimeout(1400);
  check("30: empty dashboard shows the three canonical creation entries",
    (await pageC.getByRole("link", { name: "Create Application" }).count()) === 1 &&
    (await pageC.getByRole("link", { name: "Create 2D Game" }).count()) === 1 &&
    (await pageC.getByRole("link", { name: "Create 3D Game" }).count()) === 1);
  await pageC.setViewportSize({ width: 390, height: 900 });
  await pageC.waitForTimeout(600);
  check("31: empty dashboard at 390px — no overflow", await overflow(pageC));
  await ctxC.close();
}

// =================================================================================
console.log("--- 5. Publish → public page → remix (the share journey) ---");
{
  // Give the game a real scene entity so the published page plays an actual
  // scene (a blank screen renders the honest "empty" stage — no canvas).
  const cur = await fetch(`${API}/api/projects/${gameId}`, { headers: { Cookie: cookieA } });
  const model = (await cur.json()).project.model;
  model.screens[0].components.push({
    id: "e-player",
    type: "player",
    props: { name: "Player", x: 74, y: 200, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true },
  });
  await fetch(`${API}/api/projects/${gameId}/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ model }),
  });

  await page.goto(`${WEB}/dashboard/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator(`a[aria-label="Open Coherence Runner ${stamp}"]`).click();
  await page.waitForURL(/\/builder\//, { timeout: 15000 });
  await page.waitForTimeout(1600);
  await page.locator('button[aria-label="Publish"]').click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Publish to the web" }).click();
  await page.waitForTimeout(3000);
  const publicHref = await page.locator('a[href^="/p/"]').first().getAttribute("href");
  check("32: publish produces a real public page link (/p/<slug>)",
    typeof publicHref === "string" && publicHref.startsWith("/p/"), String(publicHref));

  await page.goto(`${WEB}${publicHref}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  check("33: public project page shows the same engine identity (2D GAME)",
    ((await page.locator("[data-engine-badge]").first().textContent()) ?? "").includes("2D GAME"));
  check("34: the published preview is the REAL runtime (canvas renders, reachable)",
    (await page.locator("canvas").count()) >= 1);
  check("35: public metadata uses the IDEAVEN — <name> format (public-safe)",
    (await page.title()).startsWith("IDEAVEN — "));
  const publicText = (await page.textContent("body")) ?? "";
  check("36: no private editor chrome or secrets on the public page",
    (await page.locator("[data-mode-tab]").count()) === 0 &&
    !publicText.includes("ideaven_session") && !publicText.includes("diagnostics"));

  const shotOk = (await capture(page, "public-project-1440")) > 10000;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(600);
  const shotMobile = (await capture(page, "public-project-390")) > 10000;
  check("37: public project screenshots captured (1440 + 390)", shotOk && shotMobile);
  await page.setViewportSize({ width: 1440, height: 950 });

  const pageB = await contextB.newPage();
  await pageB.goto(`${WEB}${publicHref}`, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(1400);
  await pageB.getByRole("button", { name: "Remix into my account" }).click();
  await pageB.waitForURL(/\/builder\//, { timeout: 30000 });
  await pageB.waitForTimeout(1800);
  check("38: remix creates a NEW project with the correct engine identity",
    (await pageB.locator('[data-engine-identity="game"]').count()) === 1 &&
    !pageB.url().includes(gameId ?? "none"));
  await pageB.close();
}

// =================================================================================
console.log("--- 6. Cross-surface flows: no dead ends ---");
{
  await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Explore", exact: true }).first().click();
  await page.waitForURL(/\/explore/, { timeout: 15000 });
  await page.waitForTimeout(900);
  check("39: landing → Explore opens the real gallery", page.url().includes("/explore"));

  await page.goto(`${WEB}/learn`, { waitUntil: "networkidle" });
  check("40: Learn connects to creation (Start Building present, no dead end)",
    (await page.locator('a[href="/start"]').filter({ hasText: "Start Building" }).count()) >= 1);

  await page.goto(`${WEB}/pricing`, { waitUntil: "networkidle" });
  check("41: pricing CTA enters the normal creation journey",
    (await page.locator('a[href="/start"]').filter({ hasText: "Start Building" }).count()) >= 1);

  await page.goto(`${WEB}/dashboard/projects/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const hubShot = (await capture(page, "creation-hub-1440")) > 10000;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(600);
  const hubShotMobile = (await capture(page, "creation-hub-390")) > 10000;
  await page.setViewportSize({ width: 1440, height: 950 });
  check("42: creation hub screenshots captured (1440 + 390)", hubShot && hubShotMobile);

  await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const dashShot = (await capture(page, "dashboard-1440")) > 10000;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(600);
  const dashShotMobile = (await capture(page, "dashboard-390")) > 10000;
  await page.setViewportSize({ width: 1440, height: 950 });
  check("43: dashboard screenshots captured (1440 + 390)", dashShot && dashShotMobile);
}

// =================================================================================
console.log("--- 7. Global health ---");
check("44: zero page errors / hydration errors",
  errors.filter((e) => e.startsWith("pageerror")).length === 0, errors.slice(0, 3).join(" | "));
check("45: zero unexpected console errors",
  errors.filter((e) => e.startsWith("console:")).length === 0,
  errors.filter((e) => e.startsWith("console:")).slice(0, 3).join(" | "));

console.log(`\nerrors: ${errors.length}`);
console.log(`passed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0) process.exit(1);
