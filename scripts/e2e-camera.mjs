// 2D Camera Behaviors (TASK 14) E2E: follow, smoothing, bounds, shake —
// editor, preview, published runtime, and export parity. Builds the
// acceptance scene (world 2000×1200, player near the left edge, camera
// following with smoothing + bounds, a Quake Zone trigger that shakes the
// camera) through the canonical model API, then verifies every surface.
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
  const body = await res.json();
  return body.project.model;
}

async function putModel(cookie, id, model) {
  const res = await fetch(`${API}/api/projects/${id}/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(`model PUT failed: ${res.status} ${await res.text()}`);
}

const WORLD = { minX: 0, minY: 0, maxX: 2000, maxY: 1200 };
const VIEW = { width: 390, height: 844 };
const CAM_MAX_X = WORLD.maxX - VIEW.width; // 1610
const PLAYER_MAX_X = WORLD.maxX - 36;      // 1964

function acceptanceModel(overrides = {}) {
  const cameraProps = {
    name: "Camera", x: 0, y: 356, width: VIEW.width, height: VIEW.height,
    followEnabled: true, followTarget: "p-player", smoothing: 0.12,
    boundsEnabled: true, minX: WORLD.minX, minY: WORLD.minY, maxX: WORLD.maxX, maxY: WORLD.maxY,
    shakeDuration: 0.25, shakeStrength: 8,
    ...(overrides.camera ?? {}),
  };
  return {
    schemaVersion: 1,
    type: "game",
    settings: {},
    screens: [
      {
        id: "screen-play",
        name: "Play",
        styles: { background: "#0c0f17" },
        components: [
          { id: "p-player", type: "player", props: { name: "Player", x: 100, y: 1100, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true, layer: "player" } },
          { id: "c-cam", type: "camera", props: cameraProps },
          { id: "t-shake", type: "trigger", props: { name: "Quake Zone", x: 900, y: 1120, width: 120, height: 80, color: "#8f7bff", visible: true, collider: true, trigger: true, layer: "zone" } },
        ],
        logic: {
          handlers: [
            {
              id: "h-shake",
              componentId: "p-player",
              event: "touches-t-shake",
              body: [
                { id: "b-shake", kind: "statement", type: "camera-shake", inputs: { duration: 0.6, strength: 10 } },
              ],
            },
          ],
        },
      },
    ],
    navigation: { startScreenId: "screen-play" },
    variables: [],
    assets: [],
  };
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`camera-${stamp}@ex.com`, `camera${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Camera Sweep", type: "game", template: "coin-runner" }),
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

const waitForSaved = async () => {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
};

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

// ---- 1. Editor: the camera entity frames the world ---------------------------
const camNode = page.locator('[data-node-id]:has(> [data-camera-viewport])');
check("camera entity on the design stage with viewport outline", (await camNode.count()) === 1);
check("world bounds overlay renders (dashed, from the same camera props)",
  (await page.locator('[data-camera-bounds]').count()) === 1);

// ---- 2. Inspector: follow target + smoothing, then persistence ---------------
// The camera viewport is click-through (it must never swallow clicks for the
// entities it frames); select/drag goes through its name chip.
await page.locator('[data-camera-handle="true"]').click();
await page.waitForTimeout(600);
const followSelect = page.getByLabel("Target entity");
check("inspector exposes the follow-target entity picker", (await followSelect.count()) === 1);
check("follow target resolves to the Player entity", (await followSelect.inputValue()) === "p-player");
const smoothingField = page.getByLabel("Smoothing (0–0.95)");
check("inspector exposes Smoothing", (await smoothingField.count()) === 1);
check("smoothing value is the model's 0.12", (await smoothingField.inputValue()) === "0.12");

// Decimal commit + save + persistence in the canonical model.
await smoothingField.fill("0.3");
await page.keyboard.press("Tab");
await waitForSaved();
let model = await getModel(cookie, project.id);
let camProps = model.screens[0].components.find((c) => c.type === "camera").props;
check("smoothing commits as a decimal to the model", camProps.smoothing === 0.3, `smoothing=${camProps.smoothing}`);

// Undo reverts the configuration coherently (runtime movement never does this).
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved();
model = await getModel(cookie, project.id);
camProps = model.screens[0].components.find((c) => c.type === "camera").props;
check("undo reverts the camera configuration", camProps.smoothing === 0.12, `smoothing=${camProps.smoothing}`);
await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved();
model = await getModel(cookie, project.id);
camProps = model.screens[0].components.find((c) => c.type === "camera").props;
check("redo restores the camera configuration", camProps.smoothing === 0.3, `smoothing=${camProps.smoothing}`);
// Back to the canonical 0.12 for the run checks.
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved();

// ---- 3. Blocks palette carries the camera blocks ------------------------------
await page.getByRole("button", { name: "Blocks", exact: true }).first().click();
await page.waitForTimeout(800);
check("Blocks palette lists the shake camera block", (await page.getByText(/shake camera for/).count()) >= 1);
await page.getByRole("button", { name: "Design", exact: true }).first().click();
await page.waitForTimeout(800);

// ---- 4. Diagnostics: deleted target + inverted bounds -------------------------
// (TASK 60: the diagnostics drawer starts collapsed - each check opens it.)
await putModel(cookie, project.id, acceptanceModel({ camera: { followTarget: "p-ghost" } }));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);check("deleted target produces a diagnostic",
  (await page.getByText(/Camera target .* no longer exists/).count()) >= 1,
  "diagnostic text not found");

await putModel(cookie, project.id, acceptanceModel({ camera: { minX: 2000, maxX: 0 } }));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);check("inverted bounds produce a diagnostic",
  (await page.getByText(/Camera bounds are inverted/).count()) >= 1);

// ---- 5. Preview: follow, smoothing, bounds, shake ------------------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1600);
const world = page.locator('[data-camera-world]');
check("preview renders the camera world container", (await world.count()) === 1);

const camX = async () => Number(await world.getAttribute("data-camera-x"));
const camY = async () => Number(await world.getAttribute("data-camera-y"));
const shaking = async () => (await world.getAttribute("data-camera-shake")) === "true";
const playerX = async () => page.locator('[data-entity="p-player"]').evaluate((el) => parseFloat(el.style.left));

// Initial framing: snapped to the clamped follow position (x pinned at minX).
check("camera starts at the clamped follow position (x=0)", Math.abs((await camX()) - 0) <= 2, `camX=${await camX()}`);
check("camera y clamped to maxY - viewport (356)", Math.abs((await camY()) - (WORLD.maxY - VIEW.height)) <= 2, `camY=${await camY()}`);
check("camera coordinates are finite numbers", Number.isFinite(await camX()) && Number.isFinite(await camY()));

// Walk right: the player moves, the camera follows with a visible smoothing
// lag, the Quake Zone shakes it, and the viewport clamps at the world edge.
let sawLag = false;
let sawShake = false;
let sawNaN = false;
let camSamples = [];
await page.keyboard.down("ArrowRight");
for (let i = 0; i < 46; i += 1) {
  await page.waitForTimeout(250);
  const cx = await camX();
  const px = await playerX();
  if (!Number.isFinite(cx) || !Number.isFinite(px)) sawNaN = true;
  camSamples.push(cx);
  const ideal = px + 18 - VIEW.width / 2; // follow position (unclamped)
  if (Math.abs(cx - Math.min(ideal, CAM_MAX_X)) > 5) sawLag = true;
  if (await shaking()) sawShake = true;
  if (px >= PLAYER_MAX_X - 40) break; // reached the world edge
}
await page.keyboard.up("ArrowRight");
const finalPlayerX = await playerX();
const settledCamX = await camX();
check("player walked within the world bounds (no viewport-edge clamp)", finalPlayerX >= PLAYER_MAX_X - 40, `playerX=${finalPlayerX}`);
check("camera followed the moving player", Math.max(...camSamples) > 400, `maxCamX=${Math.max(...camSamples)}`);
check("smoothing shows a real follow lag (not glued)", sawLag, "camera matched the ideal position every sample");
check("shake fired when crossing the Quake Zone", sawShake, "no shake observed");
check("camera clamps at the world boundary (viewport right edge = maxX)",
  Math.abs(settledCamX - CAM_MAX_X) <= 12, `camX=${settledCamX} expected≈${CAM_MAX_X}`);
check("no NaN/invalid camera coordinates during the run", !sawNaN);

// Shake ends cleanly and the camera returns to the follow position without drift.
await page.waitForTimeout(1200);
check("shake has ended", !(await shaking()));
const restX1 = await camX();
await page.waitForTimeout(900);
const restX2 = await camX();
check("camera settled at the follow position after shake",
  Math.abs(restX1 - CAM_MAX_X) <= 12 && Math.abs(restX2 - restX1) <= 3,
  `restX1=${restX1} restX2=${restX2} expected≈${CAM_MAX_X}`);
check("no camera drift while idle (bounded shake, no accumulation)",
  Math.abs(restX2 - restX1) <= 3, `drift=${Math.abs(restX2 - restX1).toFixed(2)}px`);

// Restart re-snaps the camera to the clamped follow position (fresh run).
await page.getByRole("button", { name: /Restart/ }).first().click();
await page.waitForTimeout(1500);
check("restart re-snaps the camera to the clamped follow position",
  Math.abs((await camX()) - 0) <= 2 && Math.abs((await camY()) - 356) <= 2, `camX=${await camX()} camY=${await camY()}`);

// ---- 6. Persistence: reload the builder, the configuration survives -----------
await page.goto(`${WEB}/dashboard/projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await putModel(cookie, project.id, acceptanceModel()); // restore clean bounds (same shape as the saved config)
model = await getModel(cookie, project.id);
const savedCam = model.screens[0].components.find((c) => c.type === "camera").props;
check("camera configuration persisted (follow target, smoothing, bounds)",
  savedCam.followTarget === "p-player" && savedCam.smoothing === 0.12 &&
  savedCam.boundsEnabled === true && savedCam.maxX === WORLD.maxX,
  JSON.stringify({ followTarget: savedCam.followTarget, smoothing: savedCam.smoothing }));
check("shake handler persisted in the canonical model",
  model.screens[0].logic.handlers.some((h) => h.body.some((b) => b.type === "camera-shake")));

// ---- 7. Published runtime plays with the same camera ---------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  const slug = body.project.slug;
  await page.goto(`${WEB}/p/${slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const pubWorld = page.locator('[data-camera-world]');
  check("published page renders the camera world", (await pubWorld.count()) === 1);
  const pubCamX = async () => Number(await pubWorld.getAttribute("data-camera-x"));
  const pubShake = async () => (await pubWorld.getAttribute("data-camera-shake")) === "true";
  let pubSawShake = false;
  await page.keyboard.down("ArrowRight");
  for (let i = 0; i < 46; i += 1) {
    await page.waitForTimeout(250);
    if (await pubShake()) pubSawShake = true;
    if ((await pubCamX()) >= CAM_MAX_X - 20) break;
  }
  await page.keyboard.up("ArrowRight");
  await page.waitForTimeout(1200);
  check("published camera follows and clamps at the world boundary",
    Math.abs((await pubCamX()) - CAM_MAX_X) <= 15, `camX=${await pubCamX()} expected≈${CAM_MAX_X}`);
  check("published camera shakes from the same block logic", pubSawShake);
}

// ---- 8. Export parity: the standalone runtime carries the same camera ----------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export ships the camera engine (config + loop)",
    html.includes("cameraConfigOf") && html.includes("shakeLeft") && html.includes("camera-set-target"));
  check("export compiles the camera-shake block handler",
    html.includes('"camera-shake"'));
}

// ---- 9. No console/page errors anywhere ----------------------------------------
check("no console or page errors across editor, preview, published, export",
  errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
