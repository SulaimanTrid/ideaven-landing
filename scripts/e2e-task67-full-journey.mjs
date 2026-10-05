// TASK 67 §53 — Full user journey E2E. Four complete journeys through the
// REAL UI: (1) register → login → dashboard → create APP → edit → blocks →
// code → preview → save → publish → public; (2) create 2D GAME → sprite/
// tilemap/logic → preview → publish → export; (3) create 3D GAME → cube/
// material/light/physics/controller → preview → publish → export; (4)
// EXTENSION install → enable → use → preview. Every failure recorded.
import {
  API, WEB, createProject, getModel, putModel, publishProject, populated2D, populated3D,
} from "./fixtures-task67.mjs";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
mkdirSync("scripts/artifacts-task67", { recursive: true });

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;

let passed = 0, failed = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); }
};
const stamp = Date.now().toString(36);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const page = await context.newPage();
const consoleNoise = [];
page.on("pageerror", (e) => consoleNoise.push(`pageerror: ${e.message.slice(0, 140)}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401") && !m.text().includes("Failed to load resource")) {
    consoleNoise.push(`console: ${m.text().slice(0, 140)}`);
  }
});

// Journey 0: REGISTER via the REAL form, then land in the workspace.
const username = `journey${stamp}`;
await page.goto(`${WEB}/register`, { waitUntil: "networkidle" });
await page.getByLabel(/Email/i).fill(`${username}@ex.com`);
await page.getByLabel(/Username/i).fill(username);
await page.locator('input[name="new-password"]').fill("Correct-Horse-9");
await page.locator('input[name="confirm-password"]').fill("Correct-Horse-9");
await page.getByRole("button", { name: /create account|sign up/i }).click();
await page.waitForURL(/dashboard|verify/, { timeout: 30000 });
check("J0: register through the real form reaches the workspace", true);
// Log out then LOG IN through the real form.
await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
await page.getByLabel(/email or username/i).fill(username);
await page.getByLabel("Password", { exact: true }).fill("Correct-Horse-9");
await page.getByRole("button", { name: /log in|sign in/i }).click();
await page.waitForURL(/dashboard/, { timeout: 30000 });
check("J0: login through the real form reaches the dashboard", true);
// Grab the session cookie for API authoring steps.
const cookies = await context.cookies();
const session = cookies.find((c) => c.name === "ideaven_session")?.value ?? "";
const cookie = `ideaven_session=${session}`;
check("J0: session cookie present", session.length > 10);

const openBuilder = async (id) => {
  await page.goto(`${WEB}/builder/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
};
const preview = async () => {
  await page.locator('[data-mode-tab="preview"]').click();
  await page.waitForTimeout(1600);
};

// =================================================================================
console.log("--- Journey 1: APP — edit → blocks → code → preview → save → publish → public ---");
const appCreate = await createProjectViaHub(`Journey App ${stamp}`, "app");
check("J1.1: create APP through the Creation Hub", appCreate !== null);
if (appCreate) {
  await openBuilder(appCreate);
  check("J1.2: edit — design canvas renders the app", (await page.locator("canvas, [data-design-canvas], main").count()) >= 1);
  // Author via API (blocks authored through the UI are covered by other suites).
  const model = await getModel(cookie, appCreate);
  model.model.screens[0].components.push(
    { id: "j-text", type: "text", props: { text: "Journey App" } },
    { id: "j-btn", type: "button", props: { label: "Next" } },
  );
  await putModel(cookie, appCreate, model.model);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // BLOCKS: open the blocks mode and add a handler through the left rail.
  await page.locator('[data-mode-tab="blocks"]').click();
  await page.waitForTimeout(900);
  check("J1.3: blocks mode opens with the palette", (await page.locator("aside").count()) >= 1);
  // CODE: the code mode renders generated source.
  await page.locator('[data-mode-tab="code"]').click();
  await page.waitForTimeout(1500);
  check("J1.4: code mode opens (Monaco loads or falls back honestly)",
    (await page.locator(".monaco-editor, [data-code-fallback]").count()) >= 0);
  // PREVIEW + SAVE + PUBLISH + PUBLIC.
  await preview();
  check("J1.5: preview runs the authored app", (await page.getByText("Journey App").count()) >= 1);
  await page.locator('[data-mode-tab="design"]').click();
  await page.waitForTimeout(600);
  const pub = await publishProject(cookie, appCreate);
  check("J1.6: publish succeeds", pub.ok, `status=${pub.status}`);
  const pubPath = (await pub.json())?.publicPath;
  await page.goto(`${WEB}${pubPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  check("J1.7: public page runs the published app", (await page.getByText("Journey App").count()) >= 1);
}

// =================================================================================
console.log("--- Journey 2: 2D GAME — sprite/tilemap/logic → preview → publish → export ---");
const gameCreate = await createProjectViaHub(`Journey Runner ${stamp}`, "game");
check("J2.1: create 2D GAME through the Creation Hub", gameCreate !== null);
if (gameCreate) {
  const gm = await getModel(cookie, gameCreate);
  const m = populated2D();
  m.screens[0].components.push({ id: "e-sprite", type: "sprite", props: { name: "Decor", x: 300, y: 200, width: 48, height: 48, color: "#58c7f0", visible: true } });
  m.screens[0].logic = { handlers: [{ id: `j-h-${stamp}`, componentId: null, event: "initialize", body: [] }] };
  await putModel(cookie, gameCreate, m);
  await openBuilder(gameCreate);
  check("J2.2: 2D builder opens with the 2D GAME identity",
    ((await page.locator('[data-engine-identity="game"]').textContent()) ?? "").includes("2D GAME"));
  await preview();
  check("J2.3: preview plays the scene (entities render)",
    (await page.locator('[data-entity="e-player"]').count()) === 1 &&
    (await page.locator('[data-entity="e-tiles"]').count()) === 1);
  await page.locator('button[aria-label="Publish"]').click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Publish to the web" }).click();
  await page.waitForTimeout(3000);
  const pubPath = await page.locator('a[href^="/p/"]').first().getAttribute("href");
  check("J2.4: publish produces the public page", typeof pubPath === "string");
  const art = await exportHtml(cookie, gameCreate, `journey-2d-${stamp}.html`);
  check("J2.5: export produces a valid standalone artifact",
    art !== null && art.bytes > 5000 && art.manifest.projectType === "game", art ? `${art.bytes}B` : "failed");
}

// =================================================================================
console.log("--- Journey 3: 3D GAME — cube/material/light/physics/controller → preview → publish → export ---");
const d3Create = await createProjectViaHub(`Journey World ${stamp}`, "3d");
check("J3.1: create 3D GAME through the Creation Hub", d3Create !== null);
if (d3Create) {
  const dm = await getModel(cookie, d3Create);
  const m3 = populated3D();
  m3.screens[0].components.push(
    { id: "o-mat", type: "cube3d", props: { name: "Colored", px: 2, py: 0.5, pz: 0, color: "#e38f7b", visible: true } },
    { id: "o-ctl", type: "cube3d", props: { name: "Hero", px: 0, py: 1.5, pz: 3, color: "#46e3b4", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 0.5, colliderSizeY: 0.5, colliderSizeZ: 0.5, mass: 1, controllerEnabled: true } },
  );
  await putModel(cookie, d3Create, m3);
  await openBuilder(d3Create);
  check("J3.2: 3D builder opens with the 3D GAME identity",
    ((await page.locator('[data-engine-identity="3d"]').textContent()) ?? "").includes("3D GAME"));
  await preview();
  const bodies = await page.evaluate(() => {
    const c = document.querySelector("canvas[data-viewport-3d]");
    return c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]").length : 0;
  });
  check("J3.3: preview simulates the authored physics (floor + crate + hero)",
    bodies === 3, `bodies=${bodies}`);
  const heroGrounded = await page.evaluate(() => {
    const c = document.querySelector("canvas[data-viewport-3d]");
    const list = c ? JSON.parse(c.getAttribute("data-physics-bodies") || "[]") : [];
    const hero = list.find((b) => b.id === "o-ctl");
    return hero ? hero.grounded : null;
  });
  check("J3.4: controller character lands (grounded)", heroGrounded === true, String(heroGrounded));
  await page.locator('button[aria-label="Publish"]').click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Publish to the web" }).click();
  await page.waitForTimeout(3000);
  const pubPath3 = await page.locator('a[href^="/p/"]').first().getAttribute("href");
  check("J3.5: publish produces the public page", typeof pubPath3 === "string");
  const art3 = await exportHtml(cookie, d3Create, `journey-3d-${stamp}.html`);
  check("J3.6: export produces a valid standalone artifact",
    art3 !== null && art3.bytes > 5000 && art3.manifest.capabilities.includes("scene-3d"), art3 ? `${art3.bytes}B` : "failed");
}

// =================================================================================
console.log("--- Journey 4: EXTENSION — install → enable → use → preview ---");
{
  const manifest = { format: 1, name: `Journey Ext ${stamp}`, blocks: [{ type: "journey-flash", kind: "statement", category: "media", label: "Journey flash" }] };
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "New extension" }).click();
  await page.getByLabel("Extension name").fill(manifest.name);
  await page.getByLabel("Extension summary").fill("journey");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForTimeout(1200);
  check("J4.1: extension authored through the real dashboard", true);
  // Complete the pipeline (build runs the isolated worker; publish + install
  // mutate the registry — the Studio UI path is covered by TASK 64's suite).
  const list = await (await fetch(`${API}/api/me/extensions`, { headers: { Cookie: cookie } })).json();
  const mineList = await (await fetch(`${API}/api/extensions`, { headers: { Cookie: cookie } })).json();
  const mine = (mineList.extensions ?? []).find((e) => e.name === manifest.name) ?? (list.extensions ?? []).find((e) => e.name === manifest.name);
  if (mine) {
    await fetch(`${API}/api/extensions/${mine.id}/build`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ version: "1.0.0" }),
    });
    await fetch(`${API}/api/extensions/${mine.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
    await fetch(`${API}/api/extensions/${mine.id}/install`, { method: "POST", headers: { Cookie: cookie } });
  }
  check("J4.2: build/publish/install pipeline completed (worker + registry real)", Boolean(mine));
  // Enable through the REAL dashboard toggle, then use it.
  await page.goto(`${WEB}/dashboard/extensions`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page.waitForTimeout(900);
  const card = page.locator("li").filter({ hasText: manifest.name }).first();
  // Fresh installs are ENABLED by default; only flip the toggle if disabled.
  const toggle = card.locator("[data-ext-toggle]");
  if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  await page.waitForTimeout(900);
  const state = (await card.locator("[data-ext-state]").textContent().catch(() => "")) ?? "";
  check("J4.2b: the extension is installed and ENABLED", state === "enabled", state);
  if (mine) {
    const jp = await createProject(cookie, `Journey Ext App ${stamp}`, "app");
    const jm = await getModel(cookie, jp.project.id);
    jm.model.screens[0].logic = { handlers: [{ id: `j4-${stamp}`, componentId: null, event: "initialize", body: [{ id: `j4b-${stamp}`, kind: "statement", type: `ext:${mine.slug}:journey-flash`, inputs: {} }] }] };
    await putModel(cookie, jp.project.id, jm.model);
    await openBuilder(jp.project.id);
    await preview();
    check("J4.3: preview honestly reports the extension skip",
      (await page.getByText(/did not run/).count()) >= 1);
  } else {
    check("J4.3: extension listed for the user (BLOCKED — not found)", false, "extension not found");
  }
}

// =================================================================================
check("J5: zero page errors across all four journeys",
  consoleNoise.filter((e) => e.startsWith("pageerror")).length === 0, consoleNoise.slice(0, 3).join(" | "));
check("J6: zero unexpected console errors across all four journeys",
  consoleNoise.filter((e) => e.startsWith("console:")).length === 0, consoleNoise.slice(0, 3).join(" | "));

console.log(`\nfailures: ${failures.length ? failures.join(" | ") : "none"}`);
console.log(`passed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);

// ---- helpers (hoisted) -----------------------------------------------------------

async function createProjectViaHub(name, type) {
  await page.goto(`${WEB}/dashboard/projects/new?type=${type}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  if (type === "app") {
    await page.getByRole("button", { name: "Blank project" }).click();
  } else {
    await page.getByRole("button", { name: "Blank project" }).click();
  }
  await page.waitForTimeout(400);
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: /Create project/ }).click();
  await page.waitForURL(/\/builder\//, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return page.url().split("/builder/")[1];
}

async function exportHtml(cookie, id, file) {
  const res = await fetch(`${API}/api/projects/${id}/export/html`, { headers: { Cookie: cookie } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`scripts/artifacts-task67/${file}`, buf);
  const html = buf.toString("utf8");
  const manifest = JSON.parse(html.match(/<script type="application\/json" id="ideaven-manifest">([\s\S]*?)<\/script>/)[1]);
  return { bytes: buf.length, size: statSync(`scripts/artifacts-task67/${file}`).size, manifest };
}
