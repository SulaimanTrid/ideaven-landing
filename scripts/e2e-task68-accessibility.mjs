// TASK 68 queue — Accessibility audit. Structural a11y assertions over the
// real surfaces (no external auditor dependency): html lang, heading
// structure, image naming, input labeling, disclosure state (aria-expanded),
// dialog semantics, accessible names on buttons, and no positive tabindex.
// Every failure is a real, fixable finding — none is waived.
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const API = "http://localhost:8090";
const WEB = "http://localhost:3000";

let passed = 0, failed = 0;
const findings = [];
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; findings.push(name); console.log(`FAIL  ${name} ${detail}`); }
};

const audit = (page, surface) => page.evaluate((surfaceName) => {
  const problems = [];
  if (!document.documentElement.getAttribute("lang")) problems.push("html missing lang");
  const h1s = document.querySelectorAll("h1");
  if (h1s.length === 0) problems.push("no h1 on the page");
  for (const img of document.querySelectorAll("img")) {
    if (!img.getAttribute("alt") && img.getAttribute("aria-hidden") !== "true" && img.getAttribute("role") !== "presentation") {
      problems.push(`img without alt: ${(img.src || "").slice(0, 60)}`);
    }
  }
  for (const input of document.querySelectorAll("input, textarea, select")) {
    const type = input.getAttribute("type");
    if (type === "hidden" || input.disabled) continue;
    const id = input.id;
    const labeled =
      input.getAttribute("aria-label") ||
      input.getAttribute("aria-labelledby") ||
      (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      input.closest("label");
    if (!labeled) problems.push(`unlabeled ${input.tagName.toLowerCase()}: ${type ?? ""} ${input.name ?? ""}`.trim());
  }
  for (const btn of document.querySelectorAll("[aria-expanded]")) {
    if (!["true", "false"].includes(btn.getAttribute("aria-expanded"))) {
      problems.push("aria-expanded without true/false value");
    }
  }
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    if (dialog.getAttribute("aria-modal") !== "true") problems.push("dialog missing aria-modal");
    if (!dialog.getAttribute("aria-label") && !dialog.getAttribute("aria-labelledby")) {
      problems.push("dialog missing accessible name");
    }
  }
  for (const el of document.querySelectorAll("[tabindex]")) {
    const v = Number(el.getAttribute("tabindex"));
    if (v > 0) problems.push(`positive tabindex ${v}`);
  }
  // Every visible <button> must have an accessible name (text, aria-label,
  // or a named child).
  for (const btn of document.querySelectorAll("button")) {
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const name = (btn.getAttribute("aria-label") ?? btn.getAttribute("aria-labelledby") ?? btn.textContent ?? "").trim();
    if (name === "" && !btn.querySelector("svg[aria-label], img[alt]")) {
      problems.push(`unnamed button: ${(btn.className || "").toString().slice(0, 40)}`);
    }
  }
  return { surface: surfaceName, problems };
}, surface);

const stamp = Date.now().toString(36);
const reg = await fetch(`${API}/api/auth/register`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `a11y-${stamp}@ex.com`, username: `a11y${stamp}`, password: "Correct-Horse-9" }),
});
const cookie = reg.headers.getSetCookie().find((c) => c.startsWith("ideaven_session=")).split(";")[0];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();

const SURFACES = [
  ["/", "landing"],
  ["/login", "login"],
  ["/register", "register"],
  ["/pricing", "pricing"],
  ["/explore", "explore"],
  ["/learn", "learn"],
  ["/community", "community"],
  ["/dashboard", "dashboard"],
  ["/dashboard/projects/new", "creation hub"],
  ["/dashboard/extensions", "extensions dashboard"],
];

let surfacesOk = 0;
for (const [path, surface] of SURFACES) {
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1100);
  const result = await audit(page, surface);
  const ok = result.problems.length === 0;
  if (ok) surfacesOk += 1;
  check(`a11y clean: ${surface}`, ok, result.problems.slice(0, 4).join(" | "));
}

// Builder: audit each mode surface (authored minimal project for content).
const proj = await (await fetch(`${API}/api/projects`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ name: `A11y ${stamp}`, type: "game" }),
})).json();
await fetch(`${API}/api/projects/${proj.project.id}/model`, {
  method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ model: {
    schemaVersion: 1, type: "game", screens: [{ id: "s1", name: "Scene 1", components: [
      { id: "e-p", type: "player", props: { name: "Player", x: 40, y: 200, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true } },
    ] }],
    navigation: { startScreenId: "s1" }, variables: [], assets: [], settings: {},
  } }),
});
await page.goto(`${WEB}/builder/${proj.project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
for (const mode of ["design", "blocks", "preview"]) {
  await page.locator(`[data-mode-tab="${mode}"]`).click();
  await page.waitForTimeout(1100);
  const result = await audit(page, `builder/${mode}`);
  const ok = result.problems.length === 0;
  if (ok) surfacesOk += 1;
  check(`a11y clean: builder/${mode}`, ok, result.problems.slice(0, 4).join(" | "));
}

// Public project page: publish first (assets + runtime + metadata a11y).
await fetch(`${API}/api/projects/${proj.project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
const slug = (await (await fetch(`${API}/api/projects/${proj.project.id}`, { headers: { Cookie: cookie } })).json()).project.slug;
await page.goto(`${WEB}/p/${slug}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
const pubResult = await audit(page, "public project");
const pubOk = pubResult.problems.length === 0;
if (pubOk) surfacesOk += 1;
check("a11y clean: public project", pubOk, pubResult.problems.slice(0, 4).join(" | "));

// Keyboard: focus-visible outline is defined globally and Tab reaches content.
await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
const focusVisible = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const style = getComputedStyle(el);
  // The design system guarantees a visible focus treatment; accept an outline
  // or a non-default box-shadow on the focused element.
  return (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none";
});
check("keyboard focus lands on an element with a visible focus treatment", focusVisible);
const focusablesNamed = await page.evaluate(() => {
  let unnamed = 0;
  for (const el of document.querySelectorAll("a[href], button")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) continue;
    const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
    if (name === "" && !el.querySelector("img[alt], svg[aria-label]")) unnamed += 1;
  }
  return unnamed;
});
check("first-tab surface has no unnamed focusables", focusablesNamed === 0, `unnamed=${focusablesNamed}`);

console.log(`\nsurfaces clean: ${surfacesOk}/${SURFACES.length + 4}`);
console.log(`findings: ${findings.length ? findings.join(" | ") : "none"}`);
console.log(`passed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
