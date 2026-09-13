import type {
  ProjectModel,
  ProjectModelBlock,
  ProjectModelLogic,
  ProjectModelPoint,
} from "@/types/project";
import { genId } from "./ops";

/**
 * The block vocabulary. Every block type here is real: it has a defined
 * shape, an editor rendering, and a deterministic TypeScript mapping in
 * codegen.ts, and the milestone-4 runtime executes the same set. Nothing is
 * decorative.
 */

export type BlockCategory =
  | "ui"
  | "variables"
  | "control"
  | "navigation"
  | "text"
  | "logic"
  | "audio"
  | "storage"
  | "connectivity"
  | "sensors"
  | "media";

export interface BlockInputSpec {
  key: string;
  /** component/property pick the current screen's real components. */
  kind: "component" | "property" | "screen" | "variable" | "text" | "number" | "boolean";
  label: string;
}

export interface BlockDef {
  type: string;
  kind: "statement" | "expression";
  /** Human phrase; {placeholders} map to inputs/slots for the editor. */
  label: string;
  category: BlockCategory;
  inputs?: BlockInputSpec[];
  slots?: { key: string; label: string }[];
  /** Statements with a nested body (if). */
  container?: boolean;
}

export const STATEMENT_DEFS: BlockDef[] = [
  {
    type: "set-property", kind: "statement", category: "ui",
    label: "set {componentId}.{property} to {value}",
    inputs: [
      { key: "componentId", kind: "component", label: "component" },
      { key: "property", kind: "property", label: "property" },
    ],
    slots: [{ key: "value", label: "value" }],
  },
  {
    type: "set-variable", kind: "statement", category: "variables",
    label: "set variable {name} to {value}",
    inputs: [{ key: "name", kind: "variable", label: "name" }],
    slots: [{ key: "value", label: "value" }],
  },
  {
    type: "change-variable", kind: "statement", category: "variables",
    label: "change variable {name} by {amount}",
    inputs: [{ key: "name", kind: "variable", label: "name" }],
    slots: [{ key: "amount", label: "amount" }],
  },
  {
    type: "show-message", kind: "statement", category: "ui",
    label: "show message {message}",
    slots: [{ key: "message", label: "message" }],
  },
  {
    type: "navigate", kind: "statement", category: "navigation",
    label: "navigate to {screenId}",
    inputs: [{ key: "screenId", kind: "screen", label: "screen" }],
  },
  {
    type: "if", kind: "statement", category: "control", container: true,
    label: "if {condition}",
    slots: [{ key: "condition", label: "condition" }],
  },
  {
    type: "play-sound", kind: "statement", category: "audio",
    label: "play sound {sound}",
    inputs: [{ key: "sound", kind: "text", label: "sound" }],
  },
  {
    type: "stop-sound", kind: "statement", category: "audio",
    label: "stop all sounds",
  },
  {
    type: "tinydb-store", kind: "statement", category: "storage",
    label: "TinyDB save {key} as {value}",
    inputs: [{ key: "key", kind: "text", label: "key" }],
    slots: [{ key: "value", label: "value" }],
  },
  {
    type: "notifier-alert", kind: "statement", category: "ui",
    label: "Notifier show alert {message}",
    slots: [{ key: "message", label: "message" }],
  },
  {
    type: "web-get", kind: "statement", category: "connectivity",
    label: "Web get {url}",
    inputs: [{ key: "url", kind: "text", label: "url" }],
  },
  {
    type: "location-request", kind: "statement", category: "sensors",
    label: "LocationSensor request location",
  },
  {
    type: "tts-speak", kind: "statement", category: "media",
    label: "TextToSpeech speak {message}",
    slots: [{ key: "message", label: "message" }],
  },
  {
    type: "canvas-clear", kind: "statement", category: "media",
    label: "Canvas clear",
  },
  {
    type: "canvas-draw-circle", kind: "statement", category: "media",
    label: "Canvas draw circle x {x} y {y} radius {r} color {color}",
    inputs: [
      { key: "x", kind: "number", label: "x" },
      { key: "y", kind: "number", label: "y" },
      { key: "r", kind: "number", label: "r" },
      { key: "color", kind: "text", label: "color" },
    ],
  },
];

