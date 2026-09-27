import type { PropsMap } from "@/types/project";
import { mat4TransformPoint } from "@/lib/render3d";
import { computeWorldMatrices } from "@/lib/hierarchy3d";
import type { ProjectModelComponent } from "@/types/project";

/**
 * 3D material + light foundation (TASK 55): canonical parse/sanitize for
 * mesh materials and scene lights, plus the bounded multi-light resolution
 * used by the software renderer.
 *
 * MATERIAL: one canonical configuration — baseColor (the entity's existing
 * `color` prop). Roughness/metalness are NOT implemented: the Canvas 2D
 * software rasterizer shades flat faces, and a per-pixel BRDF would require
 * replacing the renderer. They are documented unavailable and no editor
 * control is exposed for them (no fake UI).
 *
 * LIGHTS: one canonical 3D light architecture (`light3d` entity, type
 * point|directional). Lights use the EXISTING transform system (position;
 * rotation = emission direction for directional) and participate in the
 * Task 53 hierarchy — a parented light moves with its parent. They are
 * explicitly non-physics (no collider, no body).
 *
 * All parsing is deterministic and crash-safe: malformed model data falls
 * back to safe defaults in editor, preview, published, and export.
 */

export type Light3DType = "point" | "directional";

export interface Light3DConfig {
  id: string;
  type: Light3DType;
  enabled: boolean;
  /** Hex color string (validated at parse). */
  color: string;
  /** 0–5. */
  intensity: number;
  /** Point attenuation range in world units (0.1–1000). Unused by
   * directional lights (their attenuation is 1 by definition). */
  radius: number;
}

export interface Light3DWorld extends Light3DConfig {
  /** World-space position (point) or origin (directional). */
  position: [number, number, number];
  /** Normalized emission direction (directional only; point lights ignore). */
  direction: [number, number, number];
}

export interface Ambient3D {
  /** RGB components 0–1 (from hex ambientColor). */
  r: number;
  g: number;
  b: number;
  /** 0–1 multiplier. */
  intensity: number;
}

export const LIGHT3D_LIMITS = {
  maxLights: 8,
  maxIntensity: 5,
  minRadius: 0.1,
  maxRadius: 1000,
} as const;

export const DEFAULT_LIGHT3D_COLOR = "#ffd9a0";
export const DEFAULT_AMBIENT_3D_COLOR = "#ffffff";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const num = (value: unknown, fallback: number) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};

/** Hex color validation matching the project's existing convention
 * (#rgb / #rrggbb). Returns null for anything else. */
export function validHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : null;
}

/** "#rgb" → "#rrggbb" (for the canvas fill path, which needs 6 digits). */
export function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

/** Parses one light3d entity's configuration from its props. */
export function parseLight3D(id: string, props: PropsMap | undefined): Light3DConfig {
  const type = props?.type === "directional" ? "directional" : "point";
  return {
    id,
    type,
    enabled: props?.enabled !== false,
    color: validHexColor(props?.color) ?? DEFAULT_LIGHT3D_COLOR,
    intensity: clamp(num(props?.intensity, 1), 0, LIGHT3D_LIMITS.maxIntensity),
    radius: clamp(num(props?.radius, 12), LIGHT3D_LIMITS.minRadius, LIGHT3D_LIMITS.maxRadius),
  };
}

/** Scene ambient from screen styles (existing keys, 3D defaults: white × 1 —
 * scenes without lights render exactly as they did before Task 55). */
export function parseAmbient3D(styles: PropsMap | undefined): Ambient3D {
  const hex = normalizeHex(validHexColor(styles?.ambientColor) ?? DEFAULT_AMBIENT_3D_COLOR);
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
    intensity: clamp(num(styles?.ambientIntensity, 1), 0, 1),
  };
}

const DEG = Math.PI / 180;

/** Rotates a unit vector by euler XYZ degrees (Z → X → Y, the same order the
 * renderer uses) and normalizes — the directional-light emission direction. */
function rotateDir([x, y, z]: [number, number, number], rot: [number, number, number]): [number, number, number] {
  const [rx, ry, rz] = [rot[0] * DEG, rot[1] * DEG, rot[2] * DEG];
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y, z];
}

/** Resolves every light3d on a screen into world-space lights (positions/
 * directions through the Task 53 hierarchy). Returns ALL lights — enabled
 * and disabled (`enabled` flag; disabled draw dimmed gizmos) — in model
 * order. `excessive` reports more ACTIVE lights than the renderer's cap.
 * Callers may pass precomputed hierarchy matrices to avoid re-evaluating
 * the world once per frame. */
export function resolveLights3D(
  components: ProjectModelComponent[],
  propsOf: (id: string) => PropsMap,
  matrices?: ReturnType<typeof computeWorldMatrices>["matrices"],
): { lights: Light3DWorld[]; excessive: boolean } {
  const entries = matrices ?? computeWorldMatrices(components).matrices;
  const lights: Light3DWorld[] = [];
  let activeCount = 0;
  for (const component of components) {
    if (component.type !== "light3d") continue;
    const config = parseLight3D(component.id, propsOf(component.id));
    if (config.enabled) activeCount += 1;
    const entry = entries.get(component.id);
    const local: [number, number, number] = [
      num(component?.props?.px, 0),
      num(component?.props?.py, 0.5),
      num(component?.props?.pz, 0),
    ];
    const position = entry
      ? mat4TransformPoint(entry.matrix, [0, 0, 0])
      : local;
    const rot: [number, number, number] = [
      num(component?.props?.rx, 0),
      num(component?.props?.ry, 0),
      num(component?.props?.rz, 0),
    ];
    // Directional shines along the entity's -Z (the camera convention).
    const dir = rotateDir([0, 0, -1], rot);
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    lights.push({
      ...config,
      position: [position[0], position[1], position[2]],
      direction: config.type === "directional" ? [dir[0] / len, dir[1] / len, dir[2] / len] : [0, -1, 0],
    });
  }
  return { lights, excessive: activeCount > LIGHT3D_LIMITS.maxLights };
}
