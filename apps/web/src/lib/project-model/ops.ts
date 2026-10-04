import type {
  ProjectModel,
  ProjectModelComponent,
  ProjectModelHandler,
  ProjectModelInputAction,
  ProjectModelLogic,
  ProjectModelScreen,
  ProjectModelSortingLayer,
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

// ---- 3D hierarchy (TASK 53) -----------------------------------------------------
// The canonical relationship is `component.props.parentId`; child lists are
// derived. These ops keep the semantics explicit and guarded.

/** All 3D entities (transform-bearing components) of one screen, flat. */
function screen3DEntities(model: ProjectModel, screenId: string): Component[] {
  const screen = findScreen(model, screenId);
  if (!screen) return [];
  const out: Component[] = [];
  const visit = (nodes: Component[]) => {
    for (const node of nodes) {
      if (typeof node.props?.px === "number") out.push(node);
      visit(node.children ?? []);
    }
  };
  visit(screen.components);
  return out;
}

/** Reparents a 3D entity. Guards: entity exists, parent exists (or null),
 * not self, not a descendant — cycles are impossible through this op. */
export function setParent3D(
  model: ProjectModel,
  screenId: string,
  id: string,
  parentId: string | null,
): ProjectModel {
  const entities = screen3DEntities(model, screenId);
  const entity = entities.find((c) => c.id === id);
  if (!entity) return model;
  if (parentId === id) return model;
  if (parentId !== null && !entities.some((c) => c.id === parentId)) return model;
  if (parentId !== null) {
    // Walk the proposed parent's chain — reaching `id` would create a cycle.
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return model;
      if (seen.has(cursor)) return model;
      seen.add(cursor);
      const parent = entities.find((c) => c.id === cursor);
      const raw = parent?.props?.parentId;
      cursor = typeof raw === "string" && raw !== "" ? raw : null;
    }
  }
  const next = clone(model);
  const screen = findScreen(next, screenId);
  const target = screen ? locateComponent(next, id) : undefined;
  if (!screen || !target) return model;
  target.node.props = { ...(target.node.props ?? {}), parentId: parentId ?? "" };
  if (!parentId) delete target.node.props.parentId;
  return next;
}

/**
 * Duplicates a 3D entity WITH its descendant subtree (parentId-based): every
 * clone gets a fresh id and parent references are remapped to the clones, so
 * the copied hierarchy is internally identical. Clones are appended at the
 * root level; the clone of the duplicated entity keeps the original's
 * parentId?? No — clones are roots (the copy is standalone).
 */
export function duplicateHierarchy3D(
  model: ProjectModel,
  screenId: string,
  id: string,
): ProjectModel {
  const entities = screen3DEntities(model, screenId);
  const entity = entities.find((c) => c.id === id);
  if (!entity) return model;
  // Collect the subtree (entity + descendants, cycle-safe).
  const subtreeIds = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of entities) {
      const raw = candidate.props?.parentId;
      const parent = typeof raw === "string" ? raw : "";
      if (subtreeIds.has(parent) && !subtreeIds.has(candidate.id)) {
        subtreeIds.add(candidate.id);
        grew = true;
      }
    }
  }
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  const idRemap = new Map<string, string>();
  for (const source of entities.filter((e) => subtreeIds.has(e.id))) {
    idRemap.set(source.id, genId(`c-${source.type}`));
  }
  for (const source of entities.filter((e) => subtreeIds.has(e.id))) {
    const props = { ...(source.props ?? {}) };
    const rawParent = typeof props.parentId === "string" ? props.parentId : "";
    // Remap parents inside the subtree; the duplicated root becomes a root.
    props.parentId = idRemap.has(rawParent) ? idRemap.get(rawParent)! : "";
    screen.components.push({
      id: idRemap.get(source.id)!,
      type: source.type,
      props,
      styles: source.styles ? { ...source.styles } : undefined,
      children: undefined,
    });
  }
  return next;
}

/**
 * Deletes a 3D entity: its children are REPARENTED to the deleted entity's
 * parent (never orphaned, never silently destroyed) — the explicit,
 * documented delete behavior for the 3D hierarchy.
 */
export function removeComponent3D(model: ProjectModel, screenId: string, id: string): ProjectModel {
  const entities = screen3DEntities(model, screenId);
  const entity = entities.find((c) => c.id === id);
  if (!entity) return model;
  const rawParent = entity.props?.parentId;
  const grandparentId = typeof rawParent === "string" && rawParent !== "" ? rawParent : "";
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  const reparent = (nodes: Component[]) => {
    for (const node of nodes) {
      if (typeof node.props?.parentId === "string" && node.props.parentId === id) {
        node.props = { ...node.props, parentId: grandparentId };
      }
      reparent(node.children ?? []);
    }
  };
  reparent(screen.components);
  screen.components = screen.components.filter((c) => c.id !== id);
  return next;
}

/**
 * TASK 60 §20: GROUP variants — one pure model operation for a whole
 * multi-selection. Chaining through the intermediate result means ONE
 * undoable commit per group action (rapid per-entity commits would clobber
 * each other: each reads the same pre-render model snapshot).
 */
