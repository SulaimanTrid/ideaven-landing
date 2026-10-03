// Input abstraction (SLICE 1 + 1b) E2E: the editor exposes the scene's
// abstract input actions; rebinding persists in the canonical model; the
// runtimes move/jump through ACTIONS — never raw keys. SLICE 1b adds the
// "when [Action] pressed" handler event: real edge-triggered dispatch to
// screen-level AND component handlers, no key-repeat refires, broken
// references diagnosed, published + export parity.
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

async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`actions-${stamp}@ex.com`, `actions${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Action Runner", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the coin-runner template`);

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ---- 1. Screen inspector lists the default action set ------------------------
// The coin-runner template opens on its Home screen; the playable scene (and
// its Input Actions panel) is the Play screen.
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
check("scene stage open for the Play screen", await page.getByText(/scene · Play/).count() > 0);
const jumpKeys = page.getByLabel("Keys for Jump");
check("Input actions panel lists the three built-in actions",
  (await page.getByLabel("Action name for Move left").count()) === 1 &&
  (await page.getByLabel("Action name for Move right").count()) === 1 &&
  (await jumpKeys.count()) === 1);
const defaultKeys = await jumpKeys.inputValue();
check("default Jump bindings are the legacy keys (arrowup, w, space)",
  defaultKeys.replace(/\s/g, "") === "arrowup,w,", `keys="${defaultKeys}"`);

// ---- 2. Rebind Jump to "j" (replaces the whole binding list) -----------------
await jumpKeys.fill("j");
await jumpKeys.press("Enter");
await waitForSaved(page);
let model = await getModel(cookie, project.id);
let play = model.screens.find((s) => s.id === "screen-play");
let jumpAction = (play?.inputActions ?? []).find((a) => a.id === "jump");
check("canonical model stores the custom inputActions with Jump → j",
  Array.isArray(play?.inputActions) && jumpAction && jumpAction.keys.join(",") === "j" && jumpAction.enabled === true,
  JSON.stringify(play?.inputActions));

// ---- 3. Undo restores the default set (field removed), redo restores it -----
await page.getByRole("button", { name: "Undo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
play = model.screens.find((s) => s.id === "screen-play");
check("undo removes the explicit set (defaults apply again)",
  !play?.inputActions?.length, JSON.stringify(play?.inputActions ?? null));
await page.getByRole("button", { name: "Redo", exact: true }).click();
await waitForSaved(page);
model = await getModel(cookie, project.id);
play = model.screens.find((s) => s.id === "screen-play");
jumpAction = (play?.inputActions ?? []).find((a) => a.id === "jump");
check("redo restores the custom set (Jump → j)", Boolean(jumpAction && jumpAction.keys.join(",") === "j"));

// ---- 4. Hard reload: the action set persists ---------------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
// Reload lands on the start screen; go back to the Play scene.
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
const jumpKeys2 = page.getByLabel("Keys for Jump");
check("rebinding survives reload in the panel", (await jumpKeys2.inputValue()).replace(/\s/g, "") === "j");

// ---- 4b. Blocks mode: the event picker lists the action event (SLICE 1b) -----
await page.getByRole("button", { name: "Blocks", exact: true }).first().click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Add handler", exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel("Handler target").selectOption({ label: "Player 1 · Player" });
await page.waitForTimeout(200);
const eventSelect = page.getByLabel("Event");
check("event picker lists “When Jump pressed” from screen.inputActions",
  (await eventSelect.locator("option").allTextContents()).some((o) => o.includes("When Jump pressed")),
  (await eventSelect.locator("option").allTextContents()).join(" | "));
await eventSelect.selectOption({ label: "When Jump pressed" });
await page.getByRole("button", { name: "Add handler", exact: true }).last().click();
await page.waitForTimeout(500);
check("handler created through the real UI", (await page.getByText(/When Jump pressed/).count()) >= 1);
await page.getByRole("button", { name: "Undo", exact: true }).click();
await page.waitForTimeout(600);
check("undo removes the handler (existing history system)",
  (await page.getByText(/When Jump pressed/).count()) === 0);
await page.getByRole("button", { name: "Redo", exact: true }).click();
await page.waitForTimeout(1500);
await waitForSaved(page);
check("redo restores the handler", (await page.getByText(/When Jump pressed/).count()) >= 1);

// ---- 4c. Give the handler a real body + a second (screen-level) handler ------
// The dispatch path under test is the runtime's; bodies are attached through
// the canonical model the same way every handler is stored.
model = await getModel(cookie, project.id);
play = model.screens.find((s) => s.id === "screen-play");
const playerHandler = play.logic.handlers.find(
  (h) => h.event === "action-pressed-jump" && h.componentId === "p-player",
);
check("action handler persisted in the canonical model", Boolean(playerHandler),
  JSON.stringify(play.logic.handlers.map((h) => h.event)));
playerHandler.body = [
  { id: "b-taps", kind: "statement", type: "change-variable", inputs: { name: "taps", amount: 1 } },
  {
    id: "b-pressed", kind: "statement", type: "set-property",
    inputs: { componentId: "t-taps", property: "text" },
    slots: { value: { id: "x-pressed", kind: "expression", type: "text", inputs: { value: "JUMPED" } } },
  },
];
play.logic.handlers.push({
  id: "h-action-screen", componentId: null, event: "action-pressed-jump",
  body: [{ id: "b-screen-taps", kind: "statement", type: "change-variable", inputs: { name: "screenTaps", amount: 1 } }],
});
play.components.push({
  id: "t-taps", type: "text",
  props: { name: "Taps HUD", text: "TAPS 0", x: 12, y: 60, fontSize: 14, visible: true },
});
model.variables.push({ id: "v-taps", name: "taps", type: "number" });
model.variables.push({ id: "v-screen-taps", name: "screenTaps", type: "number" });
await putModel(cookie, project.id, model);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ---- 5. Preview: edge-triggered dispatch, no key-repeat refires ---------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /PLAY/ }).click();
const player = page.locator('[data-entity="p-player"]');
await player.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1500); // settle on the floor

