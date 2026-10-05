// TASK 68 queue — CSP verification: the web app must SEND a real
// Content-Security-Policy and every critical surface must load/interact
// without a single CSP violation report (violations surface as console
// errors, which this suite treats as failures).
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const API = "http://localhost:8090";
const WEB = "http://localhost:3000";

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
const violations = [];
const otherErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  if (text.includes("Content-Security-Policy") || text.includes("violates")) violations.push(text.slice(0, 160));
  else if (!text.includes("401") && !text.includes("Failed to load resource")) otherErrors.push(text.slice(0, 140));
});
page.on("pageerror", (e) => otherErrors.push(`pageerror: ${e.message.slice(0, 140)}`));

// 1. The header is actually sent.
const res = await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
const csp = res?.headers()["content-security-policy"] ?? "";
check("CSP header is sent on the landing page",
  csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), csp.slice(0, 120));
check("CSP forbids objects and framing", csp.includes("object-src 'none'") && csp.includes("base-uri 'self'"));

// 2. Critical surfaces run with ZERO CSP violations.
const surfaces = ["/", "/login", "/explore", "/community", "/pricing", "/learn"];
let clean = 0;
for (const path of surfaces) {
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const before = violations.length;
  if (violations.length === before) clean += 1;
}
check(`public surfaces run without CSP violations (${clean}/${surfaces.length})`, clean === surfaces.length, violations.slice(0, 3).join(" | "));

// 3. Dashboard + builder (auth surfaces with inline bootstraps + Monaco).
const reg = await fetch(`${API}/api/auth/register`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `csp-${Date.now().toString(36)}@ex.com`, username: `csp${Date.now().toString(36)}`, password: "Correct-Horse-9" }),
});
const cookie = reg.headers.getSetCookie().find((c) => c.startsWith("ideaven_session=")).split(";")[0];
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const authedPage = await context.newPage();
authedPage.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  if (text.includes("Content-Security-Policy") || text.includes("violates")) violations.push(text.slice(0, 160));
});
const proj = await (await fetch(`${API}/api/projects`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ name: "CSP Probe", type: "game" }),
})).json();
await authedPage.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
await authedPage.waitForTimeout(1000);
check("dashboard loads without CSP violations", violations.length === 0, violations.slice(0, 2).join(" | "));
await authedPage.goto(`${WEB}/builder/${proj.project.id}`, { waitUntil: "networkidle" });
await authedPage.waitForTimeout(1600);
// Exercise Code mode (Monaco CDN) — the most CSP-sensitive surface.
await authedPage.locator('[data-mode-tab="code"]').click();
await authedPage.waitForTimeout(4000);
check("builder + Code mode (Monaco CDN) run without CSP violations",
  violations.length === 0, violations.slice(0, 3).join(" | "));
check("no other console errors during the CSP run", otherErrors.length === 0, otherErrors.slice(0, 3).join(" | "));

console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
