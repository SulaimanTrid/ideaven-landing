import type { ProjectModel, ProjectModelBlock } from "@/types/project";
import { genId } from "./ops";

/**
 * The block vocabulary. Every block type here is real: it has a defined
 * shape, an editor rendering, and a deterministic TypeScript mapping in
 * codegen.ts, and the milestone-4 runtime executes the same set. Nothing is
 * decorative.
 */

export type BlockCategory = "ui" | "variables" | "control" | "navigation" | "text" | "logic";

export interface BlockInputSpec {
  key: string;
  /** component/property pick the current screen's real components. */
  kind: "component" | "property" | "screen" | "variable" | "text" | "number";
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
    label: "set {component}.{property} to {value}",
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
  },
  {
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
};

/** Create a block of a registry type with neutral defaults. */
export function createBlock(type: string): ProjectModelBlock | undefined {
  const def = getBlockDef(type);
  if (!def) return undefined;
  const block: ProjectModelBlock = { id: genId("b"), kind: def.kind, type };
  if (def.inputs) {
    block.inputs = {};
    for (const input of def.inputs) {
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
