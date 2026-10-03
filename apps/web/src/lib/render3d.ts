/**
 * 3D renderer foundation (TASK 51): a small software 3D renderer on Canvas 2D.
 *
 * Decision (docs/TASK51_3D_FOUNDATION.md): no 3D library dependency — the
 * foundation's primitives (cube/sphere/plane) are exactly what a software
 * renderer handles, it keeps preview/published/export perfectly aligned (the
 * export runtime is inline vanilla JS mirrored from this file), and it adds
 * zero bundle weight to every exported game.
 *
 * This is REAL 3D: full perspective camera transform (position/rotation/FOV/
 * near/far), per-face backface culling, and painter's-algorithm depth sorting
 * — nearer geometry genuinely occludes farther geometry. It is not CSS 3D,
 * not a fake perspective, and not a pre-rendered image.
 *
 * TASK 55: real per-face lighting INSIDE the rasterizer — ambient + bounded
 * point/directional lights, geometric face normals, N·L diffuse, distance
 * attenuation. No DOM overlay, no post pass: the visible mesh pixels
 * themselves are lit. With no lights and default ambient (white × 1) the
 * output is pixel-identical to the pre-lighting renderer.
 *
 * Pure functions: (camera, meshes, canvas size) → draw calls. No state.
 */

export type Geometry3D = "cube" | "sphere" | "plane";

export interface Mesh3D {
  id: string;
  kind: Geometry3D;
  color: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number]; // degrees
  scale: [number, number, number];
  /** TASK 53: optional WORLD transform matrix (column-major 4×4) derived by
   * the hierarchy evaluation. When present it replaces the local
   * position/rotation/scale in meshFaces — the renderer never mutates it. */
  matrix?: number[];
}

// ---- mat4 (column-major, only what the renderer + hierarchy need) --------------

export function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat4Multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Composes a TRS matrix: translate(position) · rotateXYZ(degrees) · scale. */
export function mat4ComposeTRS(
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number],
): number[] {
  const rx = rotation[0] * DEG, ry = rotation[1] * DEG, rz = rotation[2] * DEG;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // Rotation = Ry(ry) · Rx(rx) · Rz(rz) (matches the legacy vertex order).
  const r00 = cy * cz + sy * sx * sz;
  const r01 = -cy * sz + sy * sx * cz;
  const r02 = sy * cx;
  const r10 = cx * sz;
  const r11 = cx * cz;
  const r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz;
  const r21 = sy * sz + cy * sx * cz;
  const r22 = cy * cx;
  return [
    r00 * scale[0], r10 * scale[0], r20 * scale[0], 0,
    r01 * scale[1], r11 * scale[1], r21 * scale[1], 0,
    r02 * scale[2], r12 * scale[2], r22 * scale[2], 0,
    position[0], position[1], position[2], 1,
  ];
}

/** Transforms a point by a 4×4 matrix (w = 1). */
export function mat4TransformPoint(m: number[], p: [number, number, number]): [number, number, number] {
  return [
    (m[0] ?? 0) * p[0] + (m[4] ?? 0) * p[1] + (m[8] ?? 0) * p[2] + (m[12] ?? 0),
    (m[1] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[9] ?? 0) * p[2] + (m[13] ?? 0),
    (m[2] ?? 0) * p[0] + (m[6] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[14] ?? 0),
  ];
}

/** General 4×4 inverse (TASK 56: world → local conversion for parented
 * gizmo edits). Returns null for singular matrices — callers must handle
 * that (cancel the transform, keep the previous values). */
