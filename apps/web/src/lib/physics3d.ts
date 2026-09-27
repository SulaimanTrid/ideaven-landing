import type { PropsMap } from "@/types/project";

/**
 * 3D physics foundation (TASK 54): a small, deterministic, model-driven
 * physics core — static/dynamic bodies, box/sphere colliders, scene gravity,
 * penetration resolution, grounded detection, and trigger overlap tracking.
 *
 * No physics library: the supported pairs (box/box, sphere/sphere, box/
 * sphere against AABBs) are exactly what a compact AABB solver handles, it
 * adds zero dependency weight to exported games, and it keeps
 * preview/published/export perfectly aligned (the export runtime is inline
 * vanilla JS mirrored from this file).
 *
 * Authored configuration comes from the canonical model (entity props +
 * scene styles); particle/body runtime state is transient and never
 * persisted. Simulation is fixed-timestep (1/120 s, ≤ 4 catch-up steps) —
 * callers feed real frame deltas into the accumulator.
 */

export type BodyType = "none" | "static" | "dynamic";
export type ColliderType = "none" | "box" | "sphere";

export interface PhysicsConfig {
  bodyType: BodyType;
  colliderType: ColliderType;
  enabled: boolean;
  isTrigger: boolean;
  gravityEnabled: boolean;
  mass: number;
  /** Box collider full size (authored units). */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Sphere collider radius. */
  radius: number;
}

export interface SceneGravity {
  x: number;
  y: number;
  z: number;
}

export const PHYSICS_LIMITS = {
  maxBodies: 64,
  maxColliderSize: 1000,
  minColliderSize: 0.01,
  maxRadius: 1000,
  maxMass: 10000,
  maxGravity: 100,
  fixedDt: 1 / 120,
  maxCatchUpSteps: 4,
} as const;

export const DEFAULT_GRAVITY: SceneGravity = { x: 0, y: -9.81, z: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const num = (value: unknown, fallback: number) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};

const BODY_TYPES: BodyType[] = ["none", "static", "dynamic"];
const COLLIDER_TYPES: ColliderType[] = ["none", "box", "sphere"];

export function parseBodyType(value: unknown): BodyType {
  return BODY_TYPES.includes(value as BodyType) ? (value as BodyType) : "none";
}

export function parseColliderType(value: unknown): ColliderType {
  return COLLIDER_TYPES.includes(value as ColliderType) ? (value as ColliderType) : "none";
}

/** Parses + clamps one entity's physics configuration from its props. */
export function parsePhysicsConfig(props: PropsMap | undefined): PhysicsConfig {
  return {
    bodyType: parseBodyType(props?.bodyType),
    colliderType: parseColliderType(props?.colliderType),
    enabled: props?.enabled !== false,
    isTrigger: props?.isTrigger === true,
    gravityEnabled: props?.gravityEnabled !== false,
    mass: clamp(num(props?.mass, 1), 0.01, PHYSICS_LIMITS.maxMass),
    sizeX: clamp(num(props?.colliderSizeX, 1), PHYSICS_LIMITS.minColliderSize, PHYSICS_LIMITS.maxColliderSize),
    sizeY: clamp(num(props?.colliderSizeY, 1), PHYSICS_LIMITS.minColliderSize, PHYSICS_LIMITS.maxColliderSize),
    sizeZ: clamp(num(props?.colliderSizeZ, 1), PHYSICS_LIMITS.minColliderSize, PHYSICS_LIMITS.maxColliderSize),
    radius: clamp(num(props?.colliderRadius, 0.5), PHYSICS_LIMITS.minColliderSize, PHYSICS_LIMITS.maxRadius),
  };
}

/** Scene gravity from the screen styles (clamped magnitude ≤ 100 per axis). */
export function parseSceneGravity(styles: PropsMap | undefined): SceneGravity {
  return {
    x: clamp(num(styles?.gravityX, 0), -PHYSICS_LIMITS.maxGravity, PHYSICS_LIMITS.maxGravity),
    y: clamp(num(styles?.gravityY, DEFAULT_GRAVITY.y), -PHYSICS_LIMITS.maxGravity, PHYSICS_LIMITS.maxGravity),
    z: clamp(num(styles?.gravityZ, 0), -PHYSICS_LIMITS.maxGravity, PHYSICS_LIMITS.maxGravity),
  };
}

export interface PhysicsBodyState {
  id: string;
  config: PhysicsConfig;
  /** World-space center of the collider (runtime state for dynamic bodies). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  /** World scale captured at seed time — collider dimensions follow the
   * entity's world scale exactly like the editor gizmos show them. */
  scale: [number, number, number];
}

export interface ColliderWorld {
  /** AABB half-extents (world axes; colliders are world-aligned). */
  hx: number;
  hy: number;
  hz: number;
  /** Sphere radius (when isSphere). */
  radius: number;
  isSphere: boolean;
  cx: number;
  cy: number;
  cz: number;
}

export interface TriggerEvent {
  /** The dynamic/other body that entered or left the trigger. */
  componentId: string;
  triggerId: string;
  phase: "enter" | "stay" | "exit";
}

