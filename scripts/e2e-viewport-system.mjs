// TASK 11 acceptance: universal viewport system — device/orientation/custom/
// safe-area/fit-zoom, persistence through the model, unified frames.
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

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`vp-${stamp}@ex.com`, `vp${stamp}`);

let attempt = 0, app = null, game = null;
while (attempt < 5 && (!app || !game)) {
  if (!app) {
    const res = await fetch(`${API}/api/projects`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Viewport App", type: "app", template: "todo-starter" }),
    });
    if (res.status === 201) app = (await res.json()).project;
  }
  if (!game) {
    const res = await fetch(`${API}/api/projects`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: "Viewport Game", type: "game", template: "coin-runner" }),
    });
    if (res.status === 201) game = (await res.json()).project;
  }
  if (!app || !game) { await new Promise((r) => setTimeout(r, 15000)); attempt++; }
}
console.log(`projects: app=${app.slug}, game=${game.slug}`);

const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await ctx.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

// ---- 1. APP preview: device chips + safe area + persistence -----------------
await page.goto(`${WEB}/builder/${app.id}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Preview" }).first().click();
await page.waitForTimeout(900);

// Phone by default: the hardware frame renders (side buttons on the body).
const phoneFrame = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("span")].filter((s) => (s.getAttribute("class") ?? "").includes("rounded-r bg-[#2c3448]"));
  return buttons.length;
});
check("app preview renders the phone hardware frame (side buttons)", phoneFrame >= 1, `${phoneFrame}`);

// Safe area toggle: overlay bands appear with px labels.
await page.getByRole("button", { name: /Safe area/ }).click();
await page.waitForTimeout(2600); // autosave debounce
const safeLabel = await page.getByText(/safe area 47px/).count();
check("safe-area overlay appears (47px top band)", safeLabel >= 1);
await page.screenshot({ path: "/tmp/vp-app-safe.png" });
// Persisted? Fetch the model.
{
  const res = await fetch(`${API}/api/projects/${app.id}`, { headers: { Cookie: cookie } });
  const { project } = await res.json();
  check("safeArea persisted to the model", project.model.settings.preview?.safeArea === true, JSON.stringify(project.model.settings.preview));
}

// Orientation: landscape swaps the frame size (390×844 → 844×390).
const portraitH = await page.evaluate(() => {
  const el = document.querySelector('section[aria-label], main')?.querySelector(".relative.overflow-hidden");
  return null;
});
await page.getByRole("button", { name: /Landscape|Portrait/ }).click();
await page.waitForTimeout(700);
// Measure the visible screen surface (the innermost sized div).
const landscape = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("div")].filter((d) => d.style.width === "844px" && d.style.height === "390px");
  return frames.length > 0;
});
check("landscape orientation swaps to 844×390", landscape);

// Device chips: Desktop.
await page.getByRole("button", { name: "Desktop", exact: true }).first().click();
await page.waitForTimeout(600);
const desktopStand = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("div")].filter((d) => d.style.width === "1280px" && d.style.height === "800px");
  return frames.length > 0;
});
check("desktop viewport renders 1280×800", desktopStand);

// Custom viewport.
await page.getByRole("button", { name: "Custom", exact: true }).first().click();
await page.waitForTimeout(400);
await page.locator('input[aria-label="Width"]').fill("900");
await page.locator('input[aria-label="Height"]').fill("700");
await page.waitForTimeout(800);
const custom = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("div")].filter((d) => d.style.width === "900px" && d.style.height === "700px");
  return frames.length > 0;
});
check("custom viewport 900×700 renders", custom);

// Fit/zoom chips exist and scale applies.
await page.getByRole("button", { name: "50%", exact: true }).click();
await page.waitForTimeout(400);
const scaled = await page.evaluate(() => {
  const wrappers = [...document.querySelectorAll("div")].filter((d) => d.style.transform === "scale(0.5)");
  return wrappers.length > 0;
});
check("zoom 50% scales the frame", scaled);
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.waitForTimeout(300);

// ---- 2. Persistence across reload -------------------------------------------
await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Preview" }).first().click();
await page.waitForTimeout(900);
const persistedDevice = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("div")].filter((d) => d.style.width === "900px" && d.style.height === "700px");
  return frames.length > 0;
});
check("custom viewport persists after reload", persistedDevice);
const pressedCustom = await page.getByRole("button", { name: "Custom", exact: true }).getAttribute("aria-pressed");
check("Custom chip is active after reload", pressedCustom === "true");

// ---- 3. GAME preview: viewport shell inside the phone hardware ---------------
await page.goto(`${WEB}/builder/${game.id}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Preview" }).first().click();
await page.waitForTimeout(900);
// The Menu start screen is a flow screen (app frame by design) — navigate
// to the Play scene screen before counting the game viewport shell.
await page.selectOption('select[aria-label="Go to screen"]', { label: "Play" });
await page.waitForTimeout(1000);
const gameShell = await page.evaluate(() => {
  // The corner ticks of the game viewport shell.
  const ticks = [...document.querySelectorAll("span")].filter((s) => (s.getAttribute("class") ?? "").includes("border-violet/40") && ["rounded-tl","rounded-tr","rounded-bl","rounded-br"].some((c) => (s.getAttribute("class") ?? "").includes(c)));
  return ticks.length;
});
check("game viewport shell renders (4 corner ticks)", gameShell >= 4, `${gameShell}`);
await page.getByRole("button", { name: /Landscape|Portrait/ }).click();
await page.waitForTimeout(700);
const gameLandscape = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("div")].filter((d) => d.style.width === "844px" && d.style.height === "390px");
  return frames.length > 0;
});
check("game landscape viewport works", gameLandscape);
await page.screenshot({ path: "/tmp/vp-game-landscape.png" });