export function mat4Invert(m: number[]): number[] | null {
  const inv = new Array<number>(16).fill(0);
  const a = m.map((v) => (Number.isFinite(v) ? v : 0));
  inv[0] = a[5]! * a[10]! * a[15]! - a[5]! * a[11]! * a[14]! - a[9]! * a[6]! * a[15]! + a[9]! * a[7]! * a[14]! + a[13]! * a[6]! * a[11]! - a[13]! * a[7]! * a[10]!;
  inv[4] = -a[4]! * a[10]! * a[15]! + a[4]! * a[11]! * a[14]! + a[8]! * a[6]! * a[15]! - a[8]! * a[7]! * a[14]! - a[12]! * a[6]! * a[11]! + a[12]! * a[7]! * a[10]!;
  inv[8] = a[4]! * a[9]! * a[15]! - a[4]! * a[11]! * a[13]! - a[8]! * a[5]! * a[15]! + a[8]! * a[7]! * a[13]! + a[12]! * a[5]! * a[11]! - a[12]! * a[7]! * a[9]!;
  inv[12] = -a[4]! * a[9]! * a[14]! + a[4]! * a[10]! * a[13]! + a[8]! * a[5]! * a[14]! - a[8]! * a[6]! * a[13]! - a[12]! * a[5]! * a[10]! + a[12]! * a[6]! * a[9]!;
  inv[1] = -a[1]! * a[10]! * a[15]! + a[1]! * a[11]! * a[14]! + a[9]! * a[2]! * a[15]! - a[9]! * a[3]! * a[14]! - a[13]! * a[2]! * a[11]! + a[13]! * a[3]! * a[10]!;
  inv[5] = a[0]! * a[10]! * a[15]! - a[0]! * a[11]! * a[14]! - a[8]! * a[2]! * a[15]! + a[8]! * a[3]! * a[14]! + a[12]! * a[2]! * a[11]! - a[12]! * a[3]! * a[10]!;
  inv[9] = -a[0]! * a[9]! * a[15]! + a[0]! * a[11]! * a[13]! + a[8]! * a[1]! * a[15]! - a[8]! * a[3]! * a[13]! - a[12]! * a[1]! * a[11]! + a[12]! * a[3]! * a[9]!;
  inv[13] = a[0]! * a[9]! * a[14]! - a[0]! * a[10]! * a[13]! - a[8]! * a[1]! * a[14]! + a[8]! * a[2]! * a[13]! + a[12]! * a[1]! * a[10]! - a[12]! * a[2]! * a[9]!;
  inv[2] = a[1]! * a[6]! * a[15]! - a[1]! * a[7]! * a[14]! - a[5]! * a[2]! * a[15]! + a[5]! * a[3]! * a[14]! + a[13]! * a[2]! * a[7]! - a[13]! * a[3]! * a[6]!;
  inv[6] = -a[0]! * a[6]! * a[15]! + a[0]! * a[7]! * a[14]! + a[4]! * a[2]! * a[15]! - a[4]! * a[3]! * a[14]! - a[12]! * a[2]! * a[7]! + a[12]! * a[3]! * a[6]!;
  inv[10] = a[0]! * a[5]! * a[15]! - a[0]! * a[7]! * a[13]! - a[4]! * a[1]! * a[15]! + a[4]! * a[3]! * a[13]! + a[12]! * a[1]! * a[7]! - a[12]! * a[3]! * a[5]!;
  inv[14] = -a[0]! * a[5]! * a[14]! + a[0]! * a[6]! * a[13]! + a[4]! * a[1]! * a[14]! - a[4]! * a[2]! * a[13]! - a[12]! * a[1]! * a[6]! + a[12]! * a[2]! * a[5]!;
  inv[3] = -a[1]! * a[6]! * a[11]! + a[1]! * a[7]! * a[10]! + a[5]! * a[2]! * a[11]! - a[5]! * a[3]! * a[10]! - a[9]! * a[2]! * a[7]! + a[9]! * a[3]! * a[6]!;
  inv[7] = a[0]! * a[6]! * a[11]! - a[0]! * a[7]! * a[10]! - a[4]! * a[2]! * a[11]! + a[4]! * a[3]! * a[10]! + a[8]! * a[2]! * a[7]! - a[8]! * a[3]! * a[6]!;
  inv[11] = -a[0]! * a[5]! * a[11]! + a[0]! * a[7]! * a[9]! + a[4]! * a[1]! * a[11]! - a[4]! * a[3]! * a[9]! - a[8]! * a[1]! * a[7]! + a[8]! * a[3]! * a[5]!;
  inv[15] = a[0]! * a[5]! * a[10]! - a[0]! * a[6]! * a[9]! - a[4]! * a[1]! * a[10]! + a[4]! * a[2]! * a[9]! + a[8]! * a[1]! * a[6]! - a[8]! * a[2]! * a[5]!;
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const out = inv.map((v) => v / det);
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

export interface Camera3DState {
  position: [number, number, number];
  rotation: [number, number, number]; // degrees, lookAt-style applied as yaw/pitch/roll
  fov: number; // vertical degrees, 20–120
  near: number;
  far: number;
}

export interface Face3D {
  /** World-space vertices (3 or 4 per face). */
  points: [number, number, number][];
  color: string;
  /** Mesh id the face belongs to (selection highlight). */
  meshId: string;
}

// ---- TASK 55: material + lighting inside the rasterizer ----------------------

/** A resolved world-space light (parsed + hierarchy-resolved by lights3d.ts,
 * mirrored by the export runtime). Renderer input only — never authored. */
export interface Light3DWorld {
  type: "point" | "directional";
  enabled: boolean;
  /** Validated hex color. */
  color: string;
  /** 0–5. */
  intensity: number;
  /** Point attenuation range in world units. */
  radius: number;
  /** World-space position (point) or origin (directional). */
  position: [number, number, number];
  /** Normalized emission direction (directional). */
  direction: [number, number, number];
}

/** Scene ambient — scene-style derived (3D defaults: white × 1). */
export interface Ambient3D {
  r: number;
  g: number;
  b: number;
  intensity: number;
}

/** MAX_LIGHTS is the hard rasterizer bound; lights3d.ts enforces the same
 * cap at resolution time. Unbounded light loops can never happen. */
export const MAX_LIGHTS = 8;

/** Parses "#rgb"/"#rrggbb" to 0–1 channels; null when invalid. */
function hexToRgb01(hex: string): [number, number, number] | null {
  const h = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);

/**
 * TASK 55 shading: baseColor × clamp01(ambient + Σ light contributions),
 * evaluated per face during rasterization.
 *
 * - Ambient: ambientIntensity × ambientColor (scene styles; default white × 1
 *   keeps scenes without lights pixel-identical to the unlit renderer).
 * - Point light: N·L diffuse with linear distance attenuation
 *   (1 − dist/radius); the radius is REAL — it bounds the light's reach.
 * - Directional: constant L = −direction, no attenuation.
 * - The normal is the face's GEOMETRIC normal in world space (cross product),
 *   oriented toward the viewer so visible faces always shade correctly —
 *   surface orientation genuinely changes the response (rotate a cube and
 *   the faces light differently).
 * - Everything is NaN-safe and clamped; malformed data cannot produce broken
 *   canvas values.
 */
function shadeFaceColor(
  baseHex: string,
  points: [number, number, number][],
  camera: Camera3DState,
  lights: Light3DWorld[] | undefined,
  ambient: Ambient3D | undefined,
): string {
  const base = hexToRgb01(baseHex) ?? [0.35, 0.78, 0.94];
  const amb = ambient ?? { r: 1, g: 1, b: 1, intensity: 1 };
  const active = (lights ?? []).filter((l) => l.enabled && l.intensity > 0).slice(0, MAX_LIGHTS);

  let total: [number, number, number] = [
    amb.intensity * amb.r,
    amb.intensity * amb.g,
    amb.intensity * amb.b,
  ];

  if (active.length > 0 && points.length >= 3) {
    // Face center + geometric normal in world space.
    let cx = 0, cy = 0, cz = 0;
    for (const p of points) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= points.length; cy /= points.length; cz /= points.length;
    const ax = points[1]![0] - points[0]![0];
    const ay = points[1]![1] - points[0]![1];
    const az = points[1]![2] - points[0]![2];
    const bx = points[2]![0] - points[0]![0];
    const by = points[2]![1] - points[0]![1];
    const bz = points[2]![2] - points[0]![2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen > 1e-9) {
      nx /= nLen; ny /= nLen; nz /= nLen;
      // Two-sided: visible faces light from their viewer-facing side.
      const vx = camera.position[0] - cx;
      const vy = camera.position[1] - cy;
      const vz = camera.position[2] - cz;
      if (nx * vx + ny * vy + nz * vz < 0) { nx = -nx; ny = -ny; nz = -nz; }

      for (const light of active) {
        let ndl: number;
        let atten: number;
        if (light.type === "directional") {
          ndl = -(nx * light.direction[0] + ny * light.direction[1] + nz * light.direction[2]);
          atten = 1;
        } else {
          const lx = light.position[0] - cx;
          const ly = light.position[1] - cy;
          const lz = light.position[2] - cz;
          const dist = Math.hypot(lx, ly, lz);
          if (dist < 1e-9) continue;
          ndl = (nx * lx + ny * ly + nz * lz) / dist;
          atten = clamp01(1 - dist / light.radius);
        }
        const diffuse = Math.max(ndl, 0) * atten * light.intensity;
        if (diffuse <= 0) continue;
        const tint = hexToRgb01(light.color) ?? [1, 1, 1];
        total[0] += diffuse * tint[0];
        total[1] += diffuse * tint[1];
        total[2] += diffuse * tint[2];
      }
    }
  }

  const r = Math.round(clamp01(total[0]) * base[0] * 255);
  const g = Math.round(clamp01(total[1]) * base[1] * 255);
  const b = Math.round(clamp01(total[2]) * base[2] * 255);
  return `rgb(${r},${g},${b})`;
}

const DEG = Math.PI / 180;

/** Unit cube faces (quads, outward winding). */
const CUBE_FACES: [number, number, number][][] = (
  [
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], // front +z
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], // back −z
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], // right +x
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], // left −x
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], // top +y
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], // bottom −y
  ] as [number, number, number][][]
).map((face) => face.map(([x, y, z]) => [x * 0.5, y * 0.5, z * 0.5] as [number, number, number]));

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Rotates a point by Euler XYZ (degrees) — deterministic, no gimbal tricks. */
function rotate(p: [number, number, number], rot: [number, number, number]): [number, number, number] {
  let [x, y, z] = p;
  const rx = rot[0] * DEG, ry = rot[1] * DEG, rz = rot[2] * DEG;
  // Z
  const cz = Math.cos(rz), sz = Math.sin(rz);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  // X
  const cx = Math.cos(rx), sx = Math.sin(rx);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  // Y
  const cy = Math.cos(ry), sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}

