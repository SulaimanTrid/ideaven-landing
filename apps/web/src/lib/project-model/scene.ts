import type { ProjectModelComponent, ProjectModelScreen, PropsMap } from "@/types/project";
import { ENTITY_TYPES } from "@/lib/project-model/registry";

/**
 * Scene geometry helpers for the 2D Game Studio (TASK 08). A screen that
 * contains at least one game entity is a playable scene: every top-level
 * component becomes a positioned entity on the stage. These helpers are the
 * single source of truth for entity rectangles used by the design canvas,
 * the runtime's collision loop, and the inspector — one geometry, three
 * surfaces, never a duplicated formula.
 */

export interface EntityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Reads an entity's rect from its props with type-aware fallbacks. */
export function entityRect(props: PropsMap | undefined, type: string): EntityRect {
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const defaults: Record<string, EntityRect> = {
    player: { x: 24, y: 560, width: 36, height: 36 },
    platform: { x: 24, y: 640, width: 160, height: 20 },
    coin: { x: 120, y: 520, width: 28, height: 28 },
    enemy: { x: 220, y: 560, width: 32, height: 32 },
    trigger: { x: 260, y: 480, width: 100, height: 80 },
    sprite: { x: 160, y: 300, width: 48, height: 48 },
  };
  const fallback = defaults[type] ?? { x: 16, y: 16, width: 40, height: 40 };
  return {
    x: num(props?.x, fallback.x),
    y: num(props?.y, fallback.y),
    width: num(props?.width, fallback.width),
    height: num(props?.height, fallback.height),
  };
}

/** Axis-aligned overlap test between two rects. */
export function rectsOverlap(a: EntityRect, b: EntityRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** The dynamic event name fired when the player starts touching `targetId`. */
export function touchEventFor(targetId: string): string {
  return `touches-${targetId}`;
}

/** Inverse of touchEventFor — the target component id, if it is a touch event. */
export function targetOfTouchEvent(event: string): string | null {
  return event.startsWith("touches-") ? event.slice("touches-".length) : null;
}

/** True when a screen is a playable 2D scene (contains at least one entity). */
export function isSceneScreen(screen: ProjectModelScreen | undefined): boolean {
  return (screen?.components ?? []).some((c) => ENTITY_TYPES.has(c.type));
}

/** Entity components of a screen, in model order. */
export function entitiesOf(screen: ProjectModelScreen): ProjectModelComponent[] {
  return screen.components.filter((c) => ENTITY_TYPES.has(c.type));
}

/** Whether a component's runtime state says it is visible (default true). */
export function entityVisible(props: PropsMap | undefined): boolean {
  return props?.visible !== false;
}

/** Whether a component participates in collision (default true for entities). */
export function entityCollidable(props: PropsMap | undefined): boolean {
  return props?.collider !== false;
}

/** Whether an entity fires touch events only (no solid resolution). */
export function entityIsTrigger(type: string, props: PropsMap | undefined): boolean {
  if (type === "coin" || type === "enemy" || type === "trigger") return props?.trigger !== false;
  return props?.trigger === true;
}
