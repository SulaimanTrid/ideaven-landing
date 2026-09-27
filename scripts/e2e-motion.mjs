// Motion foundation E2E (docs/DESIGN.md §Motion): the ONE motion system must
// actually reach the browser — token-driven durations/easings on the shared
// Button primitive, real press compression, entrance-reveal tokens, and the
// prefers-reduced-motion guard collapsing everything gracefully.
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const WEB = "http://localhost:3000";
const errors = [];
let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
};
// The suite navigates to a deliberate 404 page; the browser logs that as a
// failed resource. It is the expected result, not a product error.
const isExpectedNoise = (text) => text.includes("401") || text.includes("404");

const browser = await chromium.launch();

// ---- 1. Normal motion: tokens drive the shared Button -------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !isExpectedNoise(m.text())) errors.push(`console: ${m.text()}`); });

  // Any unknown URL renders the app 404, which carries the shared ButtonLink.
  await page.goto(`${WEB}/no-such-page`, { waitUntil: "networkidle" });
  const button = page.locator("a.bg-violet-deep").first();
  check("shared primary Button renders on a public page", (await button.count()) >= 1);

  const styles = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      properties: s.transitionProperty,
      durations: s.transitionDuration,
      timings: s.transitionTimingFunction,
      transform: s.transform,
    };
  });
  check("button transitions colors AND transform (press owns one list)",
    styles.properties.includes("background-color") && styles.properties.includes("transform"),
    `${styles.properties}`);
  check("hover duration is the quick token (160ms)",
    styles.durations.split(",").some((d) => d.trim() === "0.16s"), styles.durations);
  check("press duration is the micro token (90ms)",
    styles.durations.split(",").some((d) => d.trim() === "0.09s"), styles.durations);
  check("easings come from the house tokens (enter / press curves)",
    styles.timings.includes("cubic-bezier(0.22, 1, 0.36, 1)") &&
    styles.timings.includes("cubic-bezier(0.2, 0, 0, 1)"), styles.timings);

  // Real press: compression engages while held, releases cleanly. Under load
  // the 90ms transition may lag, so wait for the pressed transform (bounded).
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let pressed = "none";
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector("a.bg-violet-deep");
        return el && getComputedStyle(el).transform.includes("0.97");
      },
      { timeout: 2000 },
    );
    pressed = await button.evaluate((el) => getComputedStyle(el).transform);
  } catch {
    pressed = await button.evaluate((el) => getComputedStyle(el).transform);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const released = await button.evaluate((el) => getComputedStyle(el).transform);
  check("press compresses to scale(0.97) while held",
    pressed.includes("0.97"), pressed);
  check("release restores the resting transform", released === "none" || released.includes("matrix(1"), released);

  // Entrance reveals carry the emphasis token on the landing page.
  await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const reveal = await page.locator("[data-reveal]").first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { duration: s.transitionDuration, easing: s.transitionTimingFunction, opacity: s.opacity };
  });
  check("entrance reveals use the emphasis token (700ms enter curve)",
    reveal.duration.split(",").every((d) => d.trim() === "0.7s") &&
    reveal.easing.includes("cubic-bezier(0.22, 1, 0.36, 1)"),
    `duration=${reveal.duration} easing=${reveal.easing}`);
  check("revealed content is actually visible", reveal.opacity === "1", `opacity=${reveal.opacity}`);
  await context.close();
}

// ---- 2. Reduced motion: the guard collapses transitions gracefully -----------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !isExpectedNoise(m.text())) errors.push(`console: ${m.text()}`); });

  await page.goto(`${WEB}/no-such-page`, { waitUntil: "networkidle" });
  const button = page.locator("a.bg-violet-deep").first();
  const durations = await button.evaluate((el) => getComputedStyle(el).transitionDuration);
  check("prefers-reduced-motion collapses button transitions (~0ms)",
    durations.split(",").every((d) => parseFloat(d) <= 0.001), durations);

  await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const revealOpacity = await page.locator("[data-reveal]").first().evaluate((el) => getComputedStyle(el).opacity);
  check("reveals show content immediately under reduced motion", revealOpacity === "1", `opacity=${revealOpacity}`);
  await context.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${errors.length} console errors` : ""}`);
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