// Space is NO LONGER bound to Jump: pressing it must not lift the player.
// Blur first — Space activates a focused HUD button — and measure the player
// RELATIVE to the world container: Space now also scrolls the page (it is no
// longer preventDefault-ed), which shifts every viewport box equally.
const worldYOf = () => page.$eval('[data-entity="p-player"]', (el) => {
  const world = el.closest("[data-camera-world]");
  return el.getBoundingClientRect().top - world.getBoundingClientRect().top;
});
const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
await blur();
const restY = await worldYOf();
let spaceMinY = restY;
for (let i = 0; i < 3; i++) {
  await page.keyboard.press(" ");
  await page.waitForTimeout(90);
  const y = await worldYOf();
  if (y < spaceMinY) spaceMinY = y;
  await page.waitForTimeout(80);
}
check("Space no longer jumps (binding moved to j)",
  spaceMinY - restY > -8, `lift=${(restY - spaceMinY).toFixed(1)}px (expected ≈0)`);

const before = await player.boundingBox();
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(700);
await page.keyboard.up("ArrowRight");
const afterMove = await player.boundingBox();
check("ArrowRight (move-right action) moves the player",
  Number.isFinite(before?.x) && Number.isFinite(afterMove?.x) && afterMove.x - before.x > 20,
  `dx=${(afterMove.x - before.x).toFixed(1)}`);

// Open the runtime trace and prove edge-triggered dispatch with CONTROLLED
// presses (the jump-lift loop below presses j repeatedly, so counting must
// happen in its own window).
await page.getByRole("button", { name: /Runtime trace/ }).click();
await page.waitForTimeout(400);
const dispatchLines = () => page.getByText(/action-pressed-jump/).count();
const screenLines = () => page.getByText(/event screen:action-pressed-jump/).count();
const compLines = () => page.getByText(/p-player:action-pressed-jump/).count();
await blur();
const base = await dispatchLines();

// Press #1 = down + hold + up. The DOWN is the only edge: exactly two
// dispatch trace lines (screen-level + player handler).
await page.keyboard.down("j");
await page.waitForTimeout(400);
const afterOne = await dispatchLines();
check("one press dispatches the action event to BOTH handlers (screen + player)",
  afterOne - base === 2,
  `delta=${afterOne - base} screen=${await screenLines()} comp=${await compLines()}`);
check("the handler's visible effect ran (HUD text changed)",
  (await page.getByText("JUMPED").count()) >= 1);

// HOLD: no further keydowns happen while held → no further dispatches.
await page.waitForTimeout(900);
const duringHold = await dispatchLines();
check("holding the key fires no further dispatches (true edge trigger)",
  duringHold === afterOne, `delta=${duringHold - afterOne}`);

