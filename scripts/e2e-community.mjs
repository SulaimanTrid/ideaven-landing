// TASK 07 community E2E — real user flows against the live two-server setup
// (API :8090, web :3000). Run:
//   PLAYWRIGHT_MODULE=/tmp/iv-pw/node_modules/playwright/index.mjs node /tmp/iv-e2e-community.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const API = "http://localhost:8090";
const WEB = "http://localhost:3000";
const errors = [];

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
}

async function apiRegister(email, username) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password: "Correct-Horse-9" }),
  });
  if (![200, 201].includes(res.status)) throw new Error(`register ${username}: ${res.status}`);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("ideaven_session="));
  return cookie.split(";")[0];
}

async function apiCreateProject(cookie, name, type) {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, type }),
  });
  const data = await res.json();
  if (res.status !== 201) throw new Error(`create project: ${res.status} ${JSON.stringify(data)}`);
  return data.project;
}

async function apiPublish(cookie, id) {
  const res = await fetch(`${API}/api/projects/${id}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: "{}",
  });
  if (res.status !== 200) throw new Error(`publish: ${res.status}`);
}

async function contextWithSession(browser, cookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: "ideaven_session", value: cookie.split("=")[1], domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}

const browser = await chromium.launch();

const stamp = Date.now().toString(36);
const cookieA = await apiRegister(`maya-${stamp}@example.com`, `mayacomm${stamp}`);
const cookieB = await apiRegister(`leo-${stamp}@example.com`, `leocomm${stamp}`);
const project = await apiCreateProject(cookieA, "Community E2E Runner", "game");
await apiPublish(cookieA, project.id);
const slug = project.slug;
console.log(`seeded project slug: ${slug}`);

// ---- 1. anonymous home: three columns, honest empty state ------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`home: ${e.message}`));
  page.on("console", (m) => {
    // The session probe /api/auth/me answers 401 for anonymous visitors by
    // design; that resource log is pre-existing on every public page.
    if (m.type() === "error" && !m.text().includes("401")) errors.push(`home console: ${m.text()}`);
  });
  await page.goto(`${WEB}/community`, { waitUntil: "networkidle" });

  check("home renders heading", await page.getByText("Create. Share. Ask. Build together.").count() > 0);
  check("left sidebar has Questions nav", await page.getByRole("button", { name: "Questions" }).count() > 0);
  check("left sidebar lists channels", await page.getByRole("button", { name: "# Game Dev" }).count() > 0);

  const emptyState = await page.waitForSelector("text=Nothing here yet", { timeout: 10000 }).catch(() => null);
  const feedHasCards = (await page.locator("article").count()) > 0;
  check("feed renders honest state (empty note or real posts)", emptyState !== null || feedHasCards);

  const freshCard = await page.waitForSelector("text=Community E2E Runner", { timeout: 10000 }).catch(() => null);
  check("published project card appears in Fresh projects", freshCard !== null);

  await page.waitForSelector("aside img", { timeout: 10000 }).catch(() => null);
  const thumbLoaded = await page.evaluate(() => {
    const img = document.querySelector("aside img");
    return img ? img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 : false;
  });
  check("project thumbnail SVG actually loads", thumbLoaded);

  await page.goto(`${WEB}/explore`, { waitUntil: "networkidle" });
  await page.waitForSelector("img", { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(800);
  const exploreThumb = await page.evaluate(() => {
    const img = document.querySelector("img");
    return img ? img.complete && img.naturalWidth > 0 : false;
  });
  check("explore cards render real thumbnails", exploreThumb);
  await context.close();
}

// ---- 2. maya asks a question ------------------------------------------------
{
  const context = await contextWithSession(browser, cookieA);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`ask: ${e.message}`));
  await page.goto(`${WEB}/community/ask`, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /Question/ }).click();
  await page.selectOption("#channel", "help");
  await page.fill("#title", "How do I make a score system?");
  await page.fill("#body", "I want the score to go up when the player taps a coin. Which blocks do I need?");
  await page.fill("#tags", "blocks, game-dev");
  await page.selectOption("#project", slug);
  await page.getByRole("button", { name: "Post question" }).click();
  await page.waitForURL(/\/community\/post\//, { timeout: 15000 });

  check("ask form redirects to post page", /\/community\/post\//.test(page.url()));
  check("post shows title", await page.getByText("How do I make a score system?").count() > 0);
  check("post embeds the project card", await page.getByText("Community E2E Runner").count() > 0);
  check("post has tags", await page.getByText("#blocks").count() > 0);
  globalThis.questionUrl = page.url();
  await context.close();
}

// ---- 3. leo answers, upvotes; maya accepts ----------------------------------
{
  const context = await contextWithSession(browser, cookieB);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`answer: ${e.message}`));
  await page.goto(globalThis.questionUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Upvote" }).first().click();
  const voted = await page.waitForSelector("button[aria-label='Remove upvote']", { timeout: 8000 }).catch(() => null);
  check("post upvote registers", voted !== null);

  await page.fill("[aria-label='Write an answer']", "Use the change-variable block with score by 1 inside the coin tap handler.");
  await page.getByRole("button", { name: "Post answer" }).click();
  await page.waitForSelector("text=change-variable block", { timeout: 8000 }).catch(() => null);
  check("answer appears", await page.getByText("change-variable block", { exact: false }).count() > 0);
  check("1 answer count", await page.getByText("1 answer", { exact: true }).count() > 0);

  await page.getByRole("button", { name: "Upvote" }).nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll("button[aria-label='Remove upvote']").length === 2, undefined, { timeout: 8000 }).catch(() => undefined);
  const votes = await page.locator("button[aria-label='Remove upvote']").count();
  check("answer upvote registers (2 voted targets)", votes === 2, `count=${votes}`);
  await context.close();
}

{
  const context = await contextWithSession(browser, cookieA);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`accept: ${e.message}`));
  await page.goto(globalThis.questionUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const acceptBtn = await page.waitForSelector("button:has-text('Accept answer')", { timeout: 10000 }).catch(() => null);
  check("author sees Accept answer control", acceptBtn !== null);
  if (acceptBtn) {
    await acceptBtn.click();
    const badge = await page.waitForSelector("text=Accepted answer", { timeout: 8000 }).catch(() => null);
    check("accepted badge appears", badge !== null);
  }
  check("author sees delete control", await page.getByRole("button", { name: "Delete post" }).count() > 0);
  await context.close();
}

// ---- 4. feed mechanics: search, sort, unanswered, channel -------------------
{
  const context = await contextWithSession(browser, cookieB);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`feed: ${e.message}`));
  await page.goto(`${WEB}/community`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.getByLabel("Search the community").fill("score");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const found = await page.waitForSelector("text=How do I make a score system?", { timeout: 10000 }).catch(() => null);
  check("search finds the question", found !== null);

  await page.getByRole("button", { name: "Unanswered" }).first().click();
  const empty = await page.waitForSelector("text=Nothing here yet", { timeout: 10000 }).catch(() => null);
  check("unanswered filter excludes accepted question", empty !== null);

  await page.getByRole("button", { name: "# Game Dev" }).first().click();
  await page.waitForSelector("text=Nothing here yet", { timeout: 10000 }).catch(() => null);
  check("game-dev channel excludes help question", await page.getByText("Nothing here yet").count() > 0);

  await page.locator("aside").getByRole("button", { name: /^Questions/ }).click();
  const q = await page.waitForSelector("text=How do I make a score system?", { timeout: 10000 }).catch(() => null);
  check("questions view shows the post", q !== null);
  check("Answered badge shows", await page.getByText("Answered").count() > 0);

  const leoCard = await page.waitForSelector(`aside >> text=leocomm${stamp}`, { timeout: 10000 }).catch(() => null);
  check("helpful creators lists leo", leoCard !== null);
  check("trending tags show game-dev", await page.locator("aside").getByText("#game-dev").count() > 0);
  await context.close();
}

// ---- 5. remix from the community post page ----------------------------------
{
  const context = await contextWithSession(browser, cookieB);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`remix: ${e.message}`));
  await page.goto(globalThis.questionUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Remix", exact: true }).click();
  await page.waitForURL(/\/builder\//, { timeout: 20000 });
  check("remix lands in the builder", /\/builder\/[0-9a-f-]{36}/.test(page.url()));
  await context.close();
}

// ---- 6. p/[slug] discussions section ---------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`ppage: ${e.message}`));
  await page.goto(`${WEB}/p/${slug}`, { waitUntil: "networkidle" });
  const section = await page.waitForSelector("text=Discussions (1)", { timeout: 10000 }).catch(() => null);
  check("public page shows Discussions (1)", section !== null);
  const link = await page.waitForSelector("text=How do I make a score system?", { timeout: 10000 }).catch(() => null);
  check("discussion links back to community", link !== null);
  await context.close();
}

// ---- 7. mobile 390px: feed-first, no horizontal overflow -------------------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`mobile: ${e.message}`));
  await page.goto(`${WEB}/community`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile: no horizontal overflow", overflow <= 0, `overflow=${overflow}px`);
  check("mobile: channel chips visible", await page.getByRole("button", { name: "# Showcase" }).count() > 0);
  await context.close();
}

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (errors.length) {
  console.log("\nConsole/page errors:");
  for (const e of errors) console.log(`  ${e}`);
}
process.exit(failed || errors.length ? 1 : 0);
