// Verifies the admin 3D Playground: editor view + Preview with live physics
// (player lands, grounded, WASD moves). Saves screenshots as evidence.
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const chromium = pw.chromium ?? pw.default?.chromium;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 160)));

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.locator("input[type='text'], input:not([type='password'])").first().fill("admin");
await page.locator("input[type='password']").first().fill("Ideaven3D!Admin2026");
await page.getByRole("button", { name: /log in|sign in|masuk/i }).first().click();
await page.waitForTimeout(3500);

// Editor view screenshot.
await page.goto("http://localhost:3000/builder/39156b66-e05d-4682-88b8-875764c44ae6", { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
console.log("editor identity:", await page.evaluate(() => document.querySelector("[data-engine-identity]")?.textContent));
await page.screenshot({ path: "scripts/evidence-editor-3d.png" });

// Preview: physics + controller live.
await page.getByRole("button", { name: "Preview", exact: true }).first().click();
await page.waitForTimeout(3000); // fall + land
const landed = await page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  return {
    grounded: canvas?.getAttribute("data-physics-grounded"),
    bodies: canvas ? JSON.parse(canvas.getAttribute("data-physics-bodies")) : null,
    speed: canvas?.getAttribute("data-controller-speed"),
  };
});
console.log("preview landed:", JSON.stringify(landed.bodies?.find((b) => b.id === "g-player")));
console.log("grounded:", landed.grounded);

// WASD movement evidence.
await page.keyboard.down("w");
await sleep(900);
const during = await page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  return { speed: canvas?.getAttribute("data-controller-speed"), bodies: JSON.parse(canvas.getAttribute("data-physics-bodies")).find((b) => b.id === "g-player") };
});
await page.keyboard.up("w");
await sleep(800);
const rest = await page.evaluate(() => {
  const canvas = document.querySelector("canvas[data-viewport-3d]");
  return { speed: canvas?.getAttribute("data-controller-speed"), z: JSON.parse(canvas.getAttribute("data-physics-bodies")).find((b) => b.id === "g-player").z };
});
console.log("movement: speed", during.speed, "z", during.bodies.z, "-> rest speed", rest.speed, "z", rest.z);

// Jump evidence.
await page.keyboard.press("Space");
let maxY = 0.5;
for (let i = 0; i < 25; i++) {
  await sleep(60);
  const y = await page.evaluate(() => JSON.parse(document.querySelector("canvas[data-viewport-3d]").getAttribute("data-physics-bodies")).find((b) => b.id === "g-player").y);
  if (y > maxY) maxY = y;
}
console.log("jump apex y:", maxY.toFixed(2), "(ground 0.5, expected rise >1)");
await page.screenshot({ path: "scripts/evidence-preview-3d.png" });
await browser.close();
console.log("done");
