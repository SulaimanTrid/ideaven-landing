// Sprite animation foundation (SLICE 2) E2E: real PNG frames uploaded through
// the project asset API, wired to a sprite entity as canonical `animations`
// clips; the runtime animates the displayed frame by elapsed time; block and
// action paths switch clips; published + export carry the same engine.
import zlib from "node:zlib";
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

// ---- minimal PNG generator (4×4 solid truecolor) --------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(r, g, b) {
  const w = 4, h = 4;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) { raw[o++] = r; raw[o++] = g; raw[o++] = b; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

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
async function uploadAsset(cookie, projectId, bytes, name) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), name);
  const res = await fetch(`${API}/api/projects/${projectId}/assets`, {
    method: "POST", body: form, headers: { Cookie: cookie },
  });
  const payload = await res.json();
  if (!res.ok || !payload.asset) throw new Error(`asset upload failed: ${res.status}`);
  return payload.asset.id;
}
async function waitForSaved(page) {
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15000 });
}

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`anim-${stamp}@ex.com`, `anim${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Anim Studio", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the coin-runner template`);

// ---- 1. Real frame assets: three solid-color PNGs ------------------------------
const frameIds = [];
const colors = [[196, 60, 80], [80, 140, 220], [230, 190, 70]];
for (let i = 0; i < colors.length; i++) {
  frameIds.push(await uploadAsset(cookie, project.id, makePng(...colors[i]), `frame-${i}.png`));
}
check("three real PNG frames uploaded through the asset API", frameIds.length === 3);

// ---- 2. Canonical model: sprite entity with two clips --------------------------
const ANIMS = `anim-walk~Walk~4~1~asset:${frameIds[0]},asset:${frameIds[1]},asset:${frameIds[2]};anim-once~Once~2~0~asset:${frameIds[0]},asset:${frameIds[1]},asset:${frameIds[2]}`;
{
  const model = await getModel(cookie, project.id);
  const play = model.screens.find((s) => s.id === "screen-play");
  play.components.push({
    id: "e-anim", type: "sprite",
    props: { name: "Animated Sprite", x: 220, y: 640, width: 48, height: 48, src: `asset:${frameIds[0]}`, animations: ANIMS, animation: "anim-walk", visible: true, collider: false },
  });
  play.logic.handlers.push({
    id: "h-anim-action", componentId: null, event: "action-pressed-jump",
    body: [{ id: "b-play-anim", kind: "statement", type: "play-animation", inputs: { componentId: "e-anim", animationId: "anim-once" } }],
  });
  await putModel(cookie, project.id, model);
  const round = (await getModel(cookie, project.id)).screens.find((s) => s.id === "screen-play");
  const sprite = round.components.find((c) => c.id === "e-anim");
  check("animations string survives the model round-trip",
    sprite.props.animations === ANIMS && sprite.props.animation === "anim-walk",
    `got "${sprite.props.animations}"`);
}

const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: "en-US" });
await context.addCookies([{ name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errors.push(`console: ${m.text()}`); });

await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);

// ---- 3. Editor: the Animation panel shows clips + frames ------------------------
await page.getByRole("treeitem").filter({ hasText: "Animated Sprite" }).first().click();
await page.waitForTimeout(500);
check("Animation panel lists both clips",
  (await page.getByLabel("Name for animation Walk").count()) === 1 &&
  (await page.getByLabel("Name for animation Once").count()) === 1);
check("clip frames render as real asset thumbnails",
  (await page.locator('img[src*="/api/assets/"]').count()) >= 3);

// Editor-local preview: Play cycles the preview frame at clip fps.
await page.getByRole("button", { name: "Play preview" }).click();
const previewImg = page.locator('[aria-label="Pause preview"]').locator("xpath=preceding::img[@alt=''][1]");
const p0 = await previewImg.first().getAttribute("src");
await page.waitForTimeout(450);
const p1 = await previewImg.first().getAttribute("src");
check("editor preview cycles frames while playing", p0 !== p1, `src ${p0} → ${p1}`);
await page.getByRole("button", { name: "Pause preview" }).click();

// ---- 4. Editor undo/redo through the existing history ---------------------------
const frameAddSelect = page.getByLabel("Add frame to Walk");
await frameAddSelect.selectOption({ index: 1 });
await page.getByRole("button", { name: "+ Frame" }).first().click();
await page.waitForTimeout(400);
check("a frame was added through the panel",
  (await page.getByText("4 frames").count()) >= 1);
