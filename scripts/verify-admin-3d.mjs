// Verifies the admin login + the 3D Playground demo render with live physics.
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 160)));

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// Discover the login form fields by type.
const inputs = await page.evaluate(() =>
  [...document.querySelectorAll("input")].map((i) => ({ type: i.type, name: i.name, id: i.id, label: i.labels?.[0]?.textContent?.trim() ?? "" })),
);
console.log("login inputs:", JSON.stringify(inputs));

const userInput = page.locator("input[type='text'], input:not([type='password']):not([type='email'])").first();
await userInput.fill("admin");
await page.locator("input[type='password']").first().fill("Ideaven3D!Admin2026");
await page.getByRole("button", { name: /log in|sign in|masuk/i }).first().click();
await page.waitForTimeout(4000);
console.log("after login url:", page.url());

await page.goto("http://localhost:3000/builder/39156b66-e05d-4682-88b8-875764c44ae6", { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const state = await page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  return {
    identity: document.querySelector("[data-engine-identity]")?.textContent ?? null,
    canvas3d: document.querySelectorAll("canvas[data-viewport-3d]").length,
    bodies: canvas?.getAttribute("data-physics-bodies")?.slice(0, 200) ?? null,
    grounded: canvas?.getAttribute("data-physics-grounded") ?? null,
  };
});
console.log("builder state:", JSON.stringify(state, null, 1));
await page.screenshot({ path: "scripts/3d-playground-check.png", fullPage: false });
console.log("screenshot saved: scripts/3d-playground-check.png");
await browser.close();
