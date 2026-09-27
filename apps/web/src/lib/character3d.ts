import type { ProjectModelInputAction, ProjectModelScreen, PropsMap } from "@/types/project";
import { inputActionsOf } from "@/lib/project-model/scene";

/**
 * 3D character controller (TASK 57): ONE canonical controller configuration
 * layered over the TASK 54 physics — the controller decides VELOCITIES each
 * fixed step, the existing physics world integrates/collides/resolves. No
 * second timestep, no second simulation loop, no second input system.
 *
 * Canonical authored props (on the player entity):
 *   controllerEnabled, moveSpeed, acceleration, deceleration, jumpForce,
 *   airControl. Gravity participation reuses the TASK 54 `gravityEnabled`
 *   physics prop — never duplicated here.
 *
 * Runtime-only state (velocity, grounded, input vector) lives in the physics
 * body / controller runtime and is NEVER persisted.
 *
 * Movement space: horizontal movement relative to the ACTIVE 3D camera's
 * facing (its world −Z axis projected onto the XZ plane, normalized); W/A/S/D
 * move forward/left/back/right relative to that view. No camera entity →
 * forward defaults to world −Z. Vertical movement is gravity/jump only —
 * this is a grounded character controller, not a fly camera.
 */

export interface Controller3DConfig {
  enabled: boolean;
  /** World units / second (0.1–100). */
  moveSpeed: number;
  /** Horizontal acceleration, units/s² (0–200). */
  acceleration: number;
  /** Horizontal deceleration when no input, units/s² (0–200). */
  deceleration: number;
  /** Instant vertical impulse on jump, units/s (0–50). */
  jumpForce: number;
  /** 0–1 — how much acceleration/deceleration applies while airborne. */
  airControl: number;
}

export const CONTROLLER_3D_LIMITS = {
  minMoveSpeed: 0.1,
  maxMoveSpeed: 100,
  maxAcceleration: 200,
  maxDeceleration: 200,
  maxJumpForce: 50,
} as const;

/** The semantic action slots the controller consumes. IDs reuse the
 * established input abstraction vocabulary (`move-left` / `move-right` /
 * `jump`) plus the 3D-only forward/backward pair. */
export const CONTROLLER_ACTION_FORWARD = "move-forward";
export const CONTROLLER_ACTION_BACKWARD = "move-backward";
export const CONTROLLER_ACTION_LEFT = "move-left";
export const CONTROLLER_ACTION_RIGHT = "move-right";
export const CONTROLLER_ACTION_JUMP = "jump";

/** Built-in 3D key bindings (used for slots the screen's inputActions do not
 * explicitly define). Keys are lowercase event.key values; " " = Space. */
export const CONTROLLER_DEFAULT_KEYS: Record<string, string[]> = {
  [CONTROLLER_ACTION_FORWARD]: ["w", "arrowup"],
  [CONTROLLER_ACTION_BACKWARD]: ["s", "arrowdown"],
  [CONTROLLER_ACTION_LEFT]: ["a", "arrowleft"],
  [CONTROLLER_ACTION_RIGHT]: ["d", "arrowright"],
  [CONTROLLER_ACTION_JUMP]: [" "],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const num = (value: unknown, fallback: number) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};

/** Parses + clamps one entity's controller configuration. Malformed model
 * data falls back to safe defaults — never NaN/Infinity. */
export function parseController3D(props: PropsMap | undefined): Controller3DConfig {
  return {
    enabled: props?.controllerEnabled === true,
    moveSpeed: clamp(num(props?.moveSpeed, 5), CONTROLLER_3D_LIMITS.minMoveSpeed, CONTROLLER_3D_LIMITS.maxMoveSpeed),
    acceleration: clamp(num(props?.acceleration, 40), 0, CONTROLLER_3D_LIMITS.maxAcceleration),
    deceleration: clamp(num(props?.deceleration, 60), 0, CONTROLLER_3D_LIMITS.maxDeceleration),
    jumpForce: clamp(num(props?.jumpForce, 6), 0, CONTROLLER_3D_LIMITS.maxJumpForce),
    airControl: clamp(num(props?.airControl, 0.4), 0, 1),
  };
}

/** Resolves the key lists for the five semantic slots from the screen's
 * canonical inputActions: an action with the slot's id wins (user rebindings
 * through the existing Input Actions panel), otherwise the built-in 3D
 * defaults apply. 2D scenes are unaffected (this is consumed by the 3D
 * runtime only). */