export function duplicateHierarchy3DMany(
  model: ProjectModel,
  screenId: string,
  ids: string[],
): ProjectModel {
  let next = model;
  for (const id of ids) {
    const after = duplicateHierarchy3D(next, screenId, id);
    if (after !== next) next = after;
  }
  return next;
}

export function removeComponent3DMany(
  model: ProjectModel,
  screenId: string,
  ids: string[],
): ProjectModel {
  let next = model;
  for (const id of ids) {
    const after = removeComponent3D(next, screenId, id);
    if (after !== next) next = after;
  }
  return next;
}

/**
 * TASK 62 §25/§26: apply prop patches to MANY components of one screen as a
 * SINGLE pure model operation — one undo entry for a whole multi-select
 * gesture (alignment, group move). Rapid per-entity commits would clobber
 * each other: each reads the same pre-render model snapshot.
 */
export function updateComponentsPropsMany(
  model: ProjectModel,
  patches: { id: string; props: PropsPatch }[],
): ProjectModel {
  let next = model;
  for (const { id, props } of patches) {
    const after = updateComponent(next, id, { props });
    if (after !== next) next = after;
  }
  return next;
}

/** TASK 62 §25: delete many top-level scene entities as ONE undoable step. */
export function removeComponentsMany(model: ProjectModel, ids: string[]): ProjectModel {
  let next = model;
  for (const id of ids) {
    const after = removeComponent(next, id);
    if (after !== next) next = after;
  }
  return next;
}

/** TASK 62 §25: duplicate many components as ONE undoable step. */
export function duplicateComponentsMany(model: ProjectModel, ids: string[]): ProjectModel {
  let next = model;
  for (const id of ids) {
    const after = duplicateComponent(next, id);
    if (after !== next) next = after;
  }
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

/**
 * TASK 62 §5: duplicate a scene — a full copy (components, logic, styles,
 * input actions) inserted right after the original. The copy shares the
 * source's internal component ids: screens are independent lists and every
 * lookup (handlers, blocks, runtime) is screen-scoped, so nothing collides.
 */
export function duplicateScreen(model: ProjectModel, screenId: string): ProjectModel {
  const source = findScreen(model, screenId);
  if (!source) return model;
  const next = clone(model);
  const copy: ProjectModelScreen = JSON.parse(JSON.stringify(source));
  copy.id = genId("screen");
  copy.name = `${source.name} copy`;
  const at = next.screens.findIndex((s) => s.id === screenId);
  next.screens.splice(at + 1, 0, copy);
  return next;
}

/**
 * TASK 62 §5: reorder scenes by one slot (direction −1 = toward the front of
 * the list). The start-screen designation is untouched — it travels with the
 * screen id, not its position.
 */
export function moveScreen(model: ProjectModel, screenId: string, direction: -1 | 1): ProjectModel {
  const index = model.screens.findIndex((s) => s.id === screenId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= model.screens.length) return model;
  const next = clone(model);
  const [screen] = next.screens.splice(index, 1);
  next.screens.splice(target, 0, screen!);
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

/**
 * Rewrite the screen's named rendering layers (TASK 15). The Layer Manager
 * commits the WHOLE list per edit — add, rename (with reference remap),
 * delete (guard at the UI: a layer in use cannot be deleted), or reorder —
 * so every change is exactly one undoable step. Rename remaps every entity
 * on the screen that referenced the old name in the same commit, so no
 * entity is ever left pointing at a missing layer.
 */
export function updateSortingLayers(
  model: ProjectModel,
  screenId: string,
  layers: ProjectModelSortingLayer[],
  previousLayers?: ProjectModelSortingLayer[],
): ProjectModel {
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  // Renames: a previous layer whose name vanished but whose order survives
  // under a new name is a rename — remap its references.
  if (previousLayers?.length) {
    const renamed = new Map<string, string>();
    for (const prev of previousLayers) {
      if (layers.some((l) => l.name === prev.name)) continue;
      const at = previousLayers.indexOf(prev);
      const replacement = layers[at] ?? layers.find((l) => l.order === prev.order);
      if (replacement && replacement.name !== prev.name) renamed.set(prev.name, replacement.name);
    }
    if (renamed.size > 0) {
      const remap = (nodes: ProjectModelComponent[]) => {
        for (const node of nodes) {
          const current = node.props?.sortingLayer;
          if (typeof current === "string" && renamed.has(current)) {
            node.props = { ...(node.props ?? {}), sortingLayer: renamed.get(current)! };
          }
          if (node.children) remap(node.children);
        }
      };
      remap(screen.components);
    }
  }
  if (layers.length > 0) screen.sortingLayers = layers;
  else delete screen.sortingLayers;
  return next;
}

/**
 * Rewrite the screen's abstract input actions (input abstraction system) as
 * ONE commit. An empty list deletes the field, which restores the default
 * set (same convention as the Layer Manager) — the UI explains this.
 * Action IDs are the stable interface the runtime consumes; renaming the
 * display name never remaps anything.
 */
export function updateInputActions(
  model: ProjectModel,
  screenId: string,
  actions: ProjectModelInputAction[],
): ProjectModel {
  const next = clone(model);
  const screen = findScreen(next, screenId);
  if (!screen) return model;
  if (actions.length > 0) screen.inputActions = actions;
  else delete screen.inputActions;
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
