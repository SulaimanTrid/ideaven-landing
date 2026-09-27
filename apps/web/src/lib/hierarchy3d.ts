import type { ProjectModelComponent } from "@/types/project";
import { mat4ComposeTRS, mat4Identity, mat4Multiply } from "@/lib/render3d";

/**
 * 3D scene hierarchy (TASK 53): the canonical relationship is
 * `component.props.parentId` — child lists are DERIVED, never stored. World
 * transforms are derived as parent.world × local and never written back into
 * the model.
 *
 * Malformed hierarchies (missing parent, self-parent, cycles, excessive
 * depth) never recurse forever: evaluation treats the broken branch as a
 * root entity (local == world) and reports the issue through
 * `hierarchyIssues` for the diagnostics panel.
 */

export const HIERARCHY_MAX_DEPTH = 32;

export interface HierarchyIssue {
  componentId: string;
  kind: "self-parent" | "missing-parent" | "cycle" | "excessive-depth";
  detail: string;
}

export interface HierarchyEntry {
  matrix: number[];
  depth: number;
  /** The resolved parent id — null when root OR when the authored parent was
   * broken (missing/cycle/self); the model is never rewritten. */
  resolvedParentId: string | null;
}

/**
 * Evaluates world matrices for every 3D entity in the list. Components
 * without a transform payload (px) are skipped — callers filter by type.
 * Deterministic: parents evaluate before children (memoized recursion with
 * cycle guards and a hard depth limit).
 */
export function computeWorldMatrices(
  components: ProjectModelComponent[],
): { matrices: Map<string, HierarchyEntry>; issues: HierarchyIssue[] } {
  const issues: HierarchyIssue[] = [];
  const byId = new Map<string, ProjectModelComponent>();
  for (const component of components) {
    if (typeof component.props?.px !== "number") continue; // not a 3D transform entity
    byId.set(component.id, component);
  }

  const matrices = new Map<string, HierarchyEntry>();
  const inProgress = new Set<string>();

  const localMatrix = (component: ProjectModelComponent): number[] => {
    const p = component.props ?? {};
    const num = (key: string, fallback: number) => {
      const v = Number(p[key]);
      return Number.isFinite(v) ? v : fallback;
    };
    return mat4ComposeTRS(
      [num("px", 0), num("py", 0.5), num("pz", 0)],
      [num("rx", 0), num("ry", 0), num("rz", 0)],
      [num("sx", 1), num("sy", 1), num("sz", 1)],
    );
  };

  const evaluate = (component: ProjectModelComponent, depth: number): HierarchyEntry => {
    const cached = matrices.get(component.id);
    if (cached) return cached;
    if (inProgress.has(component.id) || depth > HIERARCHY_MAX_DEPTH) {
      // Cycle or excessive depth: treat this branch as a root entity (local
      // == world) so the runtime stays stable; the model is never mutated.
      issues.push(
        depth > HIERARCHY_MAX_DEPTH
          ? { componentId: component.id, kind: "excessive-depth", detail: `deeper than ${HIERARCHY_MAX_DEPTH}` }
          : { componentId: component.id, kind: "cycle", detail: "hierarchy cycle detected" },
      );
      const entry: HierarchyEntry = { matrix: localMatrix(component), depth: 0, resolvedParentId: null };
      matrices.set(component.id, entry);
      return entry;
    }
    inProgress.add(component.id);
    const rawParent = component.props?.parentId;
    const parentValue = typeof rawParent === "string" ? rawParent.trim() : "";
    let resolvedParentId: string | null = null;
    let world = localMatrix(component);
    let worldDepth = 0;

    if (parentValue !== "") {
      if (parentValue === component.id) {
        issues.push({ componentId: component.id, kind: "self-parent", detail: parentValue });
      } else {
        const parent = byId.get(parentValue);
        if (!parent) {
          issues.push({ componentId: component.id, kind: "missing-parent", detail: parentValue });
        } else {
          const parentEntry = evaluate(parent, depth + 1);
          world = mat4Multiply(parentEntry.matrix, world);
          worldDepth = parentEntry.depth + 1;
          resolvedParentId = parentValue;
        }
      }
    }
    inProgress.delete(component.id);
    const entry: HierarchyEntry = { matrix: world, depth: worldDepth, resolvedParentId };
    matrices.set(component.id, entry);
    return entry;
  };

  for (const component of byId.values()) evaluate(component, 0);
  return { matrices, issues };
}

/** Derived child lists (parent id → child ids in model order). */
export function childrenMap3D(components: ProjectModelComponent[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const component of components) {
    if (typeof component.props?.px !== "number") continue;
    const parent = typeof component.props?.parentId === "string" ? component.props.parentId : "";
    if (!parent) continue;
    const list = map.get(parent) ?? [];
    list.push(component.id);
    map.set(parent, list);
  }
  return map;
}

/** All descendant ids of one entity (exclusive), cycle-safe. */
export function descendantsOf3D(components: ProjectModelComponent[], id: string): Set<string> {
  const children = childrenMap3D(components);
  const out = new Set<string>();
  const visit = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      if (out.has(child)) continue; // cycle guard
      out.add(child);
      const component = components.find((c) => c.id === child);
      if (component) visit(component.id);
    }
  };
  visit(id);
  return out;
}