export const EXPRESSION_DEFS: BlockDef[] = [
  {
    type: "text", kind: "expression", category: "text",
    label: '"{value}"',
    inputs: [{ key: "value", kind: "text", label: "text" }],
  },
  {
    type: "number", kind: "expression", category: "text",
    label: "{value}",
    inputs: [{ key: "value", kind: "number", label: "number" }],
  },
  {
    type: "get-property", kind: "expression", category: "ui",
    label: "{componentId}.{property}",
    inputs: [
      { key: "componentId", kind: "component", label: "component" },
      { key: "property", kind: "property", label: "property" },
    ],
  },  {
    type: "get-variable", kind: "expression", category: "variables",
    label: "variable {name}",
    inputs: [{ key: "name", kind: "variable", label: "name" }],
  },
  {
    type: "join", kind: "expression", category: "text",
    label: "join {a} {b}",
    slots: [
      { key: "a", label: "a" },
      { key: "b", label: "b" },
    ],
  },
  {
    type: "boolean", kind: "expression", category: "logic",
    label: "{value}",
    inputs: [{ key: "value", kind: "boolean", label: "value" }],
  },
  {
    type: "equals", kind: "expression", category: "logic",
    label: "{a} equals {b}",
    slots: [
      { key: "a", label: "a" },
      { key: "b", label: "b" },
    ],
  },
  {
    type: "add", kind: "expression", category: "logic",
    label: "{a} + {b}",
    slots: [
      { key: "a", label: "a" },
      { key: "b", label: "b" },
    ],
  },
  {
    type: "tinydb-get", kind: "expression", category: "storage",
    label: "TinyDB value {key}",
    inputs: [{ key: "key", kind: "text", label: "key" }],
  },
  {
    type: "clock-now", kind: "expression", category: "sensors",
    label: "current date & time",
  },
  {
    type: "location-latitude", kind: "expression", category: "sensors",
    label: "LocationSensor latitude",
  },
  {
    type: "location-longitude", kind: "expression", category: "sensors",
    label: "LocationSensor longitude",
  },
];

const defsByType = new Map(
  [...STATEMENT_DEFS, ...EXPRESSION_DEFS].map((def) => [def.type, def]),
);

export function getBlockDef(type: string): BlockDef | undefined {
  return defsByType.get(type);
}

/** Colors per category — consistent with the Ideaven block motif. */
export const CATEGORY_COLORS: Record<BlockCategory, string> = {
  ui: "#8f7bff",
  variables: "#ff7d9c",
  control: "#ffb454",
  navigation: "#58c7f0",
  text: "#46e3b4",
  logic: "#f2c94c",
  audio: "#e879f9",
  storage: "#a3e635",
  connectivity: "#60a5fa",
  sensors: "#fb7185",
  media: "#38bdf8",
};

/** Readable category names for the palette and block tooltips. */
export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  ui: "UI & Looks",
  variables: "Variables",
  control: "Control",
  navigation: "Navigation",
  text: "Text",
  logic: "Logic",
  audio: "Audio",
  storage: "Storage",
  connectivity: "Connectivity",
  sensors: "Sensors",
  media: "Media",
};

/** Create a block of a registry type with neutral defaults (and optional preset inputs). */
export function createBlock(
  type: string,
  preset?: { inputs?: Record<string, string | number | boolean> },
): ProjectModelBlock | undefined {
  const def = getBlockDef(type);
  if (!def) return undefined;
  const block: ProjectModelBlock = { id: genId("b"), kind: def.kind, type };
  if (def.inputs) {
    block.inputs = {};
    for (const input of def.inputs) {
      const presetValue = preset?.inputs?.[input.key];
      if (presetValue !== undefined) {
        block.inputs[input.key] = presetValue;
        continue;
      }
      if (input.kind === "number") block.inputs[input.key] = 0;
      else block.inputs[input.key] = "";
    }
  }
  if (def.slots) block.slots = Object.fromEntries(def.slots.map((s) => [s.key, undefined]));
  if (def.container) block.children = [];
  return block;
}

// ---- operations ----------------------------------------------------------------
// All ops are pure: clone → mutate → return a new model (unchanged on miss).

type Block = ProjectModelBlock;

export function addHandler(
  model: ProjectModel,
  screenId: string,
  componentId: string | null,
  event: string,
  id: string = genId("h"),
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  if (!screen) return model;
  if (!screen.logic) screen.logic = { handlers: [] };
  screen.logic.handlers.push({ id, componentId, event, body: [] });
  return next;
}

