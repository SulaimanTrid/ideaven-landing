// Sorting Layers & Draw Order (TASK 15) E2E. Builds the acceptance scene —
// layers Background/World/Characters/Foreground/UI with entities whose MODEL
// order is deliberately wrong (Tree first) so sorting must prove itself —
// then verifies the editor canvas, the preview runtime, the published page,
// and the export all draw in the SAME deterministic order, plus persistence,
// tie-breaking, same-layer ordering, and deleted-layer protection in the UI.
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

async function getModel(cookie, id) {
  const res = await fetch(`${API}/api/projects/${id}`, { headers: { Cookie: cookie } });
  return (await res.json()).project.model;
}

async function putModel(cookie, id, model) {
  const res = await fetch(`${API}/api/projects/${id}/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`model PUT failed: ${res.status} ${await res.text()}`);
}

// Acceptance scene (STEP 30). Model order is deliberately NOT draw order:
// Tree is FIRST in the model but must render in FRONT (Foreground layer).
const LAYERS = [
  { name: "Background", order: 0 },
  { name: "World", order: 100 },
  { name: "Characters", order: 200 },
  { name: "Foreground", order: 400 },
  { name: "UI", order: 1000 },
];
// Back-to-front EXPECTED order: Sky, Ground, Player(10), Enemy(20), Tree, HUD.
function acceptanceModel() {
  return {
    schemaVersion: 1,
    type: "game",
    settings: {},
    screens: [
      {
        id: "screen-play",
        name: "Play",
        styles: { background: "#0c0f17" },
        sortingLayers: LAYERS,
        components: [
          { id: "e-tree", type: "sprite", props: { name: "Tree", x: 150, y: 690, width: 60, height: 90, color: "#2f7d4f", visible: true, collider: false, layer: "default", sortingLayer: "Foreground", sortingOrder: 0 } },
          { id: "e-sky", type: "sprite", props: { name: "Sky", x: 0, y: 0, width: 390, height: 500, color: "#17203a", visible: true, collider: false, layer: "default", sortingLayer: "Background", sortingOrder: 0 } },
          { id: "e-ground", type: "platform", props: { name: "Ground", x: 0, y: 760, width: 390, height: 40, color: "#2a3348", visible: true, collider: true, layer: "solid", sortingLayer: "World", sortingOrder: 0 } },
          { id: "p-player", type: "player", props: { name: "Player", x: 60, y: 700, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true, layer: "player", sortingLayer: "Characters", sortingOrder: 10 } },
          { id: "e-enemy", type: "enemy", props: { name: "Enemy", x: 160, y: 704, width: 32, height: 32, color: "#ff7d9c", visible: true, collider: true, trigger: true, layer: "hazard", sortingLayer: "Characters", sortingOrder: 20 } },
          { id: "t-hud", type: "text", props: { name: "HUD", text: "SCORE 0", x: 12, y: 14, fontSize: 18, sortingLayer: "UI", sortingOrder: 0 } },
        ],
        logic: { handlers: [] },
      },
    ],
    navigation: { startScreenId: "screen-play" },
    variables: [],
    assets: [],
  };
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`sorting-${stamp}@ex.com`, `sorting${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Sorting Sweep", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created (model replaced with the acceptance scene)`);
await putModel(cookie, project.id, acceptanceModel());

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

// DOM order of the scene entities — what is later in the DOM draws in front.
const editorOrder = async () =>
  page.$$eval('[data-node-id][data-sorting-layer]', (els) => els.map((e) => e.getAttribute("data-node-id")));
const previewOrder = async () =>
  page.$$eval('[data-camera-world] [data-entity]', (els) => els.map((e) => e.getAttribute("data-entity")));

const EXPECTED = ["e-sky", "e-ground", "p-player", "e-enemy", "e-tree", "t-hud"];

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

// ---- 1. Editor draws in sorted order, not model order ------------------------
let order = await editorOrder();
check("editor renders the acceptance scene in sorted order (model order was wrong)",
  JSON.stringify(order) === JSON.stringify(EXPECTED), `got ${JSON.stringify(order)}`);

// ---- 2. Depth debugging overlay ----------------------------------------------
await page.getByRole("button", { name: /Show order/ }).click();
await page.waitForTimeout(400);
check("layer labels overlay shows layer name and order",
  (await page.getByText(/Characters · 10/).count()) >= 1);
await page.getByRole("button", { name: /Show order/ }).click();

// ---- 3. Layer Manager: default set listed back-to-front ----------------------
await page.keyboard.press("Escape").catch(() => {});
await page.locator('[data-node-id][data-sorting-layer]').first().click();
await page.waitForTimeout(300);
// Deselect by clicking the canvas root (nothing selected → screen inspector).
await page.mouse.click(1240, 500); // inspector-side empty area deselects
await page.waitForTimeout(300);
const layerRows = await page.$$eval('input[aria-label^="Layer name for"]', (els) => els.length);
check("Layer Manager lists the scene's five layers", layerRows === LAYERS.length, `rows=${layerRows}`);
const orderBadges = await page.$$eval('input[aria-label^="Layer name for"]', (els) => els.map((e) => e.value));
check("layers listed back-to-front with names",
  JSON.stringify(orderBadges) === JSON.stringify(LAYERS.map((l) => l.name)), JSON.stringify(orderBadges));

// ---- 4. Delete protection: a used layer cannot be deleted --------------------
const usedDelete = await page.$('button[aria-label="Delete layer Characters"]');
check("delete is blocked for a layer in use by entities",
  usedDelete ? !(await usedDelete.isEnabled()) : false);

// ---- 5. Reorder layers: Foreground moves behind World → Tree goes behind -----
await page.$eval('button[aria-label="Move Foreground behind"]', (el) => el.click());
await page.waitForTimeout(400);
order = await editorOrder();
check("reordering a layer immediately reorders the scene (Tree now behind Player)",
  order.indexOf("e-tree") < order.indexOf("p-player"), JSON.stringify(order));
await waitForSaved();
let model = await getModel(cookie, project.id);
const fgLayer = model.screens[0].sortingLayers.find((l) => l.name === "Foreground");
const charLayer = model.screens[0].sortingLayers.find((l) => l.name === "Characters");
check("layer reorder persisted in the canonical model (Foreground swapped with its neighbor)",
  Boolean(fgLayer && charLayer && fgLayer.order < charLayer.order),
  JSON.stringify(model.screens[0].sortingLayers));

// Undo restores the previous layer order AND the visual order.
await page.getByRole("button", { name: "Undo", exact: true }).click();
await page.waitForTimeout(1200);
order = await editorOrder();
check("undo reverts the layer reorder (Tree back in front)",
  order.indexOf("e-tree") > order.indexOf("p-player"), JSON.stringify(order));

// ---- 6. Same-layer ordering + tie-break via the model ------------------------
// Player order 200, Enemy stays 20: PLAYER draws in front of Enemy.
model = await getModel(cookie, project.id);
model.screens[0].components.find((c) => c.id === "p-player").props.sortingOrder = 200;
await putModel(cookie, project.id, model);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
order = await editorOrder();
check("higher order within a layer draws in front (Player 200 in front of Enemy 20)",
  order.indexOf("p-player") > order.indexOf("e-enemy"), JSON.stringify(order));

// Same layer, same order → deterministic tie-break by model index:
// Player(200) and a new Sprite (Characters, order 200, model index LAST) →
// the later-model-index entity draws in front.
model = await getModel(cookie, project.id);
model.screens[0].components.push({
  id: "e-ghost", type: "sprite", props: { name: "Ghost", x: 200, y: 690, width: 40, height: 40, color: "#58c7f0", visible: true, collider: false, layer: "default", sortingLayer: "Characters", sortingOrder: 200 },
});
await putModel(cookie, project.id, model);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
order = await editorOrder();
check("same layer + same order resolves by stable model index",
  order.indexOf("e-ghost") > order.indexOf("p-player") && order.indexOf("e-ghost") > order.indexOf("e-enemy"), JSON.stringify(order));

// ---- 7. Deleted-layer safety: entity references a missing layer --------------
model = await getModel(cookie, project.id);
model.screens[0].sortingLayers = LAYERS.filter((l) => l.name !== "Foreground");
await putModel(cookie, project.id, model);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);
check("deleted layer raises a diagnostic (entity falls back to World)",
  (await page.getByText(/Sorting layer .* no longer exists/).count()) >= 1);
// The runtime never breaks: Tree (dangling) now renders with World — behind Characters.
order = await editorOrder();
check("dangling-layer entity renders on the fallback layer (Tree behind Player now)",
  order.indexOf("e-tree") < order.indexOf("p-player"), JSON.stringify(order));

// Restore the Foreground layer (full set) for the runtime/publish checks.
await putModel(cookie, project.id, acceptanceModel());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
check("editor order after restore matches the acceptance scene",
  JSON.stringify(await editorOrder()) === JSON.stringify(EXPECTED), JSON.stringify(await editorOrder()));

// ---- 8. Preview runtime draws in the SAME order ------------------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1800);
const previewGot = await previewOrder();
check("preview draws in the same sorted order as the editor",
  JSON.stringify(previewGot) === JSON.stringify(EXPECTED),
  `got ${JSON.stringify(previewGot)}`);

// ---- 9. Persistence: reload the builder, identical result --------------------
await page.goto(`${WEB}/dashboard/projects`, { waitUntil: "networkidle" });
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
check("editor order identical after save + reload",
  JSON.stringify(await editorOrder()) === JSON.stringify(EXPECTED), JSON.stringify(await editorOrder()));
model = await getModel(cookie, project.id);
check("sortingLayers + entity assignments persisted",
  JSON.stringify(model.screens[0].sortingLayers) === JSON.stringify(LAYERS) &&
  model.screens[0].components.find((c) => c.id === "e-tree").props.sortingLayer === "Foreground");

// ---- 10. Published page parity ------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const pubGot = await previewOrder();
  check("published page draws in the same sorted order",
    JSON.stringify(pubGot) === JSON.stringify(EXPECTED),
    `got ${JSON.stringify(pubGot)}`);
}

// ---- 11. Export parity ----------------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export ships the sorting pipeline (layers + comparator)",
    html.includes("sortingLayersOf") && html.includes("sortedRenderOrder") && html.includes("sortingOrder"));
}

// ---- 12. No console/page errors ------------------------------------------------
check("no console or page errors across editor, preview, published, export",
  errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);

async function waitForSaved() {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}
