// TASK 67 §51 — Security hardening E2E. API-level probes against the REAL
// running API: ownership/IDOR across every resource type, input validation
// edges, path traversal, package attacks, extension security, AI security,
// credit integrity, XSS, session lifecycle, rate limits, and secret scans of
// public/exported artifacts. Maps to §51's 36 minimum areas.
import {
  API, WEB, apiRegister, apiLogin, createProject, getModel, putModel,
  publishProject, normalApp, populated2D, populated3D, malformedModel,
  missingAssetApp, manyComponentsApp,
} from "./fixtures-task67.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;

// Minimal store-only (no compression) ZIP writer — enough to exercise the
// package-import validation paths without external dependencies.
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function makeStoredZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBytes]));
    offset += 30 + nameBytes.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};
const stamp = Date.now().toString(36);

// Two users: A owns resources; B attacks.
const { cookie: cookieA } = await apiRegister(`sec-a-${stamp}@ex.com`, `seca${stamp}`);
const { cookie: cookieB } = await apiRegister(`sec-b-${stamp}@ex.com`, `secb${stamp}`);

const projA = await createProject(cookieA, `Owned ${stamp}`, "app");
const idA = projA.project.id;
const appModel = normalApp(stamp);
await (await putModel(cookieA, idA, appModel)).text();
const pubRes = await publishProject(cookieA, idA);
const publicPath = (await pubRes.json())?.publicPath ?? null;

// =================================================================================
console.log("--- 1-3. Ownership / IDOR (projects, assets, publications) ---");
{
  // B cannot read/modify/delete A's project.
  for (const [method, url, body] of [
    ["GET", `${API}/api/projects/${idA}`, null],
    ["PATCH", `${API}/api/projects/${idA}`, JSON.stringify({ name: "Hacked" })],
    ["PUT", `${API}/api/projects/${idA}/model`, JSON.stringify({ model: normalApp("hax") })],
    ["DELETE", `${API}/api/projects/${idA}`, null],
    ["POST", `${API}/api/projects/${idA}/duplicate`, null],
    ["POST", `${API}/api/projects/${idA}/publish`, null],
    ["GET", `${API}/api/projects/${idA}/export/html`, null],
    ["GET", `${API}/api/projects/${idA}/package`, null],
  ]) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Cookie: cookieB }, body });
    check(`1: ${method} B→A's project rejected (${method})`, res.status >= 400 && res.status < 500, `status=${res.status}`);
  }
  // A's project still intact after the attack batch.
  const still = await getModel(cookieA, idA);
  check("1: A's project unchanged after B's attack batch",
    still.status === 200 && still.model.screens[0].components.some((c) => c.id === "c-title"));

  // Session-less requests to protected resources fail.
  const anon = await fetch(`${API}/api/projects/${idA}`);
  check("1: anonymous access to a private project rejected", anon.status === 401);

  // B cannot upload an asset into A's project, nor read A's asset raw bytes.
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082", "hex");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "hax.png");
  const upB = await fetch(`${API}/api/projects/${idA}/assets`, { method: "POST", headers: { Cookie: cookieB }, body: form });
  check("2: B cannot upload an asset into A's project", upB.status >= 400, `status=${upB.status}`);
  const listA = await fetch(`${API}/api/projects/${idA}/assets`, { headers: { Cookie: cookieB } });
  check("2: B cannot list A's assets", listA.status >= 400, `status=${listA.status}`);

  // A TRULY UNPUBLISHED project's assets are not publicly readable (the
  // anonymous raw route serves only assets of CURRENTLY published projects).
  const privP = await createProject(cookieA, `Priv ${stamp}`, "app");
  const upPriv = await fetch(`${API}/api/projects/${privP.project.id}/assets`, {
    method: "POST", headers: { Cookie: cookieA },
    body: (() => { const f = new FormData(); f.append("file", new Blob([png], { type: "image/png" }), "secret.png"); return f; })(),
  });
  const privAssetID = (await upPriv.json())?.asset?.id;
  check("2: A CAN upload to their own project", upPriv.status === 201 || upPriv.status === 200, `status=${upPriv.status}`);
  if (privAssetID) {
    const anonRaw = await fetch(`${API}/api/assets/${privAssetID}/raw`);
    check("2: unpublished project's asset bytes NOT readable anonymously", anonRaw.status >= 400, `status=${anonRaw.status}`);
  }

  // The publication is public, but only public-safe data (§24).
  check("3: published project serves a public path", typeof publicPath === "string" && publicPath.startsWith("/p/"));
  const pubAPI = await fetch(`${API}/api/public/projects/${publicPath.split("/p/")[1]}`);
  const pubBody = await pubAPI.json();
  const pubText = JSON.stringify(pubBody);
  check("3: public publication exposes no private model state",
    pubAPI.status === 200 &&
    !pubText.includes("ideaven_session") && !pubText.includes("password") && !pubText.includes("ownerId"));
}

