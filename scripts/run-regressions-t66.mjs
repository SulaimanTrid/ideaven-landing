// TASK 64 Â§47 regression sweep: every existing E2E suite must stay green
// after the extension-engine changes. Runs from the repo root with the
// vendored Playwright module; launch-audit receives a real admin session.
import { spawnSync } from "node:child_process";

const API = "http://127.0.0.1:8090";
const ROOT = "C:\\Users\\Jendela 10\\Downloads\\Projek IDEAVEN\\ideaven-v7\\ideaven-landing-v7";

const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "admin@ideaven.dev", password: "Ideaven3D!Admin2026" }),
});
if (!login.ok) {
  console.error(`admin login failed: ${login.status}`);
  process.exit(1);
}
const setCookie = login.headers.getSetCookie().find((c) => c.startsWith("ideaven_session="));
const session = setCookie.split(";")[0].split("=")[1];

const SUITES = [
  // Latest tasks first (fastest signal on the surfaces TASK 66 touched).
  "e2e-task66-runtime-parity.mjs",
  "e2e-task65-product-coherence.mjs",
  "e2e-task64-extension-engine.mjs",
  "e2e-task63-workspace-navigation.mjs",
  "e2e-task62-2d-engine-core.mjs",
  "e2e-task61-creation-visuals.mjs",
  "e2e-task60-3d-editor-core.mjs",
  "e2e-engine-launcher.mjs",
  "e2e-builder-shell-integrity.mjs",
  // 3D Ã—6
  "e2e-3d-foundation.mjs",
  "e2e-3d-hierarchy.mjs",
  "e2e-3d-physics.mjs",
  "e2e-3d-material-lighting.mjs",
  "e2e-3d-transform-gizmos.mjs",
  "e2e-3d-character-controller.mjs",
  // 2D Ã—10 (Â§48 list: asset-studio included; viewport-system extra coverage)
  "e2e-2d-lighting.mjs",
  "e2e-2d-particles.mjs",
  "e2e-input-actions.mjs",
  "e2e-scene-gameplay.mjs",
  "e2e-sorting.mjs",
  "e2e-sprite-animation.mjs",
  "e2e-tilemap-paint.mjs",
  "e2e-viewport-system.mjs",
  "e2e-camera.mjs",
  "e2e-animation-state-machine.mjs",
  "e2e-asset-studio.mjs",
  // UI Ã—4
  "e2e-motion.mjs",
  "e2e-i18n-audit.mjs",
  "e2e-launch-audit.mjs",
  "e2e-community.mjs",
];

let failed = 0;
const results = [];
for (const suite of SUITES) {
  const r = spawnSync(process.execPath, [`scripts/${suite}`], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 420000,
    env: {
      ...process.env,
      PLAYWRIGHT_MODULE: "../../tools/e2e-runner/node_modules/playwright/index.js",
      IV_COOKIE: session,
    },
  });
  const tail = (r.stdout ?? "").trim().split("\n").slice(-3).join("\n");
  const ok = r.status === 0;
  if (!ok) failed += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${suite}${ok ? "" : `\n${tail}\n${(r.stderr ?? "").slice(-400)}`}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${suite}`);
  if (!ok) console.log(tail);
}

console.log(`\nsuites: ${SUITES.length - failed}/${SUITES.length} passed`);
if (failed > 0) {
  console.log("failed suites:");
  for (const line of results.filter((x) => x.startsWith("FAIL"))) console.log(`  ${line.split("\n")[0]}`);
}
process.exit(failed > 0 ? 1 : 0);