export function removeHandler(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  if (!screen?.logic) return model;
  screen.logic.handlers = screen.logic.handlers.filter((h) => h.id !== handlerId);
  return next;
}

export function addVariable(model: ProjectModel, name: string, type: string): ProjectModel {
  if (!name.trim() || model.variables.some((v) => v.name === name.trim())) return model;
  const next = structuredClone(model);
  next.variables.push({ id: genId("v"), name: name.trim(), type });
  return next;
}

export function removeVariable(model: ProjectModel, id: string): ProjectModel {
  const next = structuredClone(model);
  next.variables = next.variables.filter((v) => v.id !== id);
  return next;
}

// ---- block-tree walking ----------------------------------------------------------

interface BlockPath {
  /** The array holding the block (handler body, or a container's children). */
  owner: Block[] | null;
  parent: Block | null;
  index: number;
  block: Block;
}

function walkBlocks(
  blocks: Block[],
  parent: Block | null,
  owner: Block[] | null,
  id: string,
  visit: (hit: BlockPath) => "stop" | "continue",
): "stop" | "continue" {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    if (block.id === id) {
      return visit({ owner, parent, index, block });
    }
    // Statement children.
    if (block.children) {
      const hit = walkBlocks(block.children, block, block.children, id, visit);
      if (hit === "stop") return "stop";
    }
    // Expression slots.
    if (block.slots) {
      for (const [key, slot] of Object.entries(block.slots)) {
        if (!slot) continue;
        const hit = walkBlocks([slot], block, null, id, visit);
        if (hit === "stop") return "stop";
        void key;
      }
    }
  }
  return "continue";
}

export function findBlock(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
): BlockPath | undefined {
  const screen = model.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return undefined;
  let found: BlockPath | undefined;
  walkBlocks(handler.body, null, handler.body, blockId, (hit) => {
    found = hit;
    return "stop";
  });
  return found;
}

/** Insert a statement into a handler body or a container block's branch. */
export function addStatement(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  parentId: string | null,
  index: number,
  block: Block,
  branch: "then" | "else" = "then",
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return model;

  if (parentId === null) {
    const at = Math.max(0, Math.min(index, handler.body.length));
    handler.body.splice(at, 0, block);
    return next;
  }
  const hit = findBlockIn(handler.body, parentId);
  if (!hit || hit.block.kind !== "statement") return model;
  const def = getBlockDef(hit.block.type);
  if (!def?.container) return model;
  if (branch === "else") {
    if (!hit.block.elseChildren) hit.block.elseChildren = [];
    const at = Math.max(0, Math.min(index, hit.block.elseChildren.length));
    hit.block.elseChildren.splice(at, 0, block);
    return next;
  }
  if (!hit.block.children) hit.block.children = [];
  const at = Math.max(0, Math.min(index, hit.block.children.length));
  hit.block.children.splice(at, 0, block);
  return next;
}

function findBlockIn(blocks: Block[], id: string): { block: Block; children: Block[] } | undefined {
  for (const block of blocks) {
    if (block.id === id) return { block, children: block.children ?? [] };
    const inChildren = block.children ? findBlockIn(block.children, id) : undefined;
    if (inChildren) return inChildren;
    const inElse = block.elseChildren ? findBlockIn(block.elseChildren, id) : undefined;
    if (inElse) return inElse;
    if (block.slots) {
      for (const slot of Object.values(block.slots)) {
        if (!slot) continue;
        const inSlot = findBlockIn([slot], id);
        if (inSlot) return inSlot;
      }
    }
  }
  return undefined;
}

/** Walk every statement body of a block: then + else branches. */
function bodiesOf(block: Block): Block[][] {
  const bodies: Block[][] = [];
  if (block.children) bodies.push(block.children);
  if (block.elseChildren) bodies.push(block.elseChildren);
  return bodies;
}

export function removeBlock(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return model;

  const removeFrom = (blocks: Block[]): boolean => {
    const at = blocks.findIndex((b) => b.id === blockId);
    if (at !== -1) {
      blocks.splice(at, 1);
      return true;
    }
    return blocks.some((b) => bodiesOf(b).some(removeFrom));
  };
  removeFrom(handler.body);
  return next;
}