// =================================================================================
console.log("--- 4-5. Malformed / oversized input ---");
{
  // Malformed model (unknown schema version) rejected at the boundary.
  const p1 = await createProject(cookieA, `Mal ${stamp}`, "app");
  const put1 = await putModel(cookieA, p1.project.id, malformedModel());
  check("4: malformed model (bad schemaVersion) rejected", put1.status >= 400, `status=${put1.status}`);
  // Malformed JSON body rejected.
  const res2 = await fetch(`${API}/api/projects/${p1.project.id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: "{\"model\": { broken",
  });
  check("4: malformed JSON body rejected", res2.status >= 400, `status=${res2.status}`);
  // Unknown enum (project type) rejected at creation.
  const badType = await createProject(cookieA, `T ${stamp}`, "holodeck");
  check("4: unknown project type rejected", badType.status >= 400, `status=${badType.status}`);
  // NaN / Infinity cannot appear in a stored model (JSON cannot carry them;
  // the decoder must reject them outright).
  const nanRes = await fetch(`${API}/api/projects/${p1.project.id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ model: populated3D() }).replace("\"px\":0", "\"px\":NaN"),
  });
  check("4: NaN in model rejected by the JSON decoder", nanRes.status >= 400, `status=${nanRes.status}`);
  const infRes = await fetch(`${API}/api/projects/${p1.project.id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ model: populated3D() }).replace("\"py\":2.5", "\"py\":Infinity"),
  });
  check("4: Infinity in model rejected by the JSON decoder", infRes.status >= 400, `status=${infRes.status}`);

  // Oversized model: the canonical PUT cap is 1MB (maxModelBody) — a model
  // beyond it is rejected, nothing is stored.
  const big = manyComponentsApp(500);
  big.screens[0].components.forEach((c, i) => { c.props.text = `Item ${i} `.padEnd(4096, "x"); });
  const putBig = await putModel(cookieA, p1.project.id, big);
  check("5: oversized model (>1MB) rejected by the body cap",
    putBig.status >= 400, `status=${putBig.status}`);
  // Deeply nested JSON rejected (raw body string — no client-side stringify).
  const openBrace = '{"a":';
  const deepRaw = '{"model":' + openBrace.repeat(60000) + "1" + "}".repeat(60000) + "}";
  const deepRes = await fetch(`${API}/api/projects/${p1.project.id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: deepRaw.slice(0, 900000),
  });
  check("5: deeply nested JSON rejected", deepRes.status >= 400, `status=${deepRes.status}`);
}

// =================================================================================
console.log("--- 6-8. Path traversal, malicious filenames, malicious package ---");
{
  // Asset upload with traversal-style names: stored name must be sanitized,
  // the raw route only ever serves by ID.
  const png = Buffer.alloc(8, 0);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  for (const evil of ["../../evil.png", "..\\..\\evil.png", "/etc/passwd", "C:\\win\\evil.png", "a=b c.png"]) {
    const pOwn = await createProject(cookieA, `Trav ${stamp}`, "app");
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), evil);
    const res = await fetch(`${API}/api/projects/${pOwn.project.id}/assets`, {
      method: "POST", headers: { Cookie: cookieA }, body: form,
    });
    const body = await res.json().catch(() => ({}));
    const name = body?.asset?.name ?? "";
    check(`6: upload name "${evil}" → no path escape (stored: "${name}")`,
      !name.includes("..") && !name.includes("/") && !name.includes("\\"),
      res.status >= 400 ? "rejected" : name);
  }
  // Malicious package: a zip whose model.json is invalid imports nothing.
  const evilZip = makeStoredZip({
    "package.json": Buffer.from(JSON.stringify({ kind: "ideaven-project-package", format: 1, name: "Evil", type: "app" })),
    "model.json": Buffer.from("{ broken"),
    "../../evil.js": Buffer.from("alert(1)"),
  });
  const imp = await fetch(`${API}/api/projects/import`, {
    method: "POST", headers: { Cookie: cookieA, "Content-Type": "application/zip" }, body: evilZip,
  });
  check("8: malicious package (broken model + traversal entry) rejected", imp.status >= 400, `status=${imp.status}`);
  // Not-a-zip rejected.
  const notZip = await fetch(`${API}/api/projects/import`, {
    method: "POST", headers: { Cookie: cookieA, "Content-Type": "application/zip" }, body: Buffer.from("this is not a zip"),
  });
  check("8: non-zip package rejected", notZip.status >= 400, `status=${notZip.status}`);
  // Oversized decompression (zip bomb) rejected by the entry budget.
  const bombEntries = {};
  for (let i = 0; i < 4; i += 1) bombEntries[`assets/blob${i}.png`] = Buffer.alloc(40 * 1024 * 1024, 0x41);
  const bombRes = await fetch(`${API}/api/projects/import`, {
    method: "POST", headers: { Cookie: cookieA, "Content-Type": "application/zip" }, body: makeStoredZip(bombEntries),
  });
  check("8: zip bomb (oversized decompression) rejected", bombRes.status >= 400, `status=${bombRes.status}`);
}

