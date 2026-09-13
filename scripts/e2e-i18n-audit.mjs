// TASK 10 language audit: for each page, capture EN and ID screenshots and
// check horizontal overflow in BOTH languages (Indonesian runs longer).
// Usage: PLAYWRIGHT_MODULE=/tmp/iv-pw/node_modules/playwright/index.mjs node scripts/e2e-i18n-audit.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const WEB = "http://localhost:3000";
const API = "http://localhost:8090";
const PAGES = ["/", "/login", "/register", "/dashboard", "/community", "/explore", "/extensions", "/pricing"];
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
const cookie = await apiRegister(`i18n-${stamp}@ex.com`, `i18n${stamp}`);

const contexts = [];
for (const locale of ["en", "id"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  await ctx.addCookies([
    { name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    { name: "ideaven-locale", value: locale, domain: "localhost", path: "/" },
  ]);
  contexts.push({ locale, ctx });
}

// Register the switcher's localStorage key too (the cookie above is not read
// by the app; the app uses localStorage or the account preference).
for (const { locale, ctx } of contexts) {
  const page = await ctx.newPage();
  await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((loc) => window.localStorage.setItem("ideaven-locale", loc), locale);
  await page.close();
}

for (const path of PAGES) {
  const shots = {};
  for (const { locale, ctx } of contexts) {
    const page = await ctx.newPage();
    await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    shots[locale] = { overflow, text: (await page.locator("body").innerText()).slice(0, 400) };
    await page.screenshot({ path: `/tmp/i18n-${locale}${path.replace(/\//g, "_") || "_home"}.png`, fullPage: false });
    await page.close();
  }
  check(`${path}: EN no overflow`, shots.en.overflow <= 0, `${shots.en.overflow}px`);
  check(`${path}: ID no overflow`, shots.id.overflow <= 0, `${shots.id.overflow}px`);
  // The locales must actually differ on translated pages.
  const differs = shots.en.text !== shots.id.text;
  check(`${path}: EN/ID content differs`, differs || ["/docs"].includes(path));
  console.log(`      (${path} ID sample: ${shots.id.text.split("\n").slice(0, 3).join(" | ").slice(0, 110)})`);
}

// Switcher round trip: toggle EN→ID→EN live on the community page.
{
  const ctx = await contexts[0].ctx;
  const page = await ctx.newPage();
  await page.goto(`${WEB}/community`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const before = await page.locator("main h1").first().textContent();
  const switcher = page.locator('[role="group"][aria-label="Language"] button:has-text("ID")').first();
  const switcherVisible = await switcher.isVisible().catch(() => false);
  if (switcherVisible) {
    await switcher.click();
    await page.waitForTimeout(600);
    const after = await page.locator("main h1").first().textContent();
    check("switcher toggles community heading live", before !== after, `${before} → ${after}`);
    // Reload: preference persists (localStorage).
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const persisted = await page.locator("main h1").first().textContent();
    check("ID preference persists after reload", persisted === after, `${persisted}`);
  } else {
    check("switcher available on page", false, "no switcher found");
  }
  await page.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