/** Move a statement one slot up/down among its siblings. */
export function moveStatement(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
  direction: -1 | 1,
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return model;

  const moveIn = (blocks: Block[]): boolean => {
    const at = blocks.findIndex((b) => b.id === blockId);
    if (at !== -1) {
      const target = at + direction;
      if (target < 0 || target >= blocks.length) return true;
      const [moved] = blocks.splice(at, 1);
      if (moved) blocks.splice(target, 0, moved);
      return true;
    }
    return blocks.some((b) => bodiesOf(b).some(moveIn));
  };
  moveIn(handler.body);
  return next;
}

/** Set or clear one expression slot on a block. */
export function setSlot(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
  slotKey: string,
  expr: Block | null,
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return model;

  const hit = findBlockIn(handler.body, blockId);
  if (!hit) return model;
  if (!hit.block.slots) hit.block.slots = {};
  hit.block.slots[slotKey] = expr ?? undefined;
  if (expr === null) delete hit.block.slots[slotKey];
  return next;
}

/** Set one literal/reference input on a block. */
export function setBlockInput(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
  key: string,
  value: string | number | boolean,
): ProjectModel {
  const next = structuredClone(model);
  const screen = next.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return model;
  const hit = findBlockIn(handler.body, blockId);
  if (!hit) return model;
  if (!hit.block.inputs) hit.block.inputs = {};
  hit.block.inputs[key] = value;
  return next;
}

// ---- canvas layout (Blocks mode free canvas) ------------------------------------------
// The canvas is a free workspace: every handler script and parked run keeps a
// persisted position, blocks can be detached (parked) and re-attached, and a
// drag that grabs an attached statement carries the run below it (Scratch
// semantics). Positions are canvas px at zoom 1, saved on the canonical model.
// Parked runs are drafts: they are never code-generated or executed.

/** Where a statement run should insert: a handler body or a container branch. */
export interface StackTarget {
  handlerId: string;
  parentId: string | null;
  branch: "then" | "else";
  index: number;
}

/** An attached statement run plus where it currently lives. */
export interface RunLocation {
  handlerId: string;
  parentId: string | null;
  branch: "then" | "else";
  index: number;
  /** The grabbed block and every sibling below it in the same array. */
  run: Block[];
  owner: Block[];
}

function branchOfHit(hit: { parent: Block | null; owner: Block[] | null }): "then" | "else" {
  if (!hit.parent) return "then";
  return hit.owner != null && hit.owner === hit.parent.elseChildren ? "else" : "then";
}

/** Locate an attached statement run (grabbed block + siblings below) in a handler. */
export function locateRun(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
): RunLocation | undefined {
  const screen = model.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === handlerId);
  if (!handler) return undefined;
  let found: RunLocation | undefined;
  walkBlocks(handler.body, null, handler.body, blockId, (hit) => {
    if (!hit.owner) return "continue";
    found = {
      handlerId,
      parentId: hit.parent?.id ?? null,
      branch: branchOfHit(hit),
      index: hit.index,
      run: hit.owner.slice(hit.index),
      owner: hit.owner,
    };
    return "stop";
  });
  return found;
}

function sanitizePoint(x: number, y: number): ProjectModelPoint {
  const clamp = (value: number) =>
    Number.isFinite(value) ? Math.round(Math.max(-1_000_000, Math.min(1_000_000, value))) : 0;
  return { x: clamp(x), y: clamp(y) };
}

function logicOf(next: ProjectModel, screenId: string): ProjectModelLogic | undefined {
  const screen = next.screens.find((s) => s.id === screenId);
  if (!screen) return undefined;
  if (!screen.logic) screen.logic = { handlers: [] };
  return screen.logic;
}

function setPoint(logic: ProjectModelLogic, key: string, x: number, y: number): void {
  if (!logic.positions) logic.positions = {};
  logic.positions[key] = sanitizePoint(x, y);
}

/** Resolve the array a stack target points at (initializing container branches). */
function targetArray(next: ProjectModel, screenId: string, target: StackTarget): Block[] | undefined {
  const screen = next.screens.find((s) => s.id === screenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === target.handlerId);
  if (!handler) return undefined;
  if (target.parentId === null) return handler.body;
  const hit = findBlockIn(handler.body, target.parentId);
  if (!hit || hit.block.kind !== "statement") return undefined;
  const def = getBlockDef(hit.block.type);
  if (!def?.container) return undefined;
  if (target.branch === "else") {
    if (!hit.block.elseChildren) hit.block.elseChildren = [];
    return hit.block.elseChildren;
  }
  if (!hit.block.children) hit.block.children = [];
  return hit.block.children;
}