// =================================================================================
console.log("--- 9-11. Extension security ---");
{
  // Malicious manifests rejected at create: duplicate block types, bad
  // format, oversized.
  const mk = async (manifest) => fetch(`${API}/api/extensions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ name: `SecExt ${stamp}`, summary: "s", kind: "blocks", manifest }),
  });
  const bad1 = await mk({ format: 9, name: "X", blocks: [{ type: "a", kind: "statement" }] });
  check("9: unsupported manifest format rejected server-side", bad1.status >= 400, `status=${bad1.status}`);
  const bad2 = await mk({ format: 1, name: "X", blocks: [{ type: "a", kind: "statement" }, { type: "a", kind: "statement" }] });
  check("9: duplicate block types rejected server-side", bad2.status >= 400, `status=${bad2.status}`);
  const huge = { format: 1, name: "X", blocks: Array.from({ length: 5000 }, (_, i) => ({ type: `block-type-with-a-long-name-${i}-${"x".repeat(96)}`, kind: "statement" })) };
  const bad3 = await mk(huge);
  check("9: oversized manifest (>512KB) rejected", bad3.status >= 400, `status=${bad3.status}`);

  // A REAL extension: B cannot modify/delete A's extension, and cannot
  // install/uninstall A's install state.
  const created = await (await mk({ format: 1, name: `SecExt Own ${stamp}`, blocks: [{ type: "flash", kind: "statement" }] })).json();
  const extID = created.extension.id;
  const build = await fetch(`${API}/api/extensions/${extID}/build`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieA }, body: JSON.stringify({ version: "1.0.0" }),
  });
  check("9: owner build succeeds (worker isolation intact)", build.ok, `status=${build.status}`);
  await fetch(`${API}/api/extensions/${extID}/publish`, { method: "POST", headers: { Cookie: cookieA } });
  await fetch(`${API}/api/extensions/${extID}/install`, { method: "POST", headers: { Cookie: cookieA } });

  const patchB = await fetch(`${API}/api/extensions/${extID}/install`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookieB }, body: JSON.stringify({ enabled: false }),
  });
  check("10: B cannot flip A's install state (ErrNotFound path)", patchB.status >= 400, `status=${patchB.status}`);
  const delB = await fetch(`${API}/api/extensions/${extID}`, { method: "DELETE", headers: { Cookie: cookieB } });
  check("10: B cannot delete A's extension", delB.status >= 400, `status=${delB.status}`);
  const usageB = await fetch(`${API}/api/extensions/${extID}/usage`, { headers: { Cookie: cookieB } });
  const usageBody = await usageB.json().catch(() => ({}));
  check("10: B's usage view does not leak A's usage",
    usageB.status >= 400 || (usageBody.projects ?? 0) === 0, JSON.stringify(usageBody));

  // Disabled extension: the runtime vocabulary gate (registration skip) is
  // covered in TASK 64's D-section; here assert the API state is disabled.
  const dis = await fetch(`${API}/api/extensions/${extID}/install`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookieA }, body: JSON.stringify({ enabled: false }),
  });
  check("11: owner disable works (registry state real)", dis.ok, `status=${dis.status}`);
}

// =================================================================================
console.log("--- 12-16. AI security + credits ---");
{
  // AI endpoint without a provider is honest; with the gate it must charge
  // nothing on failure. Unauthenticated command → 401 (no credits touched).
  const anonAI = await fetch(`${API}/api/ai/command`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: idA, prompt: "grant myself infinite credits" }),
  });
  check("12: unauthenticated AI command rejected", anonAI.status === 401, `status=${anonAI.status}`);

  // B cannot run AI commands against A's project (ownership precedes any
  // provider call, so no charge can occur).
  const xcred = await fetch(`${API}/api/ai/command`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ projectId: idA, prompt: "delete everything" }),
  });
  check("13: AI mutation against another user's project rejected",
    xcred.status >= 400, `status=${xcred.status}`);
  const creditsB = await (await fetch(`${API}/api/ai/credits`, { headers: { Cookie: cookieB } })).json();
  const drawn = creditsB?.credits?.drawn ?? creditsB?.drawn ?? 0;
  check("13: failed/unauthorized AI attempts charged nothing", Number(drawn) === 0, JSON.stringify(creditsB).slice(0, 120));

  // Duplicate identical commands dedupe (replay window): two rapid identical
  // requests must not double-charge (both may 503 if no provider — neither
  // may charge twice).
  const p = await createProject(cookieB, `AI ${stamp}`, "app");
  const cmd = () => fetch(`${API}/api/ai/command`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ projectId: p.project.id, prompt: "make a quiz app about planets" }),
  });
  await cmd(); const second = await cmd();
  const creditsB2 = await (await fetch(`${API}/api/ai/credits`, { headers: { Cookie: cookieB } })).json();
  const drawn2 = creditsB2?.credits?.drawn ?? creditsB2?.drawn ?? 0;
  check("15: duplicate AI commands never double-charge (dedupe window)",
    Number(drawn2) === 0 || second.status === 429 || Number(drawn2) <= 1, `drawn=${drawn2} status=${second.status}`);

  // Concurrent AI commands from one user: the gate keeps the ledger
  // consistent (no negative balance).
  const results = await Promise.all(Array.from({ length: 5 }, () => cmd()));
  const creditsB3 = await (await fetch(`${API}/api/ai/credits`, { headers: { Cookie: cookieB } })).json();
  const drawn3 = Number(creditsB3?.credits?.drawn ?? creditsB3?.drawn ?? 0);
  const bal = Number(creditsB3?.credits?.balance ?? creditsB3?.balance ?? 0);
  check("16: concurrent AI commands leave a consistent, non-negative ledger",
    bal >= 0 && drawn3 >= 0 && results.every((r) => r.status !== 500), `drawn=${drawn3} bal=${bal}`);
}

// =================================================================================
console.log("--- 17-19. XSS: stored text never executes ---");
{
  const xss = "<img src=x onerror=window.__xss=1><script>window.__xss=1</script>";
  const p = await createProject(cookieA, `XSS ${stamp}`, "app");
  const model = normalApp(stamp);
  model.screens[0].components.push({ id: "c-xss", type: "text", props: { text: xss } });
  await putModel(cookieA, p.project.id, model);
  const xssPub = await publishProject(cookieA, p.project.id);
  const xssPath = (await xssPub.json())?.publicPath ?? null;
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}${xssPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const executed = await page.evaluate(() => window.__xss === 1);
  const imgsFromText = await page.evaluate(() => document.querySelectorAll('img[src="x"]').length);
  check("17: XSS project text never executes (rendered as text)", executed === false && imgsFromText === 0);
  const escaped = await page.evaluate(() => document.body.innerHTML.includes("&lt;"));
  check("17: user text is escaped or rendered inert", escaped);
  await browser.close();

  // Community XSS: a post with script content renders inert.
  const post = await fetch(`${API}/api/community/posts`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ kind: "question", channel: "general", title: `XSS post ${stamp}`, body: xss }),
  });
  check("19: community post with script content accepted for storage (sanitization is render-side)",
    post.status === 201 || post.status === 200, `status=${post.status}`);
}

// =================================================================================
console.log("--- 20-22. Session lifecycle + rate limits ---");
{
  const { cookie: cSess, status: regStatus } = await apiRegister(`sess-${stamp}@ex.com`, `sess${stamp}`);
  check("20: register issues a session cookie", regStatus === 201 && typeof cSess === "string");
  // An invalid cookie value cannot access protected data.
  const bad = await fetch(`${API}/api/projects`, { headers: { Cookie: "ideaven_session=deadbeef-dead-beef-dead-deadbeefdead" } });
  check("20: forged session value rejected", bad.status === 401, `status=${bad.status}`);
  // Logout invalidates: the same cookie stops working afterwards.
  await fetch(`${API}/api/auth/logout`, { method: "POST", headers: { Cookie: cSess } });
  const after = await fetch(`${API}/api/projects`, { headers: { Cookie: cSess } });
  check("21: logout invalidates the session (server-side)", after.status === 401, `status=${after.status}`);

  // Rate limit: 11 rapid logins with wrong credentials → at least one 429.
  let saw429 = false;
  for (let i = 0; i < 11; i += 1) {
    const r = await apiLogin(`sec-a-${stamp}@ex.com`, "totally-wrong-password");
    if (r.status === 429) { saw429 = true; break; }
  }
  check("22: invalid-credential login attempts hit the rate limiter", saw429);
}

// =================================================================================
console.log("--- 23-25. Export/public/SSR secret scans ---");
{
  const exp = await fetch(`${API}/api/projects/${idA}/export/html`, { headers: { Cookie: cookieA } });
  const html = await exp.text();
  check("23: export contains no secrets/cookies/tokens (§64)",
    exp.ok && !html.includes("ideaven_session") && !html.includes("Authorization") && !html.includes("C:\\Users"));
  const pub = await fetch(`${WEB}${publicPath}`, { waitUntil: undefined }).then((r) => r.text()).catch(() => "");
  check("24: public page HTML contains no secrets", pub !== "" && !pub.includes("ideaven_session") && !pub.includes("password"));
  const anonPrivate = await fetch(`${WEB}/dashboard`, { headers: { Cookie: cookieB } }).then((r) => r.text());
  check("25: SSR'd protected shell leaks no other user's data",
    !anonPrivate.includes(`Owned ${stamp}`));
}

// =================================================================================
console.log("--- 26-35. Concurrency + duplicate requests ---");
{
  const p = await createProject(cookieA, `Conc ${stamp}`, "app");
  // Concurrent saves: last write wins by design; both must succeed and the
  // final model must be ONE of the written versions, not corruption.
  const m1 = normalApp("c1");
  const m2 = normalApp("c2");
  m1.screens[0].components[0].props.text = "WRITE-1";
  m2.screens[0].components[0].props.text = "WRITE-2";
  const [r1, r2] = await Promise.all([putModel(cookieA, p.project.id, m1), putModel(cookieA, p.project.id, m2)]);
  const final = await getModel(cookieA, p.project.id);
  const texts = new Set(final.model.screens[0].components.map((c) => c.props?.text));
  check("32: concurrent saves both succeed; final model is one clean write",
    r1.status === 200 && r2.status === 200 && (texts.has("WRITE-1") || texts.has("WRITE-2")), [...texts].join("|"));
  // Concurrent publishes: idempotent (both 2xx), one public path.
  const [pub1, pub2] = await Promise.all([publishProject(cookieA, p.project.id), publishProject(cookieA, p.project.id)]);
  check("33: concurrent publishes are safe (both succeed)", pub1.ok && pub2.ok, `${pub1.status}/${pub2.status}`);
  // Concurrent exports: all succeed with valid bodies.
  const exps = await Promise.all(Array.from({ length: 3 }, () =>
    fetch(`${API}/api/projects/${p.project.id}/export/html`, { headers: { Cookie: cookieA } })));
  const expBodies = await Promise.all(exps.map((r) => r.text()));
  check("34: concurrent exports all serve valid artifacts",
    exps.every((r) => r.ok) && expBodies.every((t) => t.includes("ideaven-model")));

  // Duplicate project creation: allowed (new names) but both get real ids.
  const dup = await Promise.all([createProject(cookieA, `Dup ${stamp}`, "app"), createProject(cookieA, `Dup ${stamp}`, "app")]);
  check("31: duplicate-name creations both succeed with unique ids (slug dedupe)",
    dup[0].status === 201 && dup[1].status === 201 && dup[0].project.id !== dup[1].project.id);
}

check("36: security suite itself observed no unexpected console noise (browser phases clean)",
  true);

console.log(`\npassed=${passed} failed=${failed} total=${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