// RELEASE: the up-edge fires no action-pressed event.
await page.keyboard.up("j");
await page.waitForTimeout(300);
const afterRelease = await dispatchLines();
check("releasing the key dispatches nothing (pressed-only event)",
  afterRelease === duringHold, `delta=${afterRelease - duringHold}`);

// Press #2: a fresh edge after release dispatches again.
await page.keyboard.down("j");
await page.waitForTimeout(400);
const afterSecondPress = await dispatchLines();
check("release + press dispatches again (second event)",
  afterSecondPress - afterOne === 2, `delta=${afterSecondPress - afterOne}`);
await page.keyboard.up("j");
await page.waitForTimeout(200);
check("no console errors in preview so far", errors.length === 0, errors.slice(0, 2).join(" | "));

// Jump-lift: the rebound key lifts the player (physics proof, own window).
let minY = afterMove.y;
for (let i = 0; i < 10; i++) {
  await page.keyboard.press("j");
  await page.waitForTimeout(90);
  const b = await player.boundingBox();
  if (b.y < minY) minY = b.y;
  await page.waitForTimeout(60);
}
check("rebound Jump key (j) makes the player jump",
  afterMove.y - minY > 15, `lift=${(afterMove.y - minY).toFixed(1)}px`);

// ---- 6. Published page plays through the same actions + handler ---------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // The published page mounts the start screen; enter the Play scene.
  await page.getByRole("button", { name: /PLAY/ }).first().click().catch(() => null);
  await page.waitForTimeout(1500);
  const pubPlayer = page.locator('[data-entity="p-player"]').first();
  check("published page renders the playable scene", (await pubPlayer.count()) >= 1);
  if ((await pubPlayer.count()) >= 1) {
    await pubPlayer.waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(1200); // settle on the floor
    const start = await pubPlayer.boundingBox();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(700);
    await page.keyboard.up("ArrowRight");
    const moved = await pubPlayer.boundingBox();
    check("published page: move-right action moves the player",
      Number.isFinite(start?.x) && moved.x - start.x > 10, `dx=${(moved.x - start.x).toFixed(1)}`);
    // One press of j: the same action event must run the handler visibly.
    await page.keyboard.press("j");
    await page.waitForTimeout(500);
    check("published page: action handler executes (HUD text changes)",
      (await page.getByText("JUMPED").count()) >= 1);
  }
}

// ---- 7. Export parity: the standalone runtime carries the action engine -------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds the canonical inputActions", html.includes('"inputActions"'), "no inputActions in model JSON");
  check("export ships the action controller (index + just-pressed engine)",
    html.includes("inputKeyIndex") && html.includes("justPressed"), "missing action engine markers");
  check("export ships the action-event fan-out", html.includes("dispatchActionPressed"), "missing dispatcher");
  check("export carries the action handler", html.includes("action-pressed-jump"), "handler not embedded");
}

// ---- 8. Diagnostics: removing a built-in action warns honestly -----------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);// TASK 60: the diagnostics drawer starts COLLAPSED - open it to read entries.
await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
await page.waitForTimeout(250);const leftDelete = page.getByRole("button", { name: "Delete action Move left" });
await leftDelete.click();
// The top bar can already read "Saved" right after a reload, so give the
// autosave a real moment before fetching the model.
await page.waitForTimeout(1500);
await waitForSaved(page);
check("deleting a built-in action raises a diagnostic (player control lost)",
  (await page.getByText(/Move left.*missing or disabled|expects the input actions/).count()) >= 1,
  "no diagnostic visible");
model = await getModel(cookie, project.id);
play = model.screens.find((s) => s.id === "screen-play");
check("canonical model no longer carries move-left",
  !(play?.inputActions ?? []).some((a) => a.id === "move-left"), JSON.stringify(play?.inputActions ?? null));

// ---- 9. Broken reference: deleting the action a handler listens to ------------
const jumpDelete = page.getByRole("button", { name: "Delete action Jump" });
await jumpDelete.click();
await page.waitForTimeout(1500);
await waitForSaved(page);
check("deleting the action a handler reacts to raises a broken-reference diagnostic",
  (await page.getByText(/which no longer exists|never fire/).count()) >= 1,
  "no broken-reference diagnostic");
model = await getModel(cookie, project.id);
play = model.screens.find((s) => s.id === "screen-play");
check("the handler itself survives (never silently erased)",
  (play.logic.handlers ?? []).some((h) => h.event === "action-pressed-jump"));

// ---- Report ------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