/** A world collider derived from an entity's config + world transform. */
export function colliderFromBody(
  id: string,
  config: PhysicsConfig,
  worldCenter: [number, number, number],
  worldScale: [number, number, number],
): ColliderWorld | null {
  if (config.colliderType === "none" || !config.enabled) return null;
  if (config.colliderType === "sphere") {
    // Sphere radius scales with the largest world scale axis.
    const maxScale = Math.max(worldScale[0], worldScale[1], worldScale[2]);
    return { hx: 0, hy: 0, hz: 0, radius: config.radius * maxScale, isSphere: true, cx: worldCenter[0], cy: worldCenter[1], cz: worldCenter[2] };
  }
  return {
    hx: (config.sizeX / 2) * worldScale[0],
    hy: (config.sizeY / 2) * worldScale[1],
    hz: (config.sizeZ / 2) * worldScale[2],
    radius: 0,
    isSphere: false,
    cx: worldCenter[0],
    cy: worldCenter[1],
    cz: worldCenter[2],
  };
}

interface Overlap {
  nx: number;
  ny: number;
  nz: number;
  penetration: number;
}

/** Narrow phase: minimum-translation overlap between two world colliders
 * (box = AABB via half-extents; sphere = true radius via closest-point test
 * against the other's AABB). Returns the normal pointing from b to a, or null. */
function overlapBetween(a: ColliderWorld, b: ColliderWorld): Overlap | null {
  if (a.isSphere && b.isSphere) {
    const dx = a.cx - b.cx, dy = a.cy - b.cy, dz = a.cz - b.cz;
    const dist = Math.hypot(dx, dy, dz);
    const sum = a.radius + b.radius;
    if (dist >= sum || dist === 0) return null;
    return { nx: dx / dist, ny: dy / dist, nz: dz / dist, penetration: sum - dist };
  }
  const aHX = a.isSphere ? a.radius : a.hx;
  const aHY = a.isSphere ? a.radius : a.hy;
  const aHZ = a.isSphere ? a.radius : a.hz;
  const bHX = b.isSphere ? b.radius : b.hx;
  const bHY = b.isSphere ? b.radius : b.hy;
  const bHZ = b.isSphere ? b.radius : b.hz;
  if (a.isSphere !== b.isSphere) {
    // Sphere vs box: closest point on the box to the sphere center.
    const sphere = a.isSphere ? a : b;
    const box = a.isSphere ? b : a;
    const qx = clamp(sphere.cx, box.cx - box.hx, box.cx + box.hx);
    const qy = clamp(sphere.cy, box.cy - box.hy, box.cy + box.hy);
    const qz = clamp(sphere.cz, box.cz - box.hz, box.cz + box.hz);
    const dx = sphere.cx - qx, dy = sphere.cy - qy, dz = sphere.cz - qz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= sphere.radius) return null;
    if (dist === 0) {
      // Center inside the box: push out along the smallest axis.
      const ox = box.hx - Math.abs(sphere.cx - box.cx);
      const oy = box.hy - Math.abs(sphere.cy - box.cy);
      const oz = box.hz - Math.abs(sphere.cz - box.cz);
      const signX = sphere.cx >= box.cx ? 1 : -1;
      const signY = sphere.cy >= box.cy ? 1 : -1;
      const signZ = sphere.cz >= box.cz ? 1 : -1;
      if (ox <= oy && ox <= oz) return { nx: signX, ny: 0, nz: 0, penetration: ox + sphere.radius };
      if (oy <= oz) return { nx: 0, ny: signY, nz: 0, penetration: oy + sphere.radius };
      return { nx: 0, ny: 0, nz: signZ, penetration: oz + sphere.radius };
    }
    const sign = a.isSphere ? 1 : -1;
    return { nx: (dx / dist) * sign, ny: (dy / dist) * sign, nz: (dz / dist) * sign, penetration: sphere.radius - dist };
  }
  // Box vs box: minimum-translation axis.
  const dx = a.cx - b.cx, dy = a.cy - b.cy, dz = a.cz - b.cz;
  const px = aHX + bHX - Math.abs(dx);
  const py = aHY + bHY - Math.abs(dy);
  const pz = aHZ + bHZ - Math.abs(dz);
  if (px <= 0 || py <= 0 || pz <= 0) return null;
  if (px <= py && px <= pz) return { nx: dx >= 0 ? 1 : -1, ny: 0, nz: 0, penetration: px };
  if (py <= pz) return { nx: 0, ny: dy >= 0 ? 1 : -1, nz: 0, penetration: py };
  return { nx: 0, ny: 0, nz: dz >= 0 ? 1 : -1, penetration: pz };
}

/**
 * The bounded physics world: static + dynamic bodies with colliders.
 * `step` integrates one FIXED dt — callers run an accumulator loop.
 */
export class PhysicsWorld {
  readonly bodies: PhysicsBodyState[] = [];
  private triggerPairs = new Map<string, boolean>(); // "a|b" → overlapping

  constructor(private gravity: SceneGravity) {}

