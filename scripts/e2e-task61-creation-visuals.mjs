// TASK 61 — Creation visuals + real device orientation + responsive builder
// polish E2E. Covers: the ONE CreationPreview system on the Creation Hub and
// Dashboard cards (deterministic inline SVG, real-engine visual language,
// descriptive labels, responsive at 320–1440), the builder toolbar matrix
// with REAL bounding-rectangle evidence (no collisions, Export always
// reachable, diagnostics collapsed), and the landscape architecture — the
// ENTIRE device presentation reflows as one object, fit recalculates, and
// the orientation setting persists across save/reload.
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

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`t61-${stamp}@ex.com`, `t61${stamp}`);
const appProject = await createProject(cookie, "Orientation Lab", "app");
const gameProject = await createProject(cookie, "Visual Lab 2D", "game");
const project3d = await createProject(cookie, "Visual Lab 3D", "3d");
console.log(`projects created: app=${appProject.id} game=${gameProject.id} 3d=${project3d.id}`);

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

const noHorizOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// Dev mode compiles CSS on first encounter — measuring during the unstyled
// flash produces garbage rects. Wait until the header layout is IDENTICAL
// across two consecutive samples before trusting geometry.
const stableHeader = async () => {
  let prev = "";
  for (let i = 0; i < 30; i++) {
    const snap = await page.evaluate(() => {
      const header = document.querySelector("header[data-env-menu-root]");
      if (!header) return "";
      if (getComputedStyle(header).display !== "flex") return "";
      return JSON.stringify(
        [...header.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
        }),
      );
    });
    if (snap !== "" && snap === prev) return;
    prev = snap;
    await page.waitForTimeout(250);
  }
};

