import type { AIOperation, ProjectModel } from "@/types/project";
import {
  addScreen,
  genId,
  insertComponent,
  locateComponent,
  newComponent,
  removeComponent,
  setScreenCode,
  setStartScreen,
  updateComponent,
} from "@/lib/project-model/ops";
import { removeHandler, setBlockInput } from "@/lib/project-model/blocks";
import { getDef } from "@/lib/project-model/registry";
import { ValidateModelClient } from "@/lib/project-model/ai-validate";

/**
 * Applies a validated AI operation changeset to the model in one pure pass.
 * The result is a single undoable commit: "Undo AI change" reverts the whole
 * operation set atomically. Operations referencing unknown IDs are skipped
 * and reported — a partial changeset never corrupts the model.
 */

export type { AIOperation };

export interface AIApplyResult {
  model: ProjectModel;
  applied: string[];
  skipped: { op: AIOperation; reason: string }[];
}

/** Client-side component types the AI may create (mirrors the registry). */
const KNOWN_TYPES = new Set([
  "column", "row", "container", "card", "spacer", "divider",
  "text", "button", "icon", "image", "text-input", "password-input", "checkbox", "switch",
]);

/** Refs the AI declared while applying this changeset ("ref:name" → real ID). */
type RefMap = Map<string, string>;

function resolveId(raw: string | undefined, refs: RefMap): string | null {
  if (!raw) return null;
  if (raw.startsWith("ref:")) {
    const ref = refs.get(raw.slice(4));
    return ref ?? null;
  }
  return raw;
}