  setGravity(gravity: SceneGravity): void {
    this.gravity = gravity;
  }

  addBody(state: PhysicsBodyState): void {
    if (this.bodies.length >= PHYSICS_LIMITS.maxBodies) return;
    this.bodies.push(state);
  }

  /** Body ids currently overlapping a trigger (for observability). */
  triggerOverlaps(): string[] {
    return [...this.triggerPairs.keys()];
  }

  /**
   * One fixed simulation step: integrate gravity + velocity for dynamic
   * bodies, detect overlaps, resolve penetration + velocity for solids,
   * derive grounded, and collect trigger enter/stay/exit events.
   */
  step(dt: number, onTrigger: (event: TriggerEvent) => void): void {
    // Integrate.
    for (const body of this.bodies) {
      if (body.config.bodyType !== "dynamic" || body.config.isTrigger) continue;
      if (body.config.gravityEnabled) {
        body.vx += this.gravity.x * dt;
        body.vy += this.gravity.y * dt;
        body.vz += this.gravity.z * dt;
      }
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.z += body.vz * dt;
      body.grounded = false;
    }

    const colliders = new Map<string, ColliderWorld>();
    for (const body of this.bodies) {
      const collider = colliderFromBody(
        body.id,
        body.config,
        [body.x, body.y, body.z],
        body.scale,
      );
      if (collider) colliders.set(body.id, collider);
    }

    // Resolve dynamic-vs-solid collisions (dynamic vs static, then dyn-dyn).
    for (const dynamic of this.bodies) {
      if (dynamic.config.bodyType !== "dynamic" || dynamic.config.isTrigger) continue;
      const dynCollider = colliders.get(dynamic.id);
      if (!dynCollider) { dynamic.grounded = false; continue; }
      for (const other of this.bodies) {
        if (other.id === dynamic.id) continue;
        if (other.config.isTrigger || other.config.colliderType === "none" || !other.config.enabled) continue;
        const otherCollider = colliders.get(other.id);
        if (!otherCollider) continue;
        const hit = overlapBetween(dynCollider, otherCollider);
        if (!hit) continue;
        // Positional correction split by inverse mass (static = infinite).
        const dynInvMass = 1 / dynamic.config.mass;
        const otherInvMass = other.config.bodyType === "dynamic" ? 1 / other.config.mass : 0;
        const totalInv = dynInvMass + otherInvMass;
        if (totalInv > 0) {
          const shareDyn = dynInvMass / totalInv;
          dynamic.x += hit.nx * hit.penetration * shareDyn;
          dynamic.y += hit.ny * hit.penetration * shareDyn;
          dynamic.z += hit.nz * hit.penetration * shareDyn;
          if (otherInvMass > 0) {
            other.x -= hit.nx * hit.penetration * (otherInvMass / totalInv);
            other.y -= hit.ny * hit.penetration * (otherInvMass / totalInv);
            other.z -= hit.nz * hit.penetration * (otherInvMass / totalInv);
          }
        }
        // Velocity correction along the normal (no bounce).
        const vn = dynamic.vx * hit.nx + dynamic.vy * hit.ny + dynamic.vz * hit.nz;
        if (vn < 0) {
          dynamic.vx -= hit.nx * vn;
          dynamic.vy -= hit.ny * vn;
          dynamic.vz -= hit.nz * vn;
        }
        // Grounded: an upward-supporting contact against gravity (-y down).
        if (hit.ny > 0.5) dynamic.grounded = true;
        // Refresh the collider center after correction.
        const refreshed = colliderFromBody(dynamic.id, dynamic.config, [dynamic.x, dynamic.y, dynamic.z], [1, 1, 1]);
        if (refreshed) colliders.set(dynamic.id, refreshed);
      }
    }

    // Trigger overlaps: enter/stay/exit — no physical resolution.
    const active = new Set<string>();
    const triggers = this.bodies.filter((b) => b.config.isTrigger && b.config.enabled);
    for (const trigger of triggers) {
      const triggerCollider = colliders.get(trigger.id);
      if (!triggerCollider) continue;
      for (const body of this.bodies) {
        if (body.id === trigger.id) continue;
        if (body.config.isTrigger) continue;
        const bodyCollider = colliders.get(body.id);
        if (!bodyCollider) continue;
        const hit = overlapBetween(bodyCollider, triggerCollider);
        if (!hit) continue;
        const key = `${body.id}|${trigger.id}`;
        active.add(key);
        const phase = this.triggerPairs.has(key) ? "stay" : "enter";
        onTrigger({ componentId: body.id, triggerId: trigger.id, phase });
      }
    }
    // Exits: pairs that overlapped last step but not now.
    for (const key of [...this.triggerPairs.keys()]) {
      if (!active.has(key)) {
        const parts = key.split("|");
        const componentId = parts[0] ?? "";
        const triggerId = parts[1] ?? "";
        onTrigger({ componentId, triggerId, phase: "exit" });
        this.triggerPairs.delete(key);
      }
    }
    this.triggerPairs = new Map([...active.keys()].map((k) => [k, true]));
  }
}