/**
 * Move an attached statement run to a stack target — reorder within a stack,
 * move between arms/handlers of the screen, or re-nest. Rejects dropping a
 * container into its own run and unknown targets (returns the model untouched).
 */
export function moveRun(
  model: ProjectModel,
  screenId: string,
  sourceHandlerId: string,
  blockId: string,
  target: StackTarget,
): ProjectModel {
  const hit = locateRun(model, screenId, sourceHandlerId, blockId);
  if (!hit) return model;
  const runIds = new Set(hit.run.map((block) => block.id));
  if (target.parentId !== null && runIds.has(target.parentId)) return model; // into itself

  const next = structuredClone(model);
  const source = locateRun(next, screenId, sourceHandlerId, blockId);
  if (!source) return model;
  const sourceOwner = source.owner;
  const sourceIndex = source.index;
  const removed = source.run;
  sourceOwner.splice(sourceIndex, removed.length);

  const arr = targetArray(next, screenId, target);
  if (!arr) return model;
  let at = target.index;
  if (arr === sourceOwner && sourceIndex < target.index) at = target.index - removed.length;
  at = Math.max(0, Math.min(at, arr.length));
  arr.splice(at, 0, ...removed);
  return next;
}

/** Detach a statement run from its stack and park it freely at (x, y). */
export function parkRun(
  model: ProjectModel,
  screenId: string,
  sourceHandlerId: string,
  blockId: string,
  x: number,
  y: number,
): ProjectModel {
  const hit = locateRun(model, screenId, sourceHandlerId, blockId);
  if (!hit) return model;
  const next = structuredClone(model);
  const source = locateRun(next, screenId, sourceHandlerId, blockId);
  if (!source) return model;
  const removed = source.run;
  source.owner.splice(source.index, removed.length);
  const logic = logicOf(next, screenId);
  if (!logic) return model;
  if (!logic.parked) logic.parked = [];
  logic.parked.push(removed);
  setPoint(logic, removed[0]!.id, x, y);
  return next;
}

/**
 * Split a parked run at `offset` (the tail from offset becomes its own run at
 * (x, y)). Grabbing a block that is not the first of a parked run splits it —
 * the tail follows the pointer, the head stays behind.
 */
export function splitParkedRun(
  model: ProjectModel,
  screenId: string,
  leadBlockId: string,
  offset: number,
  x: number,
  y: number,
): ProjectModel {
  const screen = model.screens.find((s) => s.id === screenId);
  const parked = screen?.logic?.parked;
  if (!parked) return model;
  const runIndex = parked.findIndex((run) => run[0]?.id === leadBlockId);
  const run = runIndex !== -1 ? parked[runIndex] : undefined;
  if (!run || offset <= 0 || offset >= run.length) return model;
  const next = structuredClone(model);
  const nextParked = next.screens.find((s) => s.id === screenId)!.logic!.parked!;
  const sourceRun = nextParked[runIndex]!;
  const tail = sourceRun.splice(offset);
  nextParked.push(tail);
  setPoint(next.screens.find((s) => s.id === screenId)!.logic!, tail[0]!.id, x, y);
  return next;
}

/** Move a parked run to (x, y). */
export function moveParked(
  model: ProjectModel,
  screenId: string,
  leadBlockId: string,
  x: number,
  y: number,
): ProjectModel {
  const screen = model.screens.find((s) => s.id === screenId);
  if (!screen?.logic?.parked?.some((run) => run[0]?.id === leadBlockId)) return model;
  const next = structuredClone(model);
  const logic = next.screens.find((s) => s.id === screenId)!.logic!;
  setPoint(logic, leadBlockId, x, y);
  return next;
}