// ---- 4. Design canvas unified: same controls ---------------------------------
await page.getByRole("button", { name: "Design", exact: true }).first().click();
await page.waitForTimeout(800);
await page.selectOption('select[aria-label="Go to screen"]', { label: "Play" }).catch(() => null);
await page.waitForTimeout(900);
const canvasFrame = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("div")].filter((d) => d.style.width === "844px" && d.style.height === "390px");
  return frames.length > 0;
});
check("design canvas uses the same landscape viewport", canvasFrame);
// No duplicate implementations: the scene frame now renders inside ViewportFrame (corner ticks present in Design too).
const designTicks = await page.evaluate(() => {
  const ticks = [...document.querySelectorAll("span")].filter((s) => (s.getAttribute("class") ?? "").includes("border-violet/40") && ["rounded-tl","rounded-tr","rounded-bl","rounded-br"].some((c) => (s.getAttribute("class") ?? "").includes(c)));
  return ticks.length;
});
check("design canvas shows the unified game viewport shell", designTicks >= 4);

// ---- 5. Published page: unified frame -----------------------------------------
{
  await fetch(`${API}/api/projects/${game.id}/publish`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}",
  });
  const pub = await ctx.newPage();
  await pub.goto(`${WEB}/p/${game.slug}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pub.waitForTimeout(1800);
  await pub.getByRole("button", { name: /PLAY/ }).click();
  await pub.waitForTimeout(800);
  const pubTicks = await pub.evaluate(() => {
    const ticks = [...document.querySelectorAll("span")].filter((s) => (s.getAttribute("class") ?? "").includes("border-violet/40") && ["rounded-tl","rounded-tr","rounded-bl","rounded-br"].some((c) => (s.getAttribute("class") ?? "").includes(c)));
    return ticks.length;
  });
  check("published page uses the same viewport system", pubTicks >= 4);
  await pub.close();
}

await ctx.close();
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (errors.length) { console.log("\nErrors:"); errors.forEach((e) => console.log(`  ${e}`)); }
process.exit(failed || errors.length ? 1 : 0);
