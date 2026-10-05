// TASK 67 §49: reusable test fixtures + API helpers. One module serves the
// three TASK 67 suites (security, performance, full-journey) — no giant
// project JSON duplicated across tests.

export const API = "http://localhost:8090";
export const WEB = "http://localhost:3000";

export async function apiRegister(email, username, password = "Correct-Horse-9") {
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("ideaven_session="))?.split(";")[0] ?? null;
  return { cookie, status: res.status };
}
export async function apiLogin(identifier, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("ideaven_session="))?.split(";")[0] ?? null;
  return { cookie, status: res.status };
}
export async function createProject(cookie, name, type) {
  const res = await fetch(`${API}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name, type }),
  });
  const body = await res.json();
  return { status: res.status, project: body.project ?? null, error: body.error ?? null };
}
export async function getModel(cookie, id) {
  const res = await fetch(`${API}/api/projects/${id}`, { headers: { Cookie: cookie } });
  return { status: res.status, model: (await res.json())?.project?.model ?? null };
}
export async function putModel(cookie, id, model) {
  return fetch(`${API}/api/projects/${id}/model`, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ model }),
  });
}
export async function publishProject(cookie, id) {
  return fetch(`${API}/api/projects/${id}/publish`, { method: "POST", headers: { Cookie: cookie } });
}
export function publicKey(path) {
  return `${WEB}${path}`;
}

// ---- canonical model fixtures ----------------------------------------------------

function baseModel(type, screenName) {
  const screen = { id: "screen-home", name: screenName, components: [] };
  return {
    schemaVersion: 1,
    type,
    screens: [screen],
    navigation: { startScreenId: "screen-home" },
    variables: [],
    assets: [],
    settings: {},
  };
}

/** An app with a real text, an input, and a button navigating to screen B. */
export function normalApp(suffix = "x") {
  const model = baseModel("app", "Home");
  const b = { id: `screen-b-${suffix}`, name: "Details", components: [], styles: {} };
  model.screens.push(b);
  model.screens[0].components.push(
    { id: "c-title", type: "text", props: { text: "Fixture Home" } },
    { id: "c-input", type: "text-input", props: { placeholder: "fixture", value: "" } },
    { id: "c-go", type: "button", props: { label: "Go" } },
  );
  model.screens[0].logic = {
    handlers: [{
      id: `h-go-${suffix}`, componentId: "c-go", event: "click",
      body: [{ id: `b-nav-${suffix}`, kind: "statement", type: "navigate", inputs: { screenId: b.id } }],
    }],
  };
  b.components.push({ id: "c-detail", type: "text", props: { text: "Details screen" } });
  return model;
}

/** A populated 2D scene: playable player, ground, coin, tilemap, camera. */
export function populated2D() {
  const model = baseModel("game", "Scene 1");
  model.screens[0].components.push(
    { id: "e-player", type: "player", props: { name: "Player", x: 60, y: 200, width: 36, height: 36, color: "#46e3b4", visible: true, collider: true } },
    { id: "e-platform", type: "platform", props: { name: "Ground", x: 0, y: 420, width: 390, height: 40, color: "#2a3348", visible: true, collider: true } },
    { id: "e-coin", type: "coin", props: { name: "Coin", x: 220, y: 380, width: 28, height: 28, color: "#ffd970", visible: true, trigger: true } },
    { id: "e-tiles", type: "tilemap", props: { name: "Terrain", x: 0, y: 700, width: 320, height: 96, cellSize: 32, cols: 10, rows: 3, tiles: "0,0:1;1,0:1;2,0:1", palette: "1:#2a3348;2:#46e3b4:pass", visible: true, collider: true } },
    { id: "e-cam", type: "camera", props: { name: "Camera", followEnabled: true, followTarget: "e-player", x: 0, y: 0, width: 390, height: 844 } },
  );
  model.screens[0].inputActions = [
    { id: "move-left", name: "Move left", keys: ["arrowleft", "a"], enabled: true },
    { id: "move-right", name: "Move right", keys: ["arrowright", "d"], enabled: true },
    { id: "jump", name: "Jump", keys: ["arrowup", "w", " "], enabled: true },
  ];
  return model;
}

/** A populated 3D scene: static floor, dynamic cube, light, camera. */
export function populated3D() {
  const model = baseModel("3d", "World");
  model.screens[0].components.push(
    { id: "o-floor", type: "plane3d", props: { name: "Floor", px: 0, py: 0, pz: 0, sx: 8, sz: 8, color: "#33415c", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 8, colliderSizeZ: 8 } },
    { id: "o-cube", type: "cube3d", props: { name: "Crate", px: 0, py: 2.5, pz: 0, color: "#8f7bff", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 0.5, colliderSizeY: 0.5, colliderSizeZ: 0.5, mass: 1 } },
    { id: "o-light", type: "light3d", props: { name: "Sun", px: 2, py: 4, pz: 2, color: "#ffd9a0", intensity: 1.2, radius: 14, enabled: true } },
    { id: "o-cam", type: "camera3d", props: { name: "Cam", px: 0, py: 3.2, pz: 7, rx: -24, fov: 60, active: true } },
  );
  return model;
}

/** An app referencing an asset ID that does not exist. */
export function missingAssetApp() {
  const model = baseModel("app", "Home");
  model.screens[0].components.push(
    { id: "c-img", type: "image", props: { src: "asset:00000000-0000-0000-0000-000000000000", alt: "missing" } },
  );
  return model;
}

/** A project with `count` text components (performance fixture). */
export function manyComponentsApp(count) {
  const model = baseModel("app", "Home");
  for (let i = 0; i < count; i += 1) {
    model.screens[0].components.push({ id: `c-text-${i}`, type: "text", props: { text: `Item ${i}` } });
  }
  return model;
}

/** A 2D scene with `count` entities (performance fixture). */
export function manyEntities2D(count) {
  const model = baseModel("game", "Scene 1");
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i += 1) {
    model.screens[0].components.push({
      id: `e-coin-${i}`, type: "coin",
      props: { name: `Coin ${i}`, x: 20 + (i % cols) * 40, y: 20 + Math.floor(i / cols) * 40, width: 28, height: 28, color: "#ffd970", visible: true, trigger: true },
    });
  }
  return model;
}

/** A 3D scene with `count` dynamic cubes (performance fixture). */
export function manyEntities3D(count) {
  const model = baseModel("3d", "World");
  model.screens[0].components.push(
    { id: "o-floor", type: "plane3d", props: { name: "Floor", px: 0, py: 0, pz: 0, sx: 40, sz: 40, color: "#33415c", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 40, colliderSizeZ: 40 } },
  );
  const side = Math.ceil(Math.cbrt(count));
  for (let i = 0; i < count; i += 1) {
    const gx = i % side, gy = Math.floor(i / (side * side)), gz = Math.floor(i / side) % side;
    model.screens[0].components.push({
      id: `o-cube-${i}`, type: "cube3d",
      props: { name: `Crate ${i}`, px: gx * 1.2 - 4, py: 3 + gy * 1.2, pz: gz * 1.2 - 4, color: "#8f7bff", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 0.5, colliderSizeY: 0.5, colliderSizeZ: 0.5, mass: 1 },
    });
  }
  return model;
}

/** A structurally invalid model (unknown schema version). */
export function malformedModel() {
  const model = baseModel("app", "Home");
  model.schemaVersion = 99;
  return model;
}
