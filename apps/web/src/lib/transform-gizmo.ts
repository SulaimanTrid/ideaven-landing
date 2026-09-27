import type { Camera3DState } from "@/lib/render3d";
import { mat4TransformPoint } from "@/lib/render3d";

/**
 * 3D transform gizmo math (TASK 56): pure, deterministic interaction helpers
 * for the editor-side move/rotate/scale gizmos.
 *
 * Everything works in WORLD space through the existing camera projection and
 * converts results back to the object's canonical LOCAL transform via the
 * parent's inverted world matrix — no second transform representation, no
 * pixel-to-world multipliers:
 *
 * - MOVE: closest point between the pointer ray and the axis line (standard
 *   two-line closest-point solve) → world delta along the axis → local.
 * - ROTATE: pointer ray ∩ ring plane → planar angle around the axis → the
 *   delta is applied to the matching local Euler axis (rx/ry/rz).
 * - SCALE: pointer projection onto the axis' screen direction → factor over
 *   the drag-start projection → local sx/sy/sz, clamped 0.1–100, NaN-safe.
 */

export type GizmoMode = "move" | "rotate" | "scale";
export type GizmoSpace = "local" | "world";
export type GizmoAxis = "x" | "y" | "z";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const GIZMO_SCALE_LIMITS = { min: 0.1, max: 100 } as const;

/** Screen-space ray through one canvas pixel (same projection as the
 * renderer: focal = (h/2)/tan(fov/2), view dir = unprojected, world dir =
 * rotated back by +camera.rotation). Deterministic. */
export function screenToWorldRay(
  camera: Camera3DState,
  px: number,
  py: number,
  width: number,
  height: number,
): { origin: Vec3; dir: Vec3 } {
  const focal = height / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const vx = (px - width / 2) / focal;
  const vy = -(py - height / 2) / focal;
  const view: [number, number, number] = [vx, vy, -1];
  const len = Math.hypot(view[0], view[1], view[2]) || 1;
  const local: [number, number, number] = [view[0] / len, view[1] / len, view[2] / len];
  // Invert the view rotation (renderer rotates by -camera.rotation).
  const r = rotationMatrix([camera.rotation[0], camera.rotation[1], camera.rotation[2]]);
  const world: [number, number, number] = [
    r[0]! * local[0] + r[4]! * local[1] + r[8]! * local[2],
    r[1]! * local[0] + r[5]! * local[1] + r[9]! * local[2],
    r[2]! * local[0] + r[6]! * local[1] + r[10]! * local[2],
  ];
  return {
    origin: { x: camera.position[0], y: camera.position[1], z: camera.position[2] },
    dir: { x: world[0], y: world[1], z: world[2] },
  };
}

/** Column-major rotation matrix from Euler degrees (matches render3d.rotate). */
export function rotationMatrix(rot: [number, number, number]): number[] {
  const rx = rot[0] * (Math.PI / 180);
  const ry = rot[1] * (Math.PI / 180);
  const rz = rot[2] * (Math.PI / 180);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  // Rotation = Ry(ry) · Rx(rx) · Rz(rz) — matches mat4ComposeTRS.
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
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    0, 0, 0, 1,
  ];
}

/** Closest-point parameter on the axis line (p0 + a·s) to the pointer ray
 * (o + d·t). Returns null when the lines are (near) parallel. */
export function axisRayParameter(
  p0: Vec3,
  a: Vec3,
  ray: { origin: Vec3; dir: Vec3 },
): number | null {
  const w0: Vec3 = { x: p0.x - ray.origin.x, y: p0.y - ray.origin.y, z: p0.z - ray.origin.z };
  const c = a.x * ray.dir.x + a.y * ray.dir.y + a.z * ray.dir.z;
  const denom = 1 - c * c;
  if (Math.abs(denom) < 1e-9) return null;
  const d = a.x * w0.x + a.y * w0.y + a.z * w0.z;
  const e = ray.dir.x * w0.x + ray.dir.y * w0.y + ray.dir.z * w0.z;
  return (c * e - d) / denom;
}

/** Intersection of the pointer ray with the plane through `center` whose
 * normal is `n`; null when the ray is parallel. */
export function rayPlanePoint(
  center: Vec3,
  n: Vec3,
  ray: { origin: Vec3; dir: Vec3 },
): Vec3 | null {
  const denom = n.x * ray.dir.x + n.y * ray.dir.y + n.z * ray.dir.z;
  if (Math.abs(denom) < 1e-9) return null;
  const w: Vec3 = { x: center.x - ray.origin.x, y: center.y - ray.origin.y, z: center.z - ray.origin.z };
  const t = (n.x * w.x + n.y * w.y + n.z * w.z) / denom;
  if (!Number.isFinite(t)) return null;
  return { x: ray.origin.x + ray.dir.x * t, y: ray.origin.y + ray.dir.y * t, z: ray.origin.z + ray.dir.z * t };
}

/** Orthonormal in-plane basis (u, v) for the plane normal n. */
export function planeBasis(n: Vec3): { u: Vec3; v: Vec3 } {
  const seed: Vec3 = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const uLen = Math.hypot(seed.x, seed.y, seed.z) || 1;
  let u: Vec3 = {
    x: (seed.y * n.z - seed.z * n.y) / uLen,
    y: (seed.z * n.x - seed.x * n.z) / uLen,
    z: (seed.x * n.y - seed.y * n.x) / uLen,
  };
  const uL = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / uL, y: u.y / uL, z: u.z / uL };
  const v: Vec3 = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };
  return { u, v };
}

/** Planar angle of point p around `center` in the (u, v) basis. */
export function planarAngle(center: Vec3, p: Vec3, u: Vec3, v: Vec3): number {
  const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
  return Math.atan2(dx * v.x + dy * v.y + dz * v.z, dx * u.x + dy * u.y + dz * u.z);
}

/** Shortest signed angular difference (radians), wrap-safe. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Scale factor from pointer projections on the axis' screen direction —
 * clamped, NaN-safe, never zero. */
export function scaleFromProjection(startProj: number, proj: number, startScale: number): number {
  const safeStart = Math.abs(startProj) < 1 ? 1 : startProj;
  const raw = startScale * (proj / safeStart);
  if (!Number.isFinite(raw)) return startScale;
  return Math.min(GIZMO_SCALE_LIMITS.max, Math.max(GIZMO_SCALE_LIMITS.min, raw));
}

/** World position of the object's center from its (possibly overridden)
 * world matrix — the mesh pivot is the origin, so the translation IS the
 * world center. */
export function worldCenterOf(matrix: number[]): Vec3 {
  const p = mat4TransformPoint(matrix, [0, 0, 0]);
  return { x: p[0], y: p[1], z: p[2] };
}

/** The gizmo's world-space axis directions for one space. LOCAL = the
 * object's world-matrix rotation columns (its local axes in world space);
 * WORLD = the world axes. */
export function gizmoAxes(space: GizmoSpace, worldMatrix: number[]): [Vec3, Vec3, Vec3] {
  if (space === "world") {
    return [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ];
  }
  const col = (i: number): Vec3 => {
    const x = worldMatrix[i] ?? 0;
    const y = worldMatrix[i + 1] ?? 0;
    const z = worldMatrix[i + 2] ?? 0;
    const len = Math.hypot(x, y, z) || 1;
    return { x: x / len, y: y / len, z: z / len };
  };
  return [col(0), col(4), col(8)];
}