export function applyAIOperations(
  model: ProjectModel,
  operations: AIOperation[],
): AIApplyResult {
  let current = structuredClone(model);
  const applied: string[] = [];
  const skipped: { op: AIOperation; reason: string }[] = [];
  const refs: RefMap = new Map();

  for (const op of operations) {
    switch (op.op) {
      case "createScreen": {
        const name = (op.name ?? "").trim();
        if (!name) { skipped.push({ op, reason: "missing name" }); break; }
        current = addScreen(current, name);
        const created = current.screens[current.screens.length - 1];
        if (op.ref && created) refs.set(op.ref, created.id);
        applied.push(`Created screen “${created?.name ?? name}”`);
        break;
      }
      case "setStartScreen": {
        const id = resolveId(op.screenId, refs);
        if (!id || !current.screens.some((s) => s.id === id)) {
          skipped.push({ op, reason: "unknown screen" });
          break;
        }
        current = setStartScreen(current, id);
        applied.push("Set the start screen");
        break;
      }
      case "createComponent": {
        const type = (op.componentType ?? "").trim();
        const screenId = resolveId(op.screenId, refs);
        if (!KNOWN_TYPES.has(type) || !screenId) {
          skipped.push({ op, reason: "unknown type or screen" });
          break;
        }
        const screen = current.screens.find((s) => s.id === screenId);
        if (!screen) { skipped.push({ op, reason: "unknown screen" }); break; }

        const node = newComponent(type);
        if (!node) { skipped.push({ op, reason: "unknown type" }); break; }
        if (op.props) node.props = { ...(node.props ?? {}), ...sanitizeMap(op.props) };
        if (op.styles) node.styles = { ...(node.styles ?? {}), ...sanitizeMap(op.styles) };

        const parentId = op.parentId ? resolveId(op.parentId, refs) : null;
        if (parentId !== null) {
          const parent = locateComponent(current, parentId);
          if (!parent || !getDef(parent.node.type)?.container) {
            skipped.push({ op, reason: "parent is missing or not a container" });
            break;
          }
          const siblings = parent.node.children ?? [];
          const index = clampIndex(op.index, siblings.length);
          current = insertComponent(current, screenId, parentId, index, node);
        } else {
          const index = clampIndex(op.index, screen.components.length);
          current = insertComponent(current, screenId, null, index, node);
        }
        if (op.ref) refs.set(op.ref, node.id);
        applied.push(`Added ${getDef(type)?.label ?? type}`);
        break;
      }
      case "updateComponent": {
        const componentId = resolveId(op.componentId, refs);
        const location = componentId ? locateComponent(current, componentId) : undefined;
        if (!componentId || !location) {
          skipped.push({ op, reason: "unknown component" });
          break;
        }
        // props and styles stay separate maps — a key collision can never
        // clobber the other side. Keys are routed by registry membership so
        // a style key mistakenly sent under props still lands correctly.
        const def = getDef(location.node.type);
        const propsPatch: Record<string, string | number | boolean> = {};
        const stylesPatch: Record<string, string | number | boolean> = {};
        const route = (key: string, value: string | number | boolean, preferred: "prop" | "style") => {
          const isProp = def?.propFields.some((f) => f.key === key) ?? false;
          const isStyle = def?.styleFields.some((f) => f.key === key) ?? false;
          if (preferred === "prop" && isStyle && !isProp) stylesPatch[key] = value;
          else if (preferred === "style" && isProp && !isStyle) propsPatch[key] = value;
          else if (preferred === "prop") propsPatch[key] = value;
          else stylesPatch[key] = value;
        };
        for (const [key, value] of Object.entries(op.props ? sanitizeMap(op.props) : {})) {
          route(key, value, "prop");
        }
        for (const [key, value] of Object.entries(op.styles ? sanitizeMap(op.styles) : {})) {
          route(key, value, "style");
        }
        if (Object.keys(propsPatch).length === 0 && Object.keys(stylesPatch).length === 0) {
          skipped.push({ op, reason: "nothing to update" });
          break;
        }
        current = updateComponent(current, componentId, {
          props: Object.keys(propsPatch).length ? propsPatch : undefined,
          styles: Object.keys(stylesPatch).length ? stylesPatch : undefined,
        });
        applied.push("Updated a component");
        break;
      }
      case "deleteComponent": {
        const componentId = resolveId(op.componentId, refs);
        if (!componentId || !locateComponent(current, componentId)) {
          skipped.push({ op, reason: "unknown component" });
          break;
        }
        current = removeComponent(current, componentId);
        applied.push("Deleted a component");
        break;
      }
      case "createVariable": {
        const name = (op.variableName ?? "").trim();
        if (!name || current.variables.some((v) => v.name === name)) {
          skipped.push({ op, reason: "missing or duplicate name" });
          break;
        }
        current = structuredClone(current);
        current.variables.push({ id: genId("v"), name, type: op.variableType ?? "text" });
        applied.push(`Created variable “${name}”`);
        break;
      }
      case "deleteVariable": {
        const name = (op.variableName ?? "").trim();
        const variable = current.variables.find((v) => v.name === name);
        if (!variable) { skipped.push({ op, reason: "unknown variable" }); break; }
        current = structuredClone(current);
        current.variables = current.variables.filter((v) => v.id !== variable.id);
        applied.push(`Deleted variable “${name}”`);
        break;
      }
      case "setScreenCode": {
        const screenId = resolveId(op.screenId, refs);
        if (!screenId || !current.screens.some((s) => s.id === screenId)) {
          skipped.push({ op, reason: "unknown screen" });
          break;
        }
        if (!op.code || !op.code.includes("api.on")) {
          skipped.push({ op, reason: "code does not register any handlers" });
          break;
        }
        current = setScreenCode(current, screenId, op.code);
        applied.push("Wrote screen code (custom logic)");
        break;
      }
      case "deleteHandler": {
        const screenId = resolveId(op.screenId, refs);
        const handlerId = (op.handlerId ?? "").trim();
        const screen = screenId ? current.screens.find((s) => s.id === screenId) : undefined;
        if (!screen || !handlerId || !screen.logic?.handlers.some((h) => h.id === handlerId)) {
          skipped.push({ op, reason: "unknown screen or handler" });
          break;
        }
        current = removeHandler(current, screen.id, handlerId);
        applied.push("Removed a broken handler");
        break;
      }
      case "updateBlockInput": {
        const screenId = resolveId(op.screenId, refs);
        const handlerId = (op.handlerId ?? "").trim();
        const blockId = (op.blockId ?? "").trim();
        const input = (op.input ?? "").trim();
        if (!screenId || !handlerId || !blockId || !input) {
          skipped.push({ op, reason: "missing screen, handler, block or input" });
          break;
        }
        if (typeof op.value !== "string" && typeof op.value !== "number" && typeof op.value !== "boolean") {
          skipped.push({ op, reason: "value must be a string, number or boolean" });
          break;
        }
        const screen = current.screens.find((s) => s.id === screenId);
        if (!screen?.logic?.handlers.some((h) => h.id === handlerId)) {
          skipped.push({ op, reason: "unknown screen or handler" });
          break;
        }
        // setBlockInput returns the untouched input object on a miss —
        // reference equality is the no-op signal.
        const result = setBlockInput(current, screenId, handlerId, blockId, input, op.value);
        if (result === current) {
          skipped.push({ op, reason: "unknown block" });
          break;
        }
        current = result;
        applied.push(`Retargeted “${input}” on a block`);
        break;
      }
      default:
        skipped.push({ op, reason: `unknown operation ${op.op}` });
    }
  }

  // Structural safety net: if the result is not a valid model, refuse it all.
  if (!ValidateModelClient(current)) {
    return { model, applied: [], skipped: [{ op: { op: "changeset" }, reason: "resulting model failed validation" }] };
  }

  return { model: current, applied, skipped };
}

function sanitizeMap(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

function clampIndex(index: number | undefined, length: number): number {
  if (typeof index !== "number" || Number.isNaN(index)) return length;
  return Math.max(0, Math.min(index, length));
}
