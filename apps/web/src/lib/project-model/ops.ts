import type {
  ProjectModel,
  ProjectModelComponent,
  ProjectModelHandler,
  ProjectModelLogic,
  ProjectModelScreen,
  PropsMap,
} from "@/types/project";
import { getDef } from "./registry";

/**
 * Pure, immutable operations on the canonical Project Model. Every builder
 * action — canvas, tree, inspector, and later AI mutations — goes through
 * these functions so all surfaces share one set of invariants: unique IDs,
 * valid hierarchy, and an existing start screen.
 */

type Component = ProjectModelComponent;

/** A partial props/styles patch; `undefined` removes the key. */
export type PropsPatch = Record<string, string | number | boolean | undefined>;

/** Readable, collision-resistant IDs: <prefix>-<6 hex>. */
export function genId(prefix: string): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

// ---- lookup -----------------------------------------------------------------

export function findScreen(model: ProjectModel, screenId: string): ProjectModelScreen | undefined {
  return model.screens.find((screen) => screen.id === screenId);
}

export interface ComponentLocation {
  node: Component;
  parent: Component | null;
  screen: ProjectModelScreen;
  index: number;
}

/** Find a component anywhere in the model and where it lives. */
export function locateComponent(model: ProjectModel, id: string): ComponentLocation | undefined {
  for (const screen of model.screens) {
    const visit = (nodes: Component[], parent: Component | null): ComponentLocation | undefined => {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (!node) continue;
        if (node.id === id) return { node, parent, screen, index };
        const nested = visit(node.children ?? [], node);
        if (nested) return nested;
      }
      return undefined;
    };
    const found = visit(screen.components, null);
    if (found) return found;
  }
  return undefined;
}

/** True when `candidateId` is `node` itself or one of its descendants. */
export function containsComponent(node: Component, candidateId: string): boolean {
  if (node.id === candidateId) return true;
  return (node.children ?? []).some((child) => containsComponent(child, candidateId));
}

function nodesOf(model: ProjectModel, screenId: string, parentId: string | null): Component[] | undefined {
  const screen = findScreen(model, screenId);
  if (!screen) return undefined;
  if (parentId === null) return screen.components;
  return locateComponent(model, parentId)?.node.children;
}

// ---- creation -----------------------------------------------------------------

/** Build a fresh component of a registry type with its defaults. */
export function newComponent(type: string): Component | undefined {
  const def = getDef(type);
  if (!def) return undefined;
  return {
    id: genId(`c-${type}`),
    type,
    props: { ...def.defaultProps },
    styles: { ...def.defaultStyles },
    ...(def.container ? { children: [] as Component[] } : {}),
  };
}

/** Insert `node` under parentId (null = screen root) at index. */
export function insertComponent(
  model: ProjectModel,
  screenId: string,
  parentId: string | null,
  index: number,
  node: Component,
): ProjectModel {
  const next = clone(model);
  const nodes = nodesOf(next, screenId, parentId);
  if (!nodes) return model;
  const at = Math.max(0, Math.min(index, nodes.length));
  nodes.splice(at, 0, node);
  return next;
}

export function removeComponent(model: ProjectModel, id: string): ProjectModel {
  const next = clone(model);
  for (const screen of next.screens) {
    const visit = (nodes: Component[]): boolean => {
      const at = nodes.findIndex((node) => node.id === id);
      if (at !== -1) {
        nodes.splice(at, 1);
        return true;
      }
      return nodes.some((node) => visit(node.children ?? []));
    };
    if (visit(screen.components)) return next;
  }
  return model;
}

/**
 * Move a component to a new parent/index. Guarded: a node cannot be moved
 * into itself or one of its descendants, and the target must exist.
 */
export function moveComponent(
  model: ProjectModel,
  id: string,
  screenId: string,
  parentId: string | null,
  index: number,
): ProjectModel {
  const location = locateComponent(model, id);
  if (!location) return model;

  // Guard: the new parent chain must not include the moving node.
  if (parentId !== null) {
    const target = locateComponent(model, parentId);
    if (!target) return model;
    if (containsComponent(location.node, parentId)) return model;
  }

  const removed = removeComponent(model, id);

  // Same-parent moves: removing the node first shifts later indices down.
  const sameParent =
    location.screen.id === screenId &&
    (location.parent === null ? parentId === null : location.parent.id === parentId);

  let at = index;
  if (sameParent && location.index < index) at = Math.max(0, index - 1);

  const next = insertComponent(removed, screenId, parentId, at, location.node);
  return next;
}

