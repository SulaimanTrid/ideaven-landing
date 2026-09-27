import type {
  ProjectModelComponent,
  ProjectModelInputAction,
  ProjectModelScreen,
  ProjectModelSortingLayer,
  PropsMap,
} from "@/types/project";
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

/** Whether a component participates in collision (default true for entities).
 * The camera never collides — it only frames the world. Lights and emitters
 * are configuration, not objects. */
export function entityCollidable(props: PropsMap | undefined, type?: string): boolean {
  if (type === "camera" || type === "light" || type === "emitter") return false;
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

// ---- Rule tiles (auto-tiling) -------------------------------------------------
// When a tilemap enables `autoTile`, each painted cell's rendered variant is
// chosen from its live 4-neighbor state: interior cells (4 painted
// neighbors) shade darker, edge cells (3) slightly darker, corner/isolated
// cells (≤2) keep the base palette color. The rule derives from the same
// canonical `tiles` string at render time — deterministic, identical across
// design canvas, preview, published pages, and export.

/** Multiplies a #rrggbb hex color's channels by `factor` (0..1). */
export function shadeHex(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Auto-tile shade factor for a cell from its 4-neighbor painted state. */
export function autoTileFactor(has: (col: number, row: number) => boolean, col: number, row: number): number {
  const neighbors =
    (has(col, row - 1) ? 1 : 0) + (has(col, row + 1) ? 1 : 0) +
    (has(col - 1, row) ? 1 : 0) + (has(col + 1, row) ? 1 : 0);
  if (neighbors >= 4) return 0.72; // interior
  if (neighbors === 3) return 0.86; // edge
  return 1; // corner / isolated
}

/** The render color of one cell: palette color, auto-tile shaded when enabled. */
export function cellColorFor(
  props: PropsMap | undefined,
  col: number,
  row: number,
  painted: (c: number, r: number) => boolean,
  tile: number,
): string {
  const base = tileColorAt(props, tile);
  return props?.autoTile === true ? shadeHex(base, autoTileFactor(painted, col, row)) : base;
}

// ---- Camera (TASK 14) ----------------------------------------------------------
// The camera is a real entity in the canonical model (type "camera"): one
// component holds the whole configuration — follow target, smoothing, bounds,
// shake defaults — and every surface (editor overlay, preview runtime,
// published pages, export) derives its behavior from those props. Runtime
// camera POSITION is runtime-local state and is never written back to the
// model; only configuration changes are.

/** The camera's read-back configuration with every field normalized. */
export interface CameraConfig {
  followEnabled: boolean;
  followTarget: string;
  /** 0 = instant snap; larger eases harder. Clamped 0..0.95. */
  smoothing: number;
  boundsEnabled: boolean;
  /** Bounds as-rendered: min ≤ max is guaranteed (inverted values swap). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Viewport the camera frames (the entity's own rect). */
  viewport: { width: number; height: number };
  shakeDuration: number;
  shakeStrength: number;
}

const numOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Reads a camera entity's props into a safe, normalized configuration. */
export function cameraConfig(props: PropsMap | undefined): CameraConfig {
  let minX = numOr(props?.minX, 0);
  let minY = numOr(props?.minY, 0);
  let maxX = numOr(props?.maxX, 2000);
  let maxY = numOr(props?.maxY, 1200);
  // Normalize inverted bounds once, here, so no surface ever sees them.
  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  return {
    followEnabled: props?.followEnabled !== false,
    followTarget: typeof props?.followTarget === "string" ? props.followTarget : "",
    smoothing: Math.min(0.95, Math.max(0, numOr(props?.smoothing, 0.12))),
    boundsEnabled: props?.boundsEnabled === true,
    minX,
    minY,
    maxX,
    maxY,
    viewport: {
      width: Math.max(1, numOr(props?.width, 390)),
      height: Math.max(1, numOr(props?.height, 844)),
    },
    shakeDuration: Math.max(0.05, numOr(props?.shakeDuration, 0.25)),
    shakeStrength: Math.max(0, numOr(props?.shakeStrength, 8)),
  };
}

/**
 * Frame-rate-independent smoothing factor: the fraction of the remaining
 * distance to close this frame for a given per-60fps-frame smoothing value.
 * `smoothing` 0 → 1 (instant); the approach is a deterministic exponential,
 * so a given input timeline always produces the same camera path.
 */
export function cameraApproachFactor(smoothing: number, dt: number): number {
  if (smoothing <= 0) return 1;
  return 1 - Math.pow(1 - Math.min(0.95, smoothing), Math.min(dt, 0.05) * 60);
}

/** Clamp a camera position so its viewport stays inside the world bounds.
 * A world axis smaller than the viewport pins to its min edge (no empty
 * space outside the world unless the world itself is smaller). */
export function clampCamera(
  x: number,
  y: number,
  bounds: Pick<CameraConfig, "boundsEnabled" | "minX" | "minY" | "maxX" | "maxY" | "viewport">,
): { x: number; y: number } {
  if (!bounds.boundsEnabled) return { x, y };
  const clampAxis = (pos: number, min: number, max: number, view: number) =>
    max - min <= view ? min : Math.min(max - view, Math.max(min, pos));
  return {
    x: clampAxis(x, bounds.minX, bounds.maxX, bounds.viewport.width),
    y: clampAxis(y, bounds.minY, bounds.maxY, bounds.viewport.height),
  };
}

/** The camera entity of a screen (first one wins; cameras are rare). */
export function cameraOf(screen: ProjectModelScreen): ProjectModelComponent | undefined {
  return screen.components.find((c) => c.type === "camera");
}

// ---- Sorting layers (TASK 15) ---------------------------------------------------
// ONE render-order pipeline for every surface (design canvas, preview runtime,
// published pages, export): sort by (layer order, order within layer, model
// index as the stable tie-break). Entities reference layers by NAME; a
// screen without explicit layers uses the defaults below, so nothing migrates
// and nothing renders differently between surfaces.

/** The default layer set for scenes without explicit `sortingLayers`. */
export const DEFAULT_SORTING_LAYERS: ProjectModelSortingLayer[] = [
  { name: "Background", order: 0 },
  { name: "World", order: 100 },
  { name: "Characters", order: 200 },
  { name: "Effects", order: 300 },
  { name: "Foreground", order: 400 },
  { name: "UI", order: 1000 },
];

/** The layer a component without an explicit assignment renders on. */
export const DEFAULT_SORTING_LAYER = "World";

/** The screen's layers (explicit or the default set), sorted back-to-front. */
export function sortingLayersOf(screen: ProjectModelScreen): ProjectModelSortingLayer[] {
  const layers = screen.sortingLayers?.length ? screen.sortingLayers : DEFAULT_SORTING_LAYERS;
  return [...layers].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** The order value of a layer by name; unknown names fall back to World. */
function layerOrderOf(layers: ProjectModelSortingLayer[], name: string): number {
  const wanted = name || DEFAULT_SORTING_LAYER;
  const hit = layers.find((l) => l.name === wanted) ??
    layers.find((l) => l.name === DEFAULT_SORTING_LAYER);
  return hit ? hit.order : layers[0]?.order ?? 0;
}

/**
 * All top-level scene renderables (entities + world-positioned text) in
 * deterministic back-to-front order: layer → order → model index. The model
 * index tie-break is stable and persistent, so same-layer same-order
 * entities never flip with DOM or object-key ordering. Pure — callers memoize.
 */
export function sortedRenderOrder(screen: ProjectModelScreen): ProjectModelComponent[] {
  const layers = sortingLayersOf(screen);
  return screen.components
    .map((component, index) => ({ component, index }))
    .sort((a, b) => {
      const layerDelta =
        layerOrderOf(layers, String(a.component.props?.sortingLayer ?? "")) -
        layerOrderOf(layers, String(b.component.props?.sortingLayer ?? ""));
      if (layerDelta !== 0) return layerDelta;
      const orderDelta =
        (typeof a.component.props?.sortingOrder === "number" ? a.component.props.sortingOrder : 0) -
        (typeof b.component.props?.sortingOrder === "number" ? b.component.props.sortingOrder : 0);
      if (orderDelta !== 0) return orderDelta;
      return a.index - b.index;
    })
    .map(({ component }) => component);
}

/** Whether a component references a layer this screen does not define. */
export function hasUnknownSortingLayer(
  screen: ProjectModelScreen,
  component: { id: string; type: string; props?: Record<string, unknown> },
): boolean {
  const name = String(component.props?.sortingLayer ?? "");
  if (name === "" || name === DEFAULT_SORTING_LAYER) return false;
  const layers = screen.sortingLayers?.length ? screen.sortingLayers : DEFAULT_SORTING_LAYERS;
  return !layers.some((l) => l.name === name);
}

/** Entities currently assigned to a layer name (for delete protection). */
export function entitiesOnLayer(screen: ProjectModelScreen, layerName: string): number {
  return screen.components.filter(
    (c) => String(c.props?.sortingLayer ?? "") === layerName,
  ).length;
}

// ---- Sprite animation foundation (SLICE 2) -------------------------------------
// Animation clips live on the entity as a canonical STRING payload (the same
// convention as tilemap tiles/palette — PropsMap is scalar-only). Frames
// reference the SAME asset refs a sprite's `src` uses ("asset:<id>" or URL) —
// Asset Studio PNGs become animation frames without duplicating any bytes.

export interface AnimClip {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  /** Asset refs in playback order — deterministic, index = frame order. */
  frames: string[];
}

const ANIM_FIELD_MIN = 8;

/** Parses the `animations` prop ("id~name~fps~loop~f1,f2;…") into clips. */
export function parseAnimations(raw: unknown): AnimClip[] {
  const clips: AnimClip[] = [];
  for (const part of String(raw ?? "").split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const fields = seg.split("~");
    if (fields.length < 4) continue;
    const id = (fields[0] ?? "").trim();
    const name = (fields[1] ?? "").trim();
    const fpsRaw = fields[2] ?? "";
    const loopRaw = fields[3] ?? "";
    const framesRaw = fields[4] ?? "";
    if (!id) continue;
    const fps = Math.round(Number(fpsRaw));
    const frames = framesRaw
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f !== "");
    clips.push({
      id,
      name: (name || id).slice(0, ANIM_FIELD_MIN * 8),
      fps: Number.isFinite(fps) && fps >= 1 ? Math.min(fps, 60) : 8,
      loop: loopRaw !== "0",
      frames,
    });
  }
  return clips;
}

/** Serializes clips back into the canonical prop — deterministic field order. */
export function animationsToString(clips: AnimClip[]): string {
  return clips
    .map((clip) => {
      const name = clip.name.replaceAll("~", "-").replaceAll(";", "-").trim() || clip.id;
      return [clip.id, name, String(Math.round(clip.fps)), clip.loop ? "1" : "0", clip.frames.join(",")].join("~");
    })
    .join(";");
}

/** The frame index for a clip at `elapsed` seconds — loop-aware, no timers.
 * Non-looping clips clamp at the last frame (completed state, never restart). */
export function clipFrameIndex(clip: AnimClip, elapsed: number): number {
  if (clip.frames.length === 0) return 0;
  const index = Math.floor(Math.max(0, elapsed) * clip.fps);
  if (clip.loop) return index % clip.frames.length;
  return Math.min(index, clip.frames.length - 1);
}

/** Whether a non-looping clip has finished at `elapsed`. */
export function clipCompleted(clip: AnimClip, elapsed: number): boolean {
  return !clip.loop && clip.frames.length > 0 && Math.floor(Math.max(0, elapsed) * clip.fps) >= clip.frames.length;
}

/** The clip an entity's animation state should play (the active `animation`
 * prop, else the first clip). Returns null when there is nothing to play. */
export function activeAnimation(props: PropsMap | undefined): AnimClip | null {
  const clips = parseAnimations(props?.animations);
  if (clips.length === 0) return null;
  const active = String(props?.animation ?? "");
  return clips.find((c) => c.id === active) ?? clips[0] ?? null;
}

// ---- Animation state machine (SLICE 3) ------------------------------------------
// A sprite's state machine lives in the canonical `animator` prop (the same
// scalar-string convention as animations/tiles). States reference animation
// CLIPS by id — no frame data is duplicated. The runtime feeds parameters
// (built-ins from the player's physics + block-set custom parameters),
// evaluates transitions deterministically, and drives the existing animation
// player. Current state and parameter values are RUNTIME state, never model
// writes.

export type AnimatorParamType = "bool" | "number" | "trigger";

export interface AnimatorState {
  id: string;
  name: string;
  /** The referenced animation clip id (from the `animations` prop). */
  clip: string;
  /** Playback speed multiplier for this state (1 = clip's own rate). */
  speed: number;
}

export interface AnimatorParam {
  name: string;
  type: AnimatorParamType;
  /** Initial value as text: bool "0"/"1", number literal, trigger ignores. */
  initial: string;
}

export interface AnimatorCondition {
  name: string;
  op: "==" | "!=" | ">" | ">=" | "<" | "<=";
  /** bool: "1"/"0" (also accepts true/false); number: numeric literal;
   * trigger conditions compare against the fired state (==1 / !=0). */
  value: string;
}

export interface AnimatorTransition {
  /** Source state id, or "*" for Any State. */
  from: string;
  to: string;
  /** Explicit priority: lower evaluates first; model order breaks ties. */
  order: number;
  /** 0 = immediate; otherwise the current clip's progress fraction (0..1)
   * that must be reached before the transition may fire. */
  exitTime: number;
  conds: AnimatorCondition[];
}

export interface AnimatorMachine {
  states: AnimatorState[];
  params: AnimatorParam[];
  transitions: AnimatorTransition[];
  defaultId: string;
}

/** Built-in parameter names the runtime feeds from actual player physics. */
export const ANIMATOR_BUILTIN_PARAMS: Record<string, AnimatorParamType> = {
  speed: "number",
  isGrounded: "bool",
};

const ANIM_OPS = ["==", "!=", ">=", "<=", ">", "<"];

/** Parses a conditions field ("speed>0&&attack==1") deterministically. */
export function parseAnimatorConditions(raw: string): AnimatorCondition[] {
  const conds: AnimatorCondition[] = [];
  for (const part of raw.split("&&")) {
    const seg = part.trim();
    if (!seg) continue;
    const op = ANIM_OPS.find((candidate) => seg.includes(candidate)) ?? "";
    if (!op) continue;
    const at = seg.indexOf(op);
    const name = seg.slice(0, at).trim();
    const value = seg.slice(at + op.length).trim();
    if (name) conds.push({ name, op: op as AnimatorCondition["op"], value });
  }
  return conds;
}

/** Serializes conditions back ("speed>0&&attack==1"). */
export function animatorConditionsToString(conds: AnimatorCondition[]): string {
  return conds.map((c) => `${c.name}${c.op}${c.value}`).join("&&");
}

/** Parses the `animator` prop into a machine, or null when absent/malformed. */
export function parseAnimator(raw: unknown): AnimatorMachine | null {
  const entries = String(raw ?? "").split(";");
  const states: AnimatorState[] = [];
  const params: AnimatorParam[] = [];
  const transitions: AnimatorTransition[] = [];
  let defaultId = "";
  for (const entry of entries) {
    const seg = entry.trim();
    if (!seg) continue;
    if (seg.startsWith("D:")) {
      defaultId = seg.slice(2).trim();
      continue;
    }
    const body = seg.slice(2);
    if (seg.startsWith("S:")) {
      const fields = body.split("~");
      const id = (fields[0] ?? "").trim();
      const name = (fields[1] ?? "").trim();
      const clip = (fields[2] ?? "").trim();
      const speedRaw = fields[3] ?? "1";
      const speed = Number(speedRaw);
      if (id) {
        states.push({
          id,
          name: (name || id).slice(0, 48),
          clip,
          speed: Number.isFinite(speed) && speed > 0 ? Math.min(speed, 10) : 1,
        });
      }
    } else if (seg.startsWith("P:")) {
      const fields = body.split("~");
      const name = (fields[0] ?? "").trim();
      const type = fields[1] ?? "";
      const initial = (fields[2] ?? "").trim();
      const paramType: AnimatorParamType = type === "bool" || type === "trigger" ? type : "number";
      if (name) params.push({ name, type: paramType, initial });
    } else if (seg.startsWith("T:")) {
      const fields = body.split("~");
      const from = (fields[0] ?? "").trim();
      const to = (fields[1] ?? "").trim();
      const order = Math.round(Number(fields[2] ?? "0"));
      const exitTime = Number(fields[3] ?? "0");
      const condsRaw = fields[4] ?? "";
      if (from && to) {
        transitions.push({
          from,
          to,
          order: Number.isFinite(order) ? order : 0,
          exitTime: Number.isFinite(exitTime) ? Math.min(Math.max(exitTime, 0), 1) : 0,
          conds: parseAnimatorConditions(condsRaw),
        });
      }
    }
  }
  if (states.length === 0) return null;
  return {
    states,
    params,
    transitions,
    defaultId: states.some((s) => s.id === defaultId) ? defaultId : states[0]!.id,
  };
}

/** Serializes a machine back into the canonical prop — deterministic. */
export function animatorToString(machine: AnimatorMachine): string {
  const entries: string[] = [];
  const clean = (v: string) => v.replaceAll("~", "-").replaceAll(";", "-").trim();
  if (machine.defaultId) entries.push(`D:${clean(machine.defaultId)}`);
  for (const state of machine.states) {
    entries.push(`S:${clean(state.id)}~${clean(state.name)}~${clean(state.clip)}~${Math.round(state.speed * 100) / 100}`);
  }
  for (const param of machine.params) {
    entries.push(`P:${clean(param.name)}~${param.type}~${param.type === "trigger" ? "0" : param.initial || "0"}`);
  }
  for (const transition of machine.transitions) {
    entries.push(
      `T:${transition.from === "*" ? "*" : clean(transition.from)}~${clean(transition.to)}~${transition.order}~${transition.exitTime}~${animatorConditionsToString(transition.conds)}`,
    );
  }
  return entries.join(";");
}

/** Whether one condition holds against the runtime parameter values. */
export function animatorConditionSatisfied(
  cond: AnimatorCondition,
  values: Map<string, boolean | number>,
): boolean {
  const actual = values.get(cond.name);
  if (actual === undefined) return false;
  if (typeof actual === "boolean") {
    const wanted = cond.value === "true" || cond.value === "1";
    const equals = actual === wanted;
    return cond.op === "==" ? equals : cond.op === "!=" ? !equals : false;
  }
  const wanted = Number(cond.value);
  if (!Number.isFinite(wanted)) return false;
  switch (cond.op) {
    case "==": return actual === wanted;
    case "!=": return actual !== wanted;
    case ">": return actual > wanted;
    case ">=": return actual >= wanted;
    case "<": return actual < wanted;
    case "<=": return actual <= wanted;
    default: return false;
  }
}

/**
 * Deterministic transition evaluation: candidate transitions in explicit
 * priority order (order value, then model order), first fully-valid one wins
 * — at most ONE transition per evaluation. Trigger consumption is the
 * caller's job (consume the taken transition's trigger conditions).
 * `progress` is the current clip's played fraction (0..1) for exit time.
 */
export function evaluateAnimatorTransitions(
  machine: AnimatorMachine,
  values: Map<string, boolean | number>,
  currentStateId: string,
  progress: number,
): AnimatorTransition | null {
  const candidates = machine.transitions
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => transition.from === currentStateId || transition.from === "*")
    .sort((a, b) => a.transition.order - b.transition.order || a.index - b.index);
  for (const { transition } of candidates) {
    if (transition.exitTime > 0 && progress < transition.exitTime) continue;
    const condOk = transition.conds.every((cond) => {
      if (machine.params.some((p) => p.name === cond.name && p.type === "trigger")) {
        // Trigger conditions hold only while the trigger is fired (==1/true).
        const fired = values.get(cond.name) === true;
        return cond.op === "==" ? fired : cond.op === "!=" ? !fired : false;
      }
      return animatorConditionSatisfied(cond, values);
    });
    if (condOk) return transition;
  }
  return null;
}

// ---- 2D lighting (SYSTEM 5) -----------------------------------------------------
// Lights are stage entities ("light"); ambient lives in the screen styles.
// All values are clamped at parse time — malformed configuration renders
// safely and never produces NaN/negative/unbounded light. Lighting is a
// RUNTIME RENDER EFFECT: nothing here writes to the model.

export const LIGHT_LIMITS = {
  maxLights: 8, // active point lights composited per frame (documented cap)
  minRadius: 8,
  maxRadius: 2000,
  maxIntensity: 5,
} as const;

export interface LightConfig {
  id: string;
  /** World-space center (the entity rect's center). */
  cx: number;
  cy: number;
  radius: number;
  /** 0..LIGHT_LIMITS.maxIntensity. */
  intensity: number;
  /** #rrggbb — invalid colors fall back to warm white. */
  color: string;
  enabled: boolean;
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.trim() : fallback;
}

/** The scene's point lights, parsed and clamped (deterministic model order). */
export function lightsOf(screen: ProjectModelScreen, rectOf: (props: PropsMap | undefined) => EntityRect): LightConfig[] {
  const out: LightConfig[] = [];
  for (const component of screen.components) {
    if (component.type !== "light" || out.length >= LIGHT_LIMITS.maxLights) continue;
    const rect = rectOf(component.props);
    const intensity = Number(component.props?.intensity);
    const radius = Number(component.props?.radius);
    out.push({
      id: component.id,
      cx: rect.x + rect.width / 2,
      cy: rect.y + rect.height / 2,
      radius: Number.isFinite(radius) ? Math.min(Math.max(radius, LIGHT_LIMITS.minRadius), LIGHT_LIMITS.maxRadius) : 140,
      intensity: Number.isFinite(intensity) ? Math.min(Math.max(intensity, 0), LIGHT_LIMITS.maxIntensity) : 1,
      color: sanitizeHexColor(component.props?.color, "#ffd9a0"),
      enabled: component.props?.enabled !== false,
    });
  }
  return out;
}

/** The scene's ambient light from the screen styles (clamped 0..1). */
export function ambientOf(styles: PropsMap | undefined): { color: string; intensity: number } {
  const intensity = Number(styles?.ambientIntensity);
  return {
    color: sanitizeHexColor(styles?.ambientColor, "#000010"),
    intensity: Number.isFinite(intensity) ? Math.min(Math.max(intensity, 0), 1) : 1,
  };
}

// ---- Input actions (input abstraction system) ----------------------------------
// Gameplay reasons about ACTION IDs, never physical keys: the binding list is
// the only place a device appears. The default set mirrors the previously
// hardcoded keys exactly, so existing projects (no `inputActions` field) keep
// their behavior with zero migration; every surface (editor, preview,
// published, export) resolves through the helpers below.

/** The action IDs the built-in player controls consume (reserved, stable). */
export const PLAYER_ACTION_LEFT = "move-left";
export const PLAYER_ACTION_RIGHT = "move-right";
export const PLAYER_ACTION_JUMP = "jump";

/** Default action set — identical to the pre-abstraction hardcoded keys. */
export const DEFAULT_INPUT_ACTIONS: ProjectModelInputAction[] = [
  { id: PLAYER_ACTION_LEFT, name: "Move left", keys: ["arrowleft", "a"], enabled: true },
  { id: PLAYER_ACTION_RIGHT, name: "Move right", keys: ["arrowright", "d"], enabled: true },
  { id: PLAYER_ACTION_JUMP, name: "Jump", keys: ["arrowup", "w", " "], enabled: true },
];

/** The screen's input actions (explicit or the default set), model order. */
export function inputActionsOf(screen: ProjectModelScreen | undefined): ProjectModelInputAction[] {
  const actions = screen?.inputActions;
  if (!actions?.length) return DEFAULT_INPUT_ACTIONS;
  // Normalize defensively: keys are lowercase, deduped; disabled stays.
  return actions.map((action) => ({
    id: String(action.id ?? ""),
    name: typeof action.name === "string" ? action.name : action.id,
    keys: [...new Set((action.keys ?? []).map((k) => String(k).toLowerCase()))],
    enabled: action.enabled !== false,
  }));
}

/** Parses a user-typed binding list ("a, arrowleft" → keys) deterministically. */
export function parseInputKeys(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[,;\s]+/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k !== ""),
  )];
}

/** Builds the device key → action-ids index used by the runtimes. */
export function inputKeyIndex(actions: ProjectModelInputAction[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const action of actions) {
    if (!action.enabled) continue;
    for (const key of action.keys) {
      const ids = index.get(key) ?? [];
      ids.push(action.id);
      index.set(key, ids);
    }
  }
  return index;
}