/** Builds world-space faces for one mesh. When `mesh.matrix` is present it
 * IS the world transform (hierarchy-derived) and replaces the local
 * position/rotation/scale application — authored locals stay untouched. */
export function meshFaces(mesh: Mesh3D): Face3D[] {
  if (!mesh.visible) return [];
  const faces: Face3D[] = [];
  const world = mesh.matrix ?? mat4ComposeTRS(mesh.position, mesh.rotation, mesh.scale);
  const emit = (points: [number, number, number][]) =>
    faces.push({
      points: points.map((v) => mat4TransformPoint(world, v)),
      color: mesh.color,
      meshId: mesh.id,
    });

  if (mesh.kind === "cube") {
    for (const face of CUBE_FACES) emit(face);
  } else if (mesh.kind === "sphere") {
    // Lat-long quads — a real tessellated sphere, deterministic segmentation.
    const lat = 8, lon = 10;
    const at = (i: number, j: number): [number, number, number] => {
      const phi = (i / lat) * Math.PI; // 0..π top→bottom
      const theta = (j / lon) * Math.PI * 2;
      return [Math.sin(phi) * Math.cos(theta) * 0.5, Math.cos(phi) * 0.5, Math.sin(phi) * Math.sin(theta) * 0.5];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        emit([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
  } else if (mesh.kind === "plane") {
    // One unit quad on the XZ plane (up-facing).
    const quad: [number, number, number][] = [[0, 0, 0.5], [1, 0, 0.5], [1, 0, -0.5], [0, 0, -0.5]];
    emit(quad.map(([x, y, z]) => [x - 0.5, y, z] as [number, number, number]));
  }
  return faces;
}

export interface RenderOptions3D {
  width: number;
  height: number;
  camera: Camera3DState;
  meshes: Mesh3D[];
  /** TASK 55: resolved world-space lights (≤ MAX_LIGHTS) + scene ambient.
   * Undefined lights/ambient = the unlit renderer (ambient white × 1). */
  lights?: Light3DWorld[];
  ambient?: Ambient3D;
  /** Editor-only helpers (grid + axes). The runtime never draws them. */
  grid?: boolean;
  selectedId?: string;
  /** TASK 60 §20: multi-select highlight (viewport-local ctrl+click set).
   * Drawn thinner/bluer than the primary selection outline. */
  highlightIds?: string[];
}

/**
 * Renders one frame. Pipeline: model → world → camera transform →
 * perspective divide → near clip (discard) → painter's depth sort →
 * backface-culled filled faces. Deterministic for a given state.
 */
export function drawScene3D(ctx: CanvasRenderingContext2D, options: RenderOptions3D): void {
  const { width, height, camera, meshes } = options;
  ctx.clearRect(0, 0, width, height);

  const fov = clamp(camera.fov, 20, 120) * DEG;
  const focal = height / 2 / Math.tan(fov / 2);
  const camRot: [number, number, number] = [-camera.rotation[0], -camera.rotation[1], -camera.rotation[2]];

  // Precompute the camera transform (inverse view transform) per vertex:
  // translate by −camera.position, rotate by −camera.rotation.
  const toView = (p: [number, number, number]): [number, number, number] => {
    const t: [number, number, number] = [p[0] - camera.position[0], p[1] - camera.position[1], p[2] - camera.position[2]];
    return rotate(t, camRot);
  };

  interface ProjectedFace {
    screen: [number, number][];
    depth: number;
    color: string;
    meshId: string;
  }
  const projected: ProjectedFace[] = [];

  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    for (const face of meshFaces(mesh)) {
      const view = face.points.map(toView);
      if (view.some((p) => p[2] > -camera.near)) continue; // near clip: fully behind
      const screen: [number, number][] = [];
      let depth = 0;
      let ok = true;
      for (const p of view) {
        if (p[2] >= -camera.near) { ok = false; break; } // vertex at/behind near plane
        const s = focal / -p[2];
        if (!Number.isFinite(s) || -p[2] > camera.far) { ok = false; break; }
        screen.push([width / 2 + p[0] * s, height / 2 - p[1] * s]);
        depth += p[2];
      }
      if (!ok || screen.length < 3) continue;
      // Backface cull in view space: skip faces whose winding flips (normal
      // away from the camera) — computed via the projected signed area.
      const area =
        (screen[1]![0] - screen[0]![0]) * (screen[2]![1] - screen[0]![1]) -
        (screen[2]![0] - screen[0]![0]) * (screen[1]![1] - screen[0]![1]);
      if (area <= 0 && mesh.kind !== "plane") continue;
      // TASK 55: the lit color is computed HERE, per visible face, from the
      // face's world geometry — lighting happens during rasterization.
      projected.push({
        screen,
        depth: depth / view.length,
        color: shadeFaceColor(face.color, face.points, camera, options.lights, options.ambient),
        meshId: face.meshId,
      });
    }
  }

  // Painter's algorithm: farthest first. Depth is negative-toward-camera, so
  // sort ascending (most negative = farthest).
  projected.sort((a, b) => a.depth - b.depth);

  for (const face of projected) {
    ctx.beginPath();
    ctx.moveTo(face.screen[0]![0], face.screen[0]![1]);
    for (let i = 1; i < face.screen.length; i++) ctx.lineTo(face.screen[i]![0], face.screen[i]![1]);
    ctx.closePath();
    ctx.fillStyle = face.color;
    ctx.fill();
    ctx.strokeStyle = face.color;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (options.selectedId && face.meshId === options.selectedId) {
      ctx.strokeStyle = "#8f7bff";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (options.highlightIds?.includes(face.meshId)) {
      ctx.strokeStyle = "#5fa8ff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  if (options.grid) drawGrid(ctx, width, height, camera, focal);

  // Axis indicator (screen-space, bottom-left): X red, Y green, Z blue.
  drawAxes(ctx, height);
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera3DState, focal: number): void {
  const toScreen = (p: [number, number, number]): [number, number] | null => {
    const dx = p[0] - camera.position[0];
    const dy = p[1] - camera.position[1];
    const dz = p[2] - camera.position[2];
    const view = rotate([dx, dy, dz], [-camera.rotation[0], -camera.rotation[1], -camera.rotation[2]]);
    if (view[2] >= -camera.near) return null;
    const s = focal / -view[2];
    if (!Number.isFinite(s)) return null;
    return [width / 2 + view[0] * s, height / 2 - view[1] * s];
  };
  ctx.strokeStyle = "rgba(143, 123, 255, 0.16)";
  ctx.lineWidth = 1;
  for (let i = -10; i <= 10; i++) {
    const a = toScreen([i * 1, 0, -10]);
    const b = toScreen([i * 1, 0, 10]);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    const c = toScreen([-10, 0, i * 1]);
    const d = toScreen([10, 0, i * 1]);
    if (c && d) {
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.stroke();
    }
  }
}

function drawAxes(ctx: CanvasRenderingContext2D, height: number): void {
  const ox = 34;
  const oy = height - 34;
  const arm = 18;
  const axes: [string, number, number][] = [
    ["#ff5f6b", arm, 0], // X
    ["#5fd08a", 0, -arm], // Y
    ["#5fa8ff", Math.sin(Math.PI / 3) * arm, Math.cos(Math.PI / 3) * arm], // Z
  ];
  for (const [color, dx, dy] of axes) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + dx, oy + dy);
    ctx.stroke();
  }
}

export interface ColliderGizmo {
  id: string;
  /** World-space center. */
  cx: number;
  cy: number;
  cz: number;
  /** Box half-extents (world-aligned). */
  hx: number;
  hy: number;
  hz: number;
  /** Sphere radius (when isSphere). */
  radius: number;
  isSphere: boolean;
  isTrigger: boolean;
}

/** Editor-only collider gizmos: wireframe boxes / sphere outlines. Trigger
 * colliders draw dashed mint; solid colliders draw amber. Visualization
 * only — never part of the runtime render, never exported. */
export function drawColliderGizmos(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera3DState,
  gizmos: ColliderGizmo[],
): void {
  const camRot: [number, number, number] = [-camera.rotation[0], -camera.rotation[1], -camera.rotation[2]];
  const fov = clamp(camera.fov, 20, 120) * DEG;
  const focal = height / 2 / Math.tan(fov / 2);
  const project = (p: [number, number, number]): [number, number] | null => {
    const view = rotate([p[0] - camera.position[0], p[1] - camera.position[1], p[2] - camera.position[2]], camRot);
    if (view[2] >= -camera.near) return null;
    const s = focal / -view[2];
    if (!Number.isFinite(s)) return null;
    return [width / 2 + view[0] * s, height / 2 - view[1] * s];
  };
  const worldToView = (p: [number, number, number]): [number, number, number] =>
    rotate([p[0] - camera.position[0], p[1] - camera.position[1], p[2] - camera.position[2]], camRot);

  for (const gizmo of gizmos) {
    const color = gizmo.isTrigger ? "#46e3b4" : "#ffb454";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(gizmo.isTrigger ? [5, 4] : []);

    const corners: [number, number, number][] = [];
    if (gizmo.isSphere) {
      // Sphere: two orthogonal circles + equator, projected per segment.
      for (const plane of [0, 1, 2]) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          let point: [number, number, number];
          if (plane === 0) point = [gizmo.cx + gizmo.radius * Math.cos(a), gizmo.cy + gizmo.radius * Math.sin(a), gizmo.cz];
          else if (plane === 1) point = [gizmo.cx, gizmo.cy + gizmo.radius * Math.cos(a), gizmo.cz + gizmo.radius * Math.sin(a)];
          else point = [gizmo.cx + gizmo.radius * Math.cos(a), gizmo.cy, gizmo.cz + gizmo.radius * Math.sin(a)];
          const s = project(point);
          if (!s) continue;
          if (!started) { ctx.moveTo(s[0], s[1]); started = true; }
          else ctx.lineTo(s[0], s[1]);
        }
        ctx.stroke();
      }
      continue;
    }

    // Box wireframe: 8 corners + 12 edges, depth-faded (skip fully-behind).
    const [hx, hy, hz] = [gizmo.hx, gizmo.hy, gizmo.hz];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corners.push([gizmo.cx + sx * hx, gizmo.cy + sy * hy, gizmo.cz + sz * hz]);
    }
    const projectedCorners = corners.map((c) => worldToView(c));
    if (projectedCorners.every((v) => v[2] >= -camera.near)) continue;
    const screenCorners = corners.map((c, i) => ({ c, v: projectedCorners[i]! }));
    const edges: [number, number][] = [
      [0, 1], [1, 3], [3, 2], [2, 0],
      [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [a, b] of edges) {
      const va = screenCorners[a]!.v;
      const vb = screenCorners[b]!.v;
      if (va[2] >= -camera.near && vb[2] >= -camera.near) continue;
      const pa = project(screenCorners[a]!.c);
      const pb = project(screenCorners[b]!.c);
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

export interface LightGizmo {
  type: "point" | "directional";
  position: [number, number, number];
  /** Normalized emission direction (directional). */
  direction: [number, number, number];
  /** Point attenuation range — drawn as the influence ring. */
  radius: number;
  color: string;
  enabled: boolean;
}

/** Editor-only light gizmos (TASK 55): a position marker + influence ring
 * for point lights, a direction arrow for directionals; disabled lights
 * draw dimmed. Visualization only — the canonical model stays authoritative
 * and nothing here is exported. */export function drawLightGizmos(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera3DState,
  gizmos: LightGizmo[],
): void {
  const camRot: [number, number, number] = [-camera.rotation[0], -camera.rotation[1], -camera.rotation[2]];
  const fov = clamp(camera.fov, 20, 120) * DEG;
  const focal = height / 2 / Math.tan(fov / 2);
  const project = (p: [number, number, number]): [number, number] | null => {
    const view = rotate([p[0] - camera.position[0], p[1] - camera.position[1], p[2] - camera.position[2]], camRot);
    if (view[2] >= -camera.near) return null;
    const s = focal / -view[2];
    if (!Number.isFinite(s)) return null;
    return [width / 2 + view[0] * s, height / 2 - view[1] * s];
  };

  for (const gizmo of gizmos) {
    const alpha = gizmo.enabled ? 1 : 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = gizmo.color;
    ctx.fillStyle = gizmo.color;
    ctx.lineWidth = 1.5;

    const origin = project(gizmo.position);
    if (origin) {
      // Position marker: a small dot with a bright core.
      ctx.beginPath();
      ctx.arc(origin[0], origin[1], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash(gizmo.enabled ? [] : [4, 3]);
      ctx.beginPath();
      ctx.arc(origin[0], origin[1], 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (gizmo.type === "point") {
      // Influence ring: the attenuation radius projected on the XZ plane.
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const s = project([
          gizmo.position[0] + gizmo.radius * Math.cos(a),
          gizmo.position[1],
          gizmo.position[2] + gizmo.radius * Math.sin(a),
        ]);
        if (!s) continue;
        if (!started) { ctx.moveTo(s[0], s[1]); started = true; }
        else ctx.lineTo(s[0], s[1]);
      }
      ctx.stroke();
    } else {
      // Direction arrow: 2 world units along the emission direction.
      ctx.setLineDash([]);
      const tip: [number, number, number] = [
        gizmo.position[0] + gizmo.direction[0] * 2,
        gizmo.position[1] + gizmo.direction[1] * 2,
        gizmo.position[2] + gizmo.direction[2] * 2,
      ];
      const tipScreen = project(tip);
      if (origin && tipScreen) {
        ctx.beginPath();
        ctx.moveTo(origin[0], origin[1]);
        ctx.lineTo(tipScreen[0], tipScreen[1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tipScreen[0], tipScreen[1], 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.setLineDash([]);
}

// ---- TASK 56: editor transform gizmos (move / rotate / scale) ---------------

export type GizmoKind = "move" | "rotate" | "scale";
export type GizmoAxisName = "x" | "y" | "z";

export interface TransformGizmoSpec {
  kind: GizmoKind;
  origin: [number, number, number];
  axes: [[number, number, number], [number, number, number], [number, number, number]];
  activeAxis: GizmoAxisName | null;
}

export interface GizmoHandleGeometry {
  originScreen: [number, number] | null;
  lines: { axis: GizmoAxisName; x0: number; y0: number; x1: number; y1: number }[];
  rings: { axis: GizmoAxisName; points: [number, number][] }[];
}

const GIZMO_COLORS: Record<GizmoAxisName, string> = { x: "#ff5f6b", y: "#5fd08a", z: "#5fa8ff" };

function gizmoBasis(n: [number, number, number]): { u: [number, number, number]; v: [number, number, number] } {
  const seed: [number, number, number] = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: [number, number, number] = [
    seed[1] * n[2] - seed[2] * n[1],
    seed[2] * n[0] - seed[0] * n[2],
    seed[0] * n[1] - seed[1] * n[0],
  ];
  const uL = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / uL, u[1] / uL, u[2] / uL];
  const v: [number, number, number] = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  return { u, v };
}

/** Projects the gizmo handles to screen geometry — used for BOTH drawing and
 * hit-testing/picking so they can never disagree. Returns null when the
 * origin is behind the near plane. */
export function projectTransformGizmo(
  width: number,
  height: number,
  camera: Camera3DState,
  spec: TransformGizmoSpec,
  lengthPx: number,
  ringPx: number,
): GizmoHandleGeometry | null {
  const fov = clamp(camera.fov, 20, 120) * DEG;
  const focal = height / 2 / Math.tan(fov / 2);
  const camRot: [number, number, number] = [-camera.rotation[0], -camera.rotation[1], -camera.rotation[2]];
  const project = (p: [number, number, number]): [number, number] | null => {
    const view = rotate([p[0] - camera.position[0], p[1] - camera.position[1], p[2] - camera.position[2]], camRot);
    if (view[2] >= -camera.near) return null;
    const s = focal / -view[2];
    if (!Number.isFinite(s)) return null;
    return [width / 2 + view[0] * s, height / 2 - view[1] * s];
  };
  const dist = Math.hypot(
    spec.origin[0] - camera.position[0],
    spec.origin[1] - camera.position[1],
    spec.origin[2] - camera.position[2],
  );
  if (dist < 1e-6) return null;
  const origin = project(spec.origin);
  if (!origin) return null;
  const len = (dist * lengthPx) / focal;
  const radius = (dist * ringPx) / focal;
  const lines: GizmoHandleGeometry["lines"] = [];
  const rings: GizmoHandleGeometry["rings"] = [];
  const order: GizmoAxisName[] = ["x", "y", "z"];
  order.forEach((axis, i) => {
    const a = spec.axes[i]!;
    if (spec.kind === "rotate") {
      const { u, v } = gizmoBasis(a);
      const points: [number, number][] = [];
      for (let k = 0; k <= 40; k++) {
        const t = (k / 40) * Math.PI * 2;
        const p = project([
          spec.origin[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * radius,
          spec.origin[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * radius,
          spec.origin[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * radius,
        ]);
        if (p) points.push(p);
      }
      rings.push({ axis, points });
    } else {
      const tip = project([spec.origin[0] + a[0] * len, spec.origin[1] + a[1] * len, spec.origin[2] + a[2] * len]);
      if (tip) lines.push({ axis, x0: origin[0], y0: origin[1], x1: tip[0], y1: tip[1] });
    }
  });
  return { originScreen: origin, lines, rings };
}

/** Draws the transform gizmo from projected handle geometry. Editor-only —
 * never part of the runtime or export. */
export function drawTransformGizmo(
  ctx: CanvasRenderingContext2D,
  geometry: GizmoHandleGeometry,
  spec: TransformGizmoSpec,
  label: string,
): void {
  if (spec.kind === "rotate") {
    for (const ring of geometry.rings) {
      if (ring.points.length < 3) continue;
      const active = spec.activeAxis === ring.axis;
      ctx.save();
      ctx.globalAlpha = spec.activeAxis && !active ? 0.3 : 1;
      ctx.strokeStyle = GIZMO_COLORS[ring.axis];
      ctx.lineWidth = active ? 3.5 : 2;
      ctx.beginPath();
      ctx.moveTo(ring.points[0]![0], ring.points[0]![1]);
      for (const p of ring.points.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  for (const line of geometry.lines) {
    const active = spec.activeAxis === line.axis;
    ctx.save();
    ctx.globalAlpha = spec.activeAxis && !active ? 0.3 : 1;
    ctx.strokeStyle = GIZMO_COLORS[line.axis];
    ctx.fillStyle = GIZMO_COLORS[line.axis];
    ctx.lineWidth = active ? 4 : 2.5;
    ctx.beginPath();
    ctx.moveTo(line.x0, line.y0);
    ctx.lineTo(line.x1, line.y1);
    ctx.stroke();
    // Arrowhead (move) / square grip (scale) at the tip.
    const dx = line.x1 - line.x0;
    const dy = line.y1 - line.y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    if (spec.kind === "move") {
      const head = 10;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x1 - ux * head - uy * head * 0.5, line.y1 - uy * head + ux * head * 0.5);
      ctx.lineTo(line.x1 - ux * head + uy * head * 0.5, line.y1 - uy * head - ux * head * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(line.x1 - 4.5, line.y1 - 4.5, 9, 9);
    }
    ctx.font = "600 10px ui-sans-serif, system-ui";
    ctx.fillText(line.axis.toUpperCase(), line.x1 + ux * 10 - 3, line.y1 + uy * 10 + 3);
    ctx.restore();
  }
  if (spec.kind === "scale" && geometry.originScreen) {
    // Uniform-scale grip at the center.
    const [ox, oy] = geometry.originScreen;
    ctx.save();
    ctx.globalAlpha = spec.activeAxis ? 0.3 : 1;
    ctx.fillStyle = "#e8ecf4";
    ctx.fillRect(ox - 4, oy - 4, 8, 8);
    ctx.restore();
  }
  if (label && geometry.originScreen) {
    ctx.save();
    ctx.fillStyle = "#8f7bff";
    ctx.font = "600 10px ui-sans-serif, system-ui";
    ctx.fillText(label, geometry.originScreen[0] + 12, geometry.originScreen[1] - 10);
    ctx.restore();
  }
}