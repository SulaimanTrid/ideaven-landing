// Animation state machine (SLICE 3) E2E: a REAL playable flow — the player
// entity carries four clips and a state machine; the machine's built-in
// parameters read actual physics (speed, isGrounded), an action event fires
// the attack trigger, and the machine drives the SLICE 2 animation player
// through Idle → Run → Jump → Attack → Idle in preview and published.
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

// ---- minimal PNG generator (4×4 solid truecolor, per-frame color) --------------
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
  ihdr[8] = 8;
  ihdr[9] = 2;
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
const assetIdOf = (src) => (src ?? "").split("/api/assets/")[1]?.split("/")[0] ?? "";

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const cookie = await apiRegister(`sm-${stamp}@ex.com`, `sm${stamp}`);

let project;
{
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "SM Runner", type: "game", template: "coin-runner" }),
  });
  project = (await res.json()).project;
}
console.log(`project ${project.id} created from the coin-runner template`);

// ---- 1. Four clips × two frames each, per state, distinct colors ---------------
const CLIP_COLORS = {
  idle: [[120, 130, 150], [140, 150, 170]],
  run: [[40, 90, 200], [60, 120, 230]],
  jump: [[80, 200, 170], [110, 220, 190]],
  attack: [[220, 80, 100], [240, 110, 130]],
};
const frameIds = {}; // clipId → [assetId, …]
{
  let n = 0;
  for (const [clip, colors] of Object.entries(CLIP_COLORS)) {
    frameIds[clip] = [];
    for (const [r, g, b] of colors) {
      frameIds[clip].push(await uploadAsset(cookie, project.id, makePng(r, g, b), `${clip}-${n}.png`));
      n++;
    }
  }
}
check("eight real frame PNGs uploaded (four clips)", Object.values(frameIds).every((ids) => ids.length === 2));

// ---- 2. Canonical machine: Idle/Run/Jump/Attack on the player ------------------
const ANIMS = [
  `anim-idle~Idle~2~1~asset:${frameIds.idle[0]},asset:${frameIds.idle[1]}`,
  `anim-run~Run~6~1~asset:${frameIds.run[0]},asset:${frameIds.run[1]}`,
  `anim-jump~Jump~2~1~asset:${frameIds.jump[0]},asset:${frameIds.jump[1]}`,
  `anim-attack~Attack~2~0~asset:${frameIds.attack[0]},asset:${frameIds.attack[1]}`,
].join(";");
const ANIMATOR = [
  "D:st-idle",
  "S:st-idle~Idle~anim-idle~1",
  "S:st-run~Run~anim-run~1",
  "S:st-jump~Jump~anim-jump~1",
  "S:st-attack~Attack~anim-attack~1",
  "P:speed~number~0",
  "P:isGrounded~bool~1",
  "P:attack~trigger~0",
  "T:st-idle~st-run~0~0~speed>0",
  "T:st-run~st-idle~0~0~speed<=0",
  "T:st-idle~st-jump~1~0~isGrounded==0",
  "T:st-run~st-jump~1~0~isGrounded==0",
  "T:st-jump~st-idle~0~0~isGrounded==1",
  "T:*~st-attack~-1~0~attack==1",
  "T:st-attack~st-idle~0~1~",
].join(";");
{
  const model = await getModel(cookie, project.id);
  const play = model.screens.find((s) => s.id === "screen-play");
  const player = play.components.find((c) => c.type === "player");
  player.props.animations = ANIMS;
  player.props.animator = ANIMATOR;
  // A dedicated Attack action (the defaults plus attack→F) — the machine must
  // never reason about the physical key.
  play.inputActions = [
    { id: "move-left", name: "Move left", keys: ["arrowleft", "a"], enabled: true },
    { id: "move-right", name: "Move right", keys: ["arrowright", "d"], enabled: true },
    { id: "jump", name: "Jump", keys: ["arrowup", "w"], enabled: true },
    { id: "attack", name: "Attack", keys: ["f"], enabled: true },
  ];
  play.logic.handlers.push({
    id: "h-attack", componentId: null, event: "action-pressed-attack",
    body: [{ id: "b-trigger-attack", kind: "statement", type: "trigger-animation-param", inputs: { componentId: player.id, name: "attack" } }],
  });
  await putModel(cookie, project.id, model);
  const round = (await getModel(cookie, project.id)).screens.find((s) => s.id === "screen-play");
  const sprite = round.components.find((c) => c.type === "player");
  check("animations + animator survive the model round-trip",
    sprite.props.animations === ANIMS && sprite.props.animator === ANIMATOR);
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

// ---- 3. Editor: the state machine panel shows the real machine ------------------
await page.getByRole("treeitem").filter({ hasText: /Player/ }).first().click();
await page.waitForTimeout(500);
check("state machine panel lists all four states",
  (await page.getByLabel("Name for state Idle").count()) === 1 &&
  (await page.getByLabel("Name for state Run").count()) === 1 &&
  (await page.getByLabel("Name for state Jump").count()) === 1 &&
  (await page.getByLabel("Name for state Attack").count()) === 1);
check("parameters listed (speed, isGrounded, attack)",
  (await page.getByText("speed").count()) >= 1 && (await page.getByText("attack").count()) >= 1);
check("transitions listed (seven entries incl. Any State sources)",
  (await page.locator('[aria-label^="Conditions for transition"]').count()) === 7);

// ---- 4. Preview: the REAL playable flow through the machine ---------------------
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /PLAY/ }).click();
const playerImg = page.locator('[data-entity="p-player"] img');
await playerImg.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1200); // settle: Idle