export function resolveControllerKeys(screen: ProjectModelScreen): Record<string, string[]> {
  const actions: ProjectModelInputAction[] = inputActionsOf(screen);
  const byId = new Map(actions.filter((a) => a.enabled).map((a) => [a.id, a.keys]));
  const resolved: Record<string, string[]> = {};
  for (const slot of [
    CONTROLLER_ACTION_FORWARD,
    CONTROLLER_ACTION_BACKWARD,
    CONTROLLER_ACTION_LEFT,
    CONTROLLER_ACTION_RIGHT,
    CONTROLLER_ACTION_JUMP,
  ]) {
    resolved[slot] = byId.get(slot) ?? CONTROLLER_DEFAULT_KEYS[slot] ?? [];
  }
  return resolved;
}

/** Normalized horizontal input vector from the pressed-key set: x = strafe
 * (right +), z = forward (+). Diagonals normalize to length ≤ 1, so W+D can
 * never be faster than W alone. Always finite. */
export function inputVector(
  pressed: Set<string>,
  keys: Record<string, string[]>,
): { x: number; z: number } {
  const held = (slot: string) => keys[slot]?.some((k) => pressed.has(k)) === true;
  let x = (held(CONTROLLER_ACTION_RIGHT) ? 1 : 0) - (held(CONTROLLER_ACTION_LEFT) ? 1 : 0);
  let z = (held(CONTROLLER_ACTION_FORWARD) ? 1 : 0) - (held(CONTROLLER_ACTION_BACKWARD) ? 1 : 0);
  const len = Math.hypot(x, z);
  if (!Number.isFinite(len) || len <= 0) return { x: 0, z: 0 };
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}

/** The active camera's horizontal facing (forward = world −Z axis of the
 * camera's world matrix, projected onto XZ and normalized). Falls back to
 * world −Z when the camera looks straight down or is missing. */
export function cameraBasis(worldMatrix: number[] | null): { forward: { x: number; z: number }; right: { x: number; z: number } } {
  let fx = 0;
  let fz = -1;
  if (worldMatrix) {
    fx = -(worldMatrix[8] ?? 0);
    fz = -(worldMatrix[10] ?? 0);
    const len = Math.hypot(fx, fz);
    if (!Number.isFinite(len) || len < 1e-6) {
      fx = 0;
      fz = -1;
    } else {
      fx /= len;
      fz /= len;
    }
  }
  // right = forward × up (up = +Y) → (-fz, 0, fx); for forward (0,0,-1)
  // this is (1, 0, 0) — world +X.
  return { forward: { x: fx, z: fz }, right: { x: -fz, z: fx } };
}

const moveToward = (current: number, target: number, maxDelta: number): number => {
  const d = target - current;
  if (!Number.isFinite(d)) return current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
};

export interface ControllerVelocityInput {
  /** Current horizontal velocity (world units/s). */
  vx: number;
  vz: number;
  /** Normalized input vector. */
  input: { x: number; z: number };
  /** Camera basis (forward/right, XZ). */
  basis: { forward: { x: number; z: number }; right: { x: number; z: number } };
  config: Controller3DConfig;
  /** Grounded state from the physics body (previous fixed step). */
  grounded: boolean;
  /** Fixed delta seconds. */
  dt: number;
}

/** One fixed-step controller velocity update: accelerate toward the
 * input-driven target velocity (acceleration × airControl in air), or
 * decelerate toward zero when no input. Returns the new horizontal velocity.
 * Deterministic, NaN-safe. */
export function controllerVelocity(input0: ControllerVelocityInput): { vx: number; vz: number } {
  const { input, basis, config, grounded, dt } = input0;
  let vx = Number.isFinite(input0.vx) ? input0.vx : 0;
  let vz = Number.isFinite(input0.vz) ? input0.vz : 0;
  const control = grounded ? 1 : config.airControl;
  const inputLen = Math.hypot(input.x, input.z);
  if (inputLen > 0 && config.moveSpeed > 0) {
    const targetX = (basis.right.x * input.x + basis.forward.x * input.z) * config.moveSpeed;
    const targetZ = (basis.right.z * input.x + basis.forward.z * input.z) * config.moveSpeed;
    const maxDelta = config.acceleration * control * dt;
    vx = moveToward(vx, targetX, maxDelta);
    vz = moveToward(vz, targetZ, maxDelta);
  } else {
    const maxDelta = config.deceleration * control * dt;
    vx = moveToward(vx, 0, maxDelta);
    vz = moveToward(vz, 0, maxDelta);
  }
  return { vx, vz };
}