/** Attach a parked run into a stack target (the whole run, in order). */
export function attachParked(
  model: ProjectModel,
  screenId: string,
  leadBlockId: string,
  target: StackTarget,
): ProjectModel {
  const screen = model.screens.find((s) => s.id === screenId);
  const parked = screen?.logic?.parked;
  if (!parked) return model;
  const runIndex = parked.findIndex((run) => run[0]?.id === leadBlockId);
  if (runIndex === -1) return model;
  // Validate the target against the untouched model first (pure on miss).
  if (!targetArray(model, screenId, target)) return model;

  const next = structuredClone(model);
  const logic = next.screens.find((s) => s.id === screenId)!.logic!;
  const [run] = logic.parked!.splice(runIndex, 1);
  const arr = targetArray(next, screenId, target);
  if (!arr || !run) return model;
  const at = Math.max(0, Math.min(target.index, arr.length));
  arr.splice(at, 0, ...run);
  if (logic.positions) delete logic.positions[leadBlockId];
  if (logic.parked?.length === 0) delete logic.parked;
  return next;
}

/** Park a brand-new block (e.g. dropped from the palette onto free canvas). */
export function addParked(
  model: ProjectModel,
  screenId: string,
  block: Block,
  x: number,
  y: number,
): ProjectModel {
  const next = structuredClone(model);
  const logic = logicOf(next, screenId);
  if (!logic) return model;
  if (!logic.parked) logic.parked = [];
  logic.parked.push([block]);
  setPoint(logic, block.id, x, y);
  return next;
}

/** Delete a parked run. */
export function removeParked(model: ProjectModel, screenId: string, leadBlockId: string): ProjectModel {
  const screen = model.screens.find((s) => s.id === screenId);
  const parked = screen?.logic?.parked;
  if (!parked?.some((run) => run[0]?.id === leadBlockId)) return model;
  const next = structuredClone(model);
  const logic = next.screens.find((s) => s.id === screenId)!.logic!;
  logic.parked = logic.parked!.filter((run) => run[0]?.id !== leadBlockId);
  if (logic.parked.length === 0) delete logic.parked;
  if (logic.positions) delete logic.positions[leadBlockId];
  return next;
}

/** Deep-clone a block subtree with fresh IDs (slots, children, else-branch). */
function reidBlock(block: Block): Block {
  const copy: Block = JSON.parse(JSON.stringify(block));
  const walk = (node: Block): void => {
    node.id = genId("b");
    if (node.slots) {
      for (const [key, slot] of Object.entries(node.slots)) {
        if (slot) walk(slot);
        else delete node.slots![key];
      }
    }
    if (node.children) node.children.forEach(walk);
    if (node.elseChildren) node.elseChildren.forEach(walk);
  };
  walk(copy);
  return copy;
}

/** Duplicate an attached statement (with its subtree) right below itself. */
export function duplicateAttached(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  blockId: string,
): ProjectModel {
  const hit = findBlock(model, screenId, handlerId, blockId);
  if (!hit || !hit.owner) return model;
  const copy = reidBlock(hit.block);
  const next = structuredClone(model);
  const again = findBlock(next, screenId, handlerId, blockId);
  if (!again || !again.owner) return model;
  again.owner.splice(again.index + 1, 0, copy);
  return next;
}

/** Duplicate a parked run beside itself (offset +24px). */
export function duplicateParked(model: ProjectModel, screenId: string, leadBlockId: string): ProjectModel {
  const screen = model.screens.find((s) => s.id === screenId);
  const parked = screen?.logic?.parked;
  const runIndex = parked?.findIndex((run) => run[0]?.id === leadBlockId) ?? -1;
  if (runIndex === -1) return model;
  const next = structuredClone(model);
  const logic = next.screens.find((s) => s.id === screenId)!.logic!;
  const sourceRun = logic.parked![runIndex]!;
  const copy = sourceRun.map(reidBlock);
  logic.parked!.splice(runIndex + 1, 0, copy);
  const origin = logic.positions?.[leadBlockId];
  setPoint(logic, copy[0]!.id, (origin?.x ?? 0) + 28, (origin?.y ?? 0) + 28);
  return next;
}

/** Persist the canvas position of one handler script. */
export function setScriptPosition(
  model: ProjectModel,
  screenId: string,
  handlerId: string,
  x: number,
  y: number,
): ProjectModel {
  const screen = model.screens.find((s) => s.id === screenId);
  if (!screen?.logic?.handlers.some((h) => h.id === handlerId)) return model;
  const next = structuredClone(model);
  setPoint(next.screens.find((s) => s.id === screenId)!.logic!, handlerId, x, y);
  return next;
}
