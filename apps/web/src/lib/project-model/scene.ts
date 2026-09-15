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

// ---- Tilemap (SYSTEM 4) ------------------------------------------------------
// The tiles prop is the canonical cell store: "col,row:tile;…" in the
// tilemap's own grid. Painting/erasing edits this string through the normal
// model commit path; every surface (design canvas, preview, published pages)
// derives both pixels and collision from it via the helpers below.

/** Minimum cell size a tilemap accepts (mirrors the registry field bound). */
export const TILEMAP_CELL_MIN = 8;

/** Reads a tilemap's cell size with the runtime's 32px fallback. */
export function tilemapCellSize(props: PropsMap | undefined): number {
  const size = props?.cellSize;
  return typeof size === "number" && size >= TILEMAP_CELL_MIN ? size : 32;
}

/** Reads a tilemap's grid bounds with the registry defaults. */
export function tilemapGrid(props: PropsMap | undefined): { cols: number; rows: number } {
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
  return { cols: num(props?.cols, 12), rows: num(props?.rows, 7) };
}

/** Parses a "col,row:tile;…" tilemap payload into cell coordinates. */
export function parseTiles(tiles: string): { col: number; row: number; tile: number }[] {
  const out: { col: number; row: number; tile: number }[] = [];
  for (const part of tiles.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const [pos, tile] = seg.split(":");
    if (!pos) continue;
    const [colRaw, rowRaw] = pos.split(",");
    const col = parseInt(colRaw ?? "", 10);
    const row = parseInt(rowRaw ?? "", 10);
    const tileNum = parseInt(tile ?? "0", 10);
    if (Number.isFinite(col) && Number.isFinite(row)) {
      out.push({ col, row, tile: Number.isFinite(tileNum) ? tileNum : 0 });
    }
  }
  return out;
}

/** Parses the tiles prop into a mutable cell map (the editor's working form). */
export function tilesToMap(tiles: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const cell of parseTiles(tiles)) map.set(`${cell.col},${cell.row}`, cell.tile);
  return map;
}

/** Serializes a cell map back into the canonical prop — row-major, deterministic. */
export function tilesToString(tiles: Map<string, number>): string {
  return [...tiles.entries()]
    .map(([key, tile]) => {
      const [col, row] = key.split(",");
      return { col: Number(col), row: Number(row), tile };
    })
    .filter((c) => Number.isFinite(c.col) && Number.isFinite(c.row))
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((c) => `${c.col},${c.row}:${c.tile}`)
    .join(";");
}

/** World-space rects of a tilemap's painted cells — what is painted is what collides. */
export function tilemapCellRects(props: PropsMap | undefined, rect: EntityRect): EntityRect[] {
  const cell = tilemapCellSize(props);
  return parseTiles(String(props?.tiles ?? "")).map(({ col, row }) => ({
    x: rect.x + col * cell,
    y: rect.y + row * cell,
    width: cell,
    height: cell,
  }));
}

/** Parses a "value:#hex;…" tile palette prop into a tile→color map. */
export function parseTilePalette(palette: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const part of palette.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const [value, hex] = seg.split(":");
    const num = parseInt(value ?? "", 10);
    if (Number.isFinite(num) && typeof hex === "string" && hex.trim() !== "") {
      map.set(num, hex.trim());
    }
  }
  return map;
}

/** The color a painted cell renders with: its palette entry, else the fallback tileColor. */
export function tileColorAt(props: PropsMap | undefined, tile: number): string {
  const color = parseTilePalette(String(props?.palette ?? "")).get(tile);
  if (color) return color;
  return typeof props?.tileColor === "string" ? props.tileColor : "#2a3348";
}

/** The tile values the palette offers for painting (sorted ascending). */
export function tilemapPaletteValues(props: PropsMap | undefined): number[] {
  return [...parseTilePalette(String(props?.palette ?? "")).keys()].sort((a, b) => a - b);
}