/** Duplicate a component (and its whole subtree) as the next sibling. */
export function duplicateComponent(model: ProjectModel, id: string): ProjectModel {
  const location = locateComponent(model, id);
  if (!location) return model;

  const copy = clone(location.node);
  const reid = (node: Component): Component => ({
    ...node,
    id: genId(`c-${node.type}`),
    children: node.children?.map(reid),
  });
  const fresh = reid(copy);

  const next = clone(model);
  const target = locateComponent(next, id);
  if (!target) return model;
  const siblings = target.parent ? target.parent.children! : target.screen.components;
  siblings.splice(target.index + 1, 0, fresh);
  return next;
}

export interface ComponentUpdate {
  props?: PropsPatch;
  styles?: PropsPatch;
}

/** Merge a partial props/styles patch into one component; undefined clears. */
export function updateComponent(model: ProjectModel, id: string, update: ComponentUpdate): ProjectModel {
  const next = clone(model);
  const target = locateComponent(next, id);
  if (!target) return model;
  const merge = (base: PropsMap | undefined, patch: PropsPatch | undefined): PropsMap | undefined => {
    if (!patch) return base;
    const merged: PropsMap = { ...(base ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    return merged;
  };
  const props = merge(target.node.props, update.props);
  if (props) target.node.props = props;
  const styles = merge(target.node.styles, update.styles);
  if (styles) target.node.styles = styles;
  return next;
}

/** Merges a partial preview-settings patch into one undoable model step. */
export function updatePreviewSettings(
  model: ProjectModel,
  patch: NonNullable<ProjectModel["settings"]["preview"]>,
): ProjectModel {
  const next = clone(model);
  const current = next.settings.preview ?? {};
  next.settings.preview = { ...current, ...patch };
  return next;
}

// ---- screens ------------------------------------------------------------------

export function addScreen(model: ProjectModel, name: string): ProjectModel {
  const next = clone(model);
  const trimmed = name.trim() || `Screen ${next.screens.length + 1}`;
  const screen: ProjectModelScreen = { id: genId("screen"), name: trimmed, components: [] };
  next.screens.push(screen);
  return next;
}

export function renameScreen(model: ProjectModel, screenId: string, name: string): ProjectModel {
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (screen) screen.name = name.trim() || screen.name;
  return next;
}

export function deleteScreen(model: ProjectModel, screenId: string): ProjectModel {
  if (model.screens.length <= 1) return model;
  const next = clone(model);
  next.screens = next.screens.filter((screen) => screen.id !== screenId);
  const first = next.screens[0];
  if (next.navigation.startScreenId === screenId && first) {
    next.navigation.startScreenId = first.id;
  }
  return next;
}

export function setStartScreen(model: ProjectModel, screenId: string): ProjectModel {
  if (!findScreen(model, screenId)) return model;
  const next = clone(model);
  next.navigation.startScreenId = screenId;
  return next;
}

export function updateScreenStyles(
  model: ProjectModel,
  screenId: string,
  patch: PropsPatch,
): ProjectModel {
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  const merged: PropsMap = { ...(screen.styles ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  screen.styles = merged;
  return next;
}

/** Store (or clear) the screen's custom source code. */
export function setScreenCode(model: ProjectModel, screenId: string, code: string | null): ProjectModel {
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  if (code === null) delete screen.code;
  else screen.code = code;
  return next;
}

/** Replace a screen's whole handler program (code→model sync). */
export function replaceScreenLogic(
  model: ProjectModel,
  screenId: string,
  handlers: ProjectModelHandler[],
): ProjectModel {
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  screen.logic = { handlers };
  return next;
}

/**
 * Commit a successful code→blocks sync: install the parsed handlers and
 * clear any custom code — the screen returns to the VISUAL state in one
 * undoable change.
 */
export function applyCodeSync(
  model: ProjectModel,
  screenId: string,
  handlers: ProjectModelHandler[],
): ProjectModel {
  const replaced = replaceScreenLogic(model, screenId, handlers);
  return setScreenCode(replaced, screenId, null);
}