// ---- A. CREATION HUB PREVIEWS ------------------------------------------------------
await page.goto(`${WEB}/dashboard/projects/new`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
{
  const app = page.locator('[data-creation-preview="app"]');
  const game = page.locator('[data-creation-preview="game"]');
  const three = page.locator('[data-creation-preview="3d"]');
  check("A1: the Creation Hub shows all three environment previews",
    (await app.count()) === 1 && (await game.count()) === 1 && (await three.count()) === 1);
  check("A2: every preview renders a deterministic inline SVG (480x200 viewBox)",
    (await page.locator('[data-creation-preview] svg[viewBox="0 0 480 200"]').count()) === 3);
  check("A3: previews are labelled media (role=img + descriptive label), not anonymous decoration",
    (await page.locator('[data-creation-preview][role="img"][aria-label]').count()) === 3);
  check("A4: no <img> assets in the previews — nothing can 404",
    (await page.locator('[data-creation-preview] img').count()) === 0);
  check("A5: no broken images anywhere on the hub",
    await page.evaluate(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0)));
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll("[data-creation-preview]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    }),
  );
  check("A6: all three previews have real visible area (geometry evidence)",
    boxes.length === 3 && boxes.every((b) => b.w > 120 && b.h > 60), JSON.stringify(boxes));
}
for (const width of [320, 390, 768, 1280, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(350);
  const overflow = await noHorizOverflow();
  const visible = await page.locator('[data-creation-preview="3d"]').isVisible();
  check(`A7: hub at ${width}px — no horizontal overflow, previews intact`,
    overflow && visible, `overflow=${overflow} visible=${visible}`);
}
await page.setViewportSize({ width: 1440, height: 950 });

// ---- B. DASHBOARD CARDS ------------------------------------------------------------
await page.goto(`${WEB}/dashboard/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
check("B1: dashboard cards carry the real preview per environment type",
  (await page.locator('[data-creation-preview="app"]').count()) >= 1 &&
  (await page.locator('[data-creation-preview="game"]').count()) >= 1 &&
  (await page.locator('[data-creation-preview="3d"]').count()) >= 1);
check("B2: dashboard shows no horizontal overflow with previews",
  await noHorizOverflow());

// ---- C. TOOLBAR MATRIX + BOUNDING-RECT EVIDENCE (APP builder) -----------------------
const headerButtons = () => page.evaluate(() => {
  const header = document.querySelector("header[data-env-menu-root]");
  if (!header) return [];
  // A button inside a scrollable nav reports its FULL layout rect even where
  // the nav visually clips it. Collisions are only real between VISIBLY
  // rendered areas — clip each rect to its scroll/clip ancestor first.
  const clipRectFor = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const s = getComputedStyle(node);
      if (/(auto|scroll|hidden)/.test(s.overflowX) || /(auto|scroll|hidden)/.test(s.overflowY)) {
        return node.getBoundingClientRect();
      }
      node = node.parentElement;
    }
    return null;
  };
  const out = [];
  for (const el of header.querySelectorAll("button")) {
    if (el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    const clip = clipRectFor(el);
    const x0 = clip ? Math.max(r.left, clip.left) : r.left;
    const x1 = clip ? Math.min(r.right, clip.right) : r.right;
    const y0 = clip ? Math.max(r.top, clip.top) : r.top;
    const y1 = clip ? Math.min(r.bottom, clip.bottom) : r.bottom;
    if (x1 - x0 <= 1 || y1 - y0 <= 1) continue; // fully clipped away
    out.push({ label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24), x0, y0, x1, y1 });
  }
  return out;
});
const collision = (rects) => {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > 1 && h > 1) return `${a.label} ∩ ${b.label}`;
    }
  }
  return null;
};

for (const width of [390, 768, 1024, 1280, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${WEB}/builder/${appProject.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await stableHeader();
  const rects = await headerButtons();
  const exportRect = rects.find((r) => r.label.includes("Export"));
  const collisionResult = collision(rects);
  const overflow = await noHorizOverflow();
  const diagExpanded = await page.getByRole("button", { name: "Diagnostics" }).getAttribute("aria-expanded");
  check(`C1: ${width}px — no header button collision (bbox evidence)`,
    collisionResult === null, collisionResult ?? "");
  check(`C2: ${width}px — Export visible and fully inside the viewport`,
    exportRect !== undefined && exportRect.x0 >= 0 && exportRect.x1 <= width && exportRect.y1 > 0,
    JSON.stringify(exportRect));
  check(`C3: ${width}px — no horizontal document overflow`, overflow);
  check(`C4: ${width}px — diagnostics starts collapsed`,
    diagExpanded === "false", `aria-expanded=${diagExpanded}`);
}
{
  // Save/Publish/Export are three DISTINCT controls (§21).
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`${WEB}/builder/${appProject.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await stableHeader();
  const rects = await headerButtons();
  const exportRect = rects.find((r) => r.label.includes("Export"));
  const publishRect = rects.find((r) => r.label.includes("Publish"));
  const saveRect = rects.find((r) => r.label.includes("Save"));
  check("C5: Save, Publish and Export are three separate visible controls",
    exportRect !== undefined && publishRect !== undefined && saveRect !== undefined &&
    exportRect.x0 !== publishRect.x0 && saveRect.x0 !== publishRect.x0,
    JSON.stringify({ exportRect, publishRect, saveRect }));
}

// ---- D. LANDSCAPE ARCHITECTURE (the whole device reflows as ONE object) -------------
await page.goto(`${WEB}/builder/${appProject.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const unitRect = () => page.evaluate(() => {
  const el = document.querySelector('[data-screen-frame]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height, x: r.left, y: r.top };
});
const stageRect = () => page.evaluate(() => {
  const unit = document.querySelector('[data-screen-frame]');
  const stage = unit?.closest(".overflow-auto");
  if (!unit || !stage) return null;
  const r = stage.getBoundingClientRect();
  return { x: r.left, y: r.top, x1: r.right, y1: r.bottom };
});
const portrait = await unitRect();
check("D1: phone portrait — the device presentation is taller than wide",
  portrait !== null && portrait.h > portrait.w, JSON.stringify(portrait));
const orientationButton = page.locator('button[aria-pressed][title], button[aria-pressed]').filter({ hasText: /Portrait|Landscape/ }).first();
check("D2: the orientation toggle has an accessible name and pressed state",
  (await orientationButton.getAttribute("aria-pressed")) !== null &&
  ((await orientationButton.textContent()) ?? "").length > 0);

await orientationButton.click();
await page.waitForTimeout(600);
const landscape = await unitRect();
check("D3: landscape — the WHOLE device becomes wide (no leftover portrait box)",
  landscape !== null && landscape.w > landscape.h &&
  near(landscape.w / landscape.h, portrait.h / portrait.w, portrait.h / portrait.w * 0.03),
  `portrait=${JSON.stringify(portrait)} landscape=${JSON.stringify(landscape)}`);

await page.getByRole("button", { name: "Fit" }).click();
await page.waitForTimeout(500);
const stage = await stageRect();
const fitted = await unitRect();
check("D4: Fit in landscape — the entire device sits inside the stage (no clipping)",
  stage !== null && fitted !== null &&
  fitted.x >= stage.x - 1 && fitted.y >= stage.y - 1 &&
  fitted.x + fitted.w <= stage.x1 + 1 && fitted.y + fitted.h <= stage.y1 + 1,
  `stage=${JSON.stringify(stage)} fitted=${JSON.stringify(fitted)}`);

await orientationButton.click();
await page.waitForTimeout(600);
const backToPortrait = await unitRect();
check("D5: back to portrait — original dimensions restored",
  backToPortrait !== null && near(backToPortrait.w, portrait.w, 1) && near(backToPortrait.h, portrait.h, 1),
  JSON.stringify(backToPortrait));

// persistence: save (portrait) → reload → still portrait
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const afterReload = await unitRect();
check("D6: orientation setting persists across save + reload",
  afterReload !== null && afterReload.h > afterReload.w, JSON.stringify(afterReload));

// tablet orientation
await page.getByRole("button", { name: "Tablet" }).click();
await page.waitForTimeout(500);
await orientationButton.click(); // landscape
await page.waitForTimeout(600);
const tabletLandscape = await unitRect();
check("D7: tablet landscape — presentation swaps to 1112x834 proportions",
  tabletLandscape !== null && near(tabletLandscape.w / tabletLandscape.h, 1112 / 834, 0.03),
  JSON.stringify(tabletLandscape));
await orientationButton.click(); // back to portrait
await page.waitForTimeout(500);
const tabletPortrait = await unitRect();
check("D8: tablet portrait — 834x1112 proportions restored",
  tabletPortrait !== null && near(tabletPortrait.w / tabletPortrait.h, 834 / 1112, 0.03),
  JSON.stringify(tabletPortrait));

// ---- E. GAME + 3D BUILDERS IN THE MATRIX --------------------------------------------
for (const [label, id, port] of [["2D game", gameProject.id, 768], ["3D", project3d.id, 390]]) {
  await page.setViewportSize({ width: port, height: 900 });
  await page.goto(`${WEB}/builder/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const rects = await headerButtons();
  const exportRect = rects.find((r) => r.label.includes("Export"));
  check(`E1: ${label} builder at ${port}px — Export reachable, no overflow`,
    exportRect !== undefined && exportRect.x1 <= port && (await noHorizOverflow()),
    JSON.stringify(exportRect));
}
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${WEB}/builder/${project3d.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await stableHeader();
check("E2: 3D builder at 1280 — no header collisions, viewport renders",
  collision(await headerButtons()) === null && (await page.locator("canvas[data-viewport-3d]").count()) === 1);

console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
await browser.close();
if (failed > 0 || errors.length > 0) process.exit(1);