await page.getByRole("button", { name: "Undo", exact: true }).first().click();
await page.waitForTimeout(600);
check("undo removes the added frame", (await page.getByText("4 frames").count()) === 0);
await page.getByRole("button", { name: "Redo", exact: true }).first().click();
await page.waitForTimeout(1200);
await waitForSaved(page);
const afterRedoModel = await getModel(cookie, project.id);
const afterRedoAnim = afterRedoModel.screens
  .find((s) => s.id === "screen-play")
  .components.find((c) => c.id === "e-anim").props.animations;
check("redo restores the added frame", afterRedoAnim.split(";")[0].split("~")[4].split(",").length === 4,
  `model="${afterRedoAnim}"`);
await waitForSaved(page);

// ---- 5. Preview runtime: frames actually change, loop cycles --------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /PLAY/ }).click();
const spriteImg = page.locator('[data-entity="e-anim"] img');
await spriteImg.waitFor({ state: "visible", timeout: 8000 });
const srcs = new Set();
for (let i = 0; i < 8; i++) {
  srcs.add(await spriteImg.getAttribute("src"));
  await page.waitForTimeout(180);
}
check("the sprite actually animates in preview (multiple distinct frames)",
  srcs.size >= 2, `distinct=${srcs.size} of 3 frames`);

// ---- 6. Action-triggered clip switch + non-loop completion ----------------------
// The screen-level handler plays "Once" (2 fps, no loop) on Jump pressed.
await page.keyboard.press(" "); // Jump → play-animation anim-once
await page.waitForTimeout(350);
const onceSrcA = await spriteImg.getAttribute("src");
await page.waitForTimeout(700);
const onceSrcB = await spriteImg.getAttribute("src");
check("action pressed switches to the second clip (frame changed after switch)",
  onceSrcA !== onceSrcB, `src ${onceSrcA} → ${onceSrcB}`);
await page.waitForTimeout(2200); // 3 frames @ 2 fps = 1.5 s, then it must stop
const doneA = await spriteImg.getAttribute("src");
await page.waitForTimeout(700);
const doneB = await spriteImg.getAttribute("src");
check("non-looping clip completes and stops on its last frame",
  doneA === doneB, `src ${doneA} → ${doneB}`);

// ---- 7. Published runtime: same semantics ---------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /PLAY/ }).first().click().catch(() => null);
  await page.waitForTimeout(1200);
  const pubImg = page.locator('[data-entity="e-anim"] img').first();
  check("published page renders the animated sprite", (await pubImg.count()) >= 1);
  if ((await pubImg.count()) >= 1) {
    const pubSrcs = new Set();
    for (let i = 0; i < 8; i++) {
      pubSrcs.add(await pubImg.getAttribute("src"));
      await page.waitForTimeout(180);
    }
    check("published page animates the sprite (multiple distinct frames)",
      pubSrcs.size >= 2, `distinct=${pubSrcs.size}`);
  }
}

// ---- 8. Export: carries clip data + playback engine -----------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds the canonical animation clips", html.includes("anim-walk") && html.includes("anim-once"));
  check("export ships the playback engine (parse + frame index + commands)",
    html.includes("parseAnimations") && html.includes("clipFrameIndex") && html.includes("animCommands"));
  check("export ships the play-animation block", html.includes("play-animation"));
}

// ---- 9. Missing asset safety: a broken frame ref must not crash the run ---------
{
  const model = await getModel(cookie, project.id);
  const play = model.screens.find((s) => s.id === "screen-play");
  const sprite = play.components.find((c) => c.id === "e-anim");
  sprite.props.animations = `anim-walk~Walk~4~1~asset:${frameIds[0]},asset:missing-asset-id,asset:${frameIds[2]}`;
  await putModel(cookie, project.id, model);
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const pageErrorsBefore = errors.filter((e) => e.startsWith("pageerror")).length;
  check("broken frame ref raises no runtime crash (page still interactive)",
    (await page.getByRole("button", { name: "Play", exact: true }).first().count()) === 1);
  await page.getByRole("button", { name: "Preview", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /PLAY/ }).click();
  await page.waitForTimeout(1000);
  check("preview run with a missing frame asset stays error-free",
    errors.filter((e) => e.startsWith("pageerror")).length === pageErrorsBefore,
    errors.filter((e) => e.startsWith("pageerror")).slice(0, 2).join(" | "));
}

// ---- Report --------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
