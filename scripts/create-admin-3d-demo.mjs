// Creates an admin-owned, ready-to-play 3D demo project: ground, controllable
// player (character controller + gravity), walls, decorative cubes, light, camera.
const API = "http://localhost:8090";

const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "admin", password: "Ideaven3D!Admin2026" }),
});
if (!login.ok) {
  console.log("LOGIN_FAILED", login.status);
  process.exit(1);
}
const cookie = login.headers.getSetCookie().find((c) => c.startsWith("ideaven_session=")).split(";")[0];

const create = await fetch(`${API}/api/projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ name: "3D Playground", type: "3d", description: "Walk with WASD, jump with Space." }),
});
const { project } = await create.json();

const model = (await (await fetch(`${API}/api/projects/${project.id}`, { headers: { Cookie: cookie } })).json()).project.model;
const scene = model.screens[0];
scene.styles = { ...scene.styles, ambientIntensity: 0.35, gravityY: -14 };
scene.components.push(
  // Ground
  { id: "g-ground", type: "plane3d", props: { name: "Ground", px: 0, py: -0.5, pz: 0, rx: 0, ry: 0, rz: 0, sx: 16, sy: 1, sz: 16, color: "#2a3348", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  // Player: character controller on
  { id: "g-player", type: "cube3d", props: { name: "Player", px: 0, py: 1.5, pz: 3, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: "#58c7f0", visible: true, bodyType: "dynamic", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1, gravityEnabled: true, controllerEnabled: true, moveSpeed: 6, acceleration: 60, deceleration: 80, jumpForce: 8, airControl: 0.5 } },
  // Decorative + platform cubes
  { id: "g-cube1", type: "cube3d", props: { name: "Red Cube", px: -2.5, py: 0.5, pz: -1, sx: 1, sy: 1, sz: 1, color: "#ff7d9c", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  { id: "g-cube2", type: "cube3d", props: { name: "Gold Cube", px: 2.5, py: 0.5, pz: -1, sx: 1, sy: 1, sz: 1, color: "#f0b429", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  { id: "g-plat", type: "cube3d", props: { name: "Platform", px: 0, py: 1, pz: -2.5, sx: 3, sy: 0.5, sz: 2, color: "#8f7bff", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  // Walls so the player can't roll off
  { id: "g-wall1", type: "cube3d", props: { name: "Wall North", px: 0, py: 1, pz: -6.5, sx: 16, sy: 3, sz: 1, color: "#1a2130", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  { id: "g-wall2", type: "cube3d", props: { name: "Wall South", px: 0, py: 1, pz: 6.5, sx: 16, sy: 3, sz: 1, color: "#1a2130", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  { id: "g-wall3", type: "cube3d", props: { name: "Wall West", px: -6.5, py: 1, pz: 0, sx: 1, sy: 3, sz: 16, color: "#1a2130", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  { id: "g-wall4", type: "cube3d", props: { name: "Wall East", px: 6.5, py: 1, pz: 0, sx: 1, sy: 3, sz: 16, color: "#1a2130", visible: true, bodyType: "static", colliderType: "box", colliderSizeX: 1, colliderSizeY: 1, colliderSizeZ: 1 } },
  // Lights + camera
  { id: "g-light", type: "light3d", props: { name: "Sun", px: 4, py: 6, pz: 4, rx: -50, ry: 30, rz: 0, type: "point", enabled: true, color: "#ffd9a0", intensity: 2.5, radius: 40, visible: true } },
  { id: "g-cam", type: "camera3d", props: { name: "Camera", px: 0, py: 5, pz: 11, rx: -22, ry: 0, rz: 0, fov: 55, near: 0.1, far: 2000, active: true, visible: true } },
);
await fetch(`${API}/api/projects/${project.id}/model`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ model }),
});
console.log(`OK ${project.id} slug=${project.slug}`);
