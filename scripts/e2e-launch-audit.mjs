// Launch-audit regression harness (LAUNCH_AUDIT.md). Run with the dev
// server + API up and IV_COOKIE set to a logged-in session cookie:
//   IV_COOKIE=... node scripts/e2e-launch-audit.mjs [baseUrl]
// Playwright is not a repo dependency; point PLAYWRIGHT_MODULE at an
// installed copy when running outside apps/web:
//   PLAYWRIGHT_MODULE=/tmp/iv-pw/node_modules/playwright/index.mjs
// Exits non-zero on any console/page error, failed request, or mobile
// horizontal overflow on the audited pages.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const COOKIE = process.env.IV_COOKIE;
if (!COOKIE) {
  console.error("IV_COOKIE is required (a logged-in ideaven_session value).");
  process.exit(2);
}

const issues = [];
const failures = [];

const sweep = async (page, label, path) => {
  const before = issues.length;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      issues.push(`[page:${path}] navigation failed: ${String(e).slice(0, 120)}`);
      return;
    }
  }
  await page.waitForTimeout(700);
  if (issues.length === before) console.log(`ok  ${label} ${path}`);
  else console.log(`ERR ${label} ${path}`);
};

const overflowCheck = async (phone, path) => {
  await phone.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await phone.waitForTimeout(800);
  const px = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (px > 0) {
    issues.push(`[mobile:${path}] horizontal overflow ${px}px`);
    console.log(`ERR mobile ${path} overflow ${px}px`);
  } else {
    console.log(`ok  mobile ${path}`);
  }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.context().addCookies([{ name: "ideaven_session", value: COOKIE, domain: "localhost", path: "/" }]);
page.on("pageerror", (e) => issues.push(`[pageerror] ${String(e).slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error") issues.push(`[console] ${m.text().slice(0, 200)}`);
});
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("/api/")) issues.push(`[http ${r.status()}] ${r.url().slice(0, 140)}`);
});

const publicPages = ["/", "/explore", "/community", "/learn", "/docs", "/pricing", "/login", "/register", "/start", "/terms", "/privacy"];
const authPages = ["/dashboard", "/dashboard/projects", "/dashboard/templates", "/dashboard/extensions", "/profile", "/settings"];

for (const path of publicPages) await sweep(page, "public", path);
for (const path of authPages) await sweep(page, "auth", path);

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.context().addCookies([{ name: "ideaven_session", value: COOKIE, domain: "localhost", path: "/" }]);
for (const path of ["/", "/dashboard", "/explore"]) await overflowCheck(phone, path);

await browser.close();

if (issues.length > 0) {
  console.error(`\nLAUNCH AUDIT FAILURES (${issues.length}):`);
  for (const issue of issues) console.error(" -", issue);
  failures.push(...issues);
}
if (failures.length > 0) process.exit(1);
console.log("\nLAUNCH AUDIT: clean");