const clipOf = (src) => {
  const id = assetIdOf(src ?? "");
  for (const [clip, ids] of Object.entries(frameIds)) if (ids.includes(id)) return clip;
  return "unknown";
};
const sampleClips = async (times, gapMs = 160) => {
  const seen = [];
  for (let i = 0; i < times; i++) {
    seen.push(clipOf(await playerImg.getAttribute("src")));
    await page.waitForTimeout(gapMs);
  }
  return seen;
};

// Idle at rest.
let samples = await sampleClips(4);
check("starts in the Idle state (default)", samples.every((c) => c === "idle"), JSON.stringify(samples));

// Move right → speed > 0 → Run.
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(350);
samples = await sampleClips(5);
await page.keyboard.up("ArrowRight");
check("movement switches to Run (machine-driven)", samples.some((c) => c === "run"), JSON.stringify(samples));

// Stop → friction bleeds speed → back to Idle.
await page.waitForTimeout(1400);
samples = await sampleClips(4);
check("stopping returns to Idle (speed <= 0)", samples.every((c) => c === "idle"), JSON.stringify(samples));

// Jump → Any State → Jump (isGrounded == 0); land → Idle.
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(200);
await page.keyboard.press("ArrowUp");
samples = await sampleClips(6);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(1200);
check("jumping enters the Jump state while airborne", samples.includes("jump"), JSON.stringify(samples));
samples = await sampleClips(4);
check("landing returns to a grounded state (Idle)", samples.every((c) => c === "idle"), JSON.stringify(samples));

// Attack via its own action event → trigger parameter → Any State → Attack;
// the non-loop clip completes → back to Idle (exit time 1).
await page.keyboard.press("f");
await page.waitForTimeout(300);
samples = await sampleClips(4);
check("attack trigger enters the Attack state", samples.includes("attack"), JSON.stringify(samples));
await page.waitForTimeout(2200); // 2 frames @ 2 fps = 1 s, then completes
samples = await sampleClips(4);
check("attack completes and the machine returns to Idle", samples.every((c) => c === "idle"), JSON.stringify(samples));

// ---- 5. Persistence: reload → the machine still drives the player ---------------
await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /PLAY/ }).click();
await playerImg.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1200);
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(400);
samples = await sampleClips(5);
await page.keyboard.up("ArrowRight");
check("after save + reload the machine still switches Idle → Run", samples.some((c) => c === "run"), JSON.stringify(samples));

// ---- 6. Published runtime: same machine semantics --------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
  const body = await res.json();
  await page.goto(`${WEB}/p/${body.project.slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /PLAY/ }).first().click().catch(() => null);
  await page.waitForTimeout(1200);
  const pubImg = page.locator('[data-entity="p-player"] img').first();
  check("published page renders the animated player", (await pubImg.count()) >= 1);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(400);
  const pubSamples = [];
  for (let i = 0; i < 5; i++) {
    pubSamples.push(clipOf(await pubImg.getAttribute("src")));
    await page.waitForTimeout(160);
  }
  await page.keyboard.up("ArrowRight");
  check("published page: movement switches to Run", pubSamples.some((c) => c === "run"), JSON.stringify(pubSamples));
}

// ---- 7. Export carries the machine ------------------------------------------------
{
  const res = await fetch(`${API}/api/projects/${project.id}/export/html`, { headers: { Cookie: cookie } });
  const html = await res.text();
  check("export embeds the animator + clips", html.includes("st-idle") && html.includes("anim-run"));
  check("export ships the machine engine (parse + evaluator)",
    html.includes("parseAnimator") && html.includes("evaluateAnimatorTransitions"));
  check("export ships the parameter blocks", html.includes("set-animation-param") && html.includes("trigger-animation-param"));
}

// ---- 8. Broken references: diagnostics + stable runtime ---------------------------
{
  const model = await getModel(cookie, project.id);
  const play = model.screens.find((s) => s.id === "screen-play");
  const player = play.components.find((c) => c.type === "player");
  player.props.animator = ANIMATOR.replace("S:st-run~Run~anim-run~1", "S:st-run~Run~anim-missing~1");
  await putModel(cookie, project.id, model);
  await page.goto(`${WEB}/builder/${project.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // The machine lives on the Play screen — open it so its diagnostics show.
  await page.getByRole("button", { name: "Play", exact: true }).first().click().catch(() => null);
  await page.waitForTimeout(1000);
  check("a state referencing a missing clip raises a diagnostic",
    (await page.getByText(/references the clip “anim-missing”/).count()) >= 1);
  await page.getByRole("button", { name: "Preview", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /PLAY/ }).click();
  await playerImg.waitFor({ state: "visible", timeout: 8000 });
  await page.waitForTimeout(1000);
  check("runtime stays stable with a broken clip reference (no page errors)",
    errors.filter((e) => e.startsWith("pageerror")).length === 0,
    errors.filter((e) => e.startsWith("pageerror")).slice(0, 2).join(" | "));
}

// ---- Report ---------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed === 0 ? 0 : 1);
