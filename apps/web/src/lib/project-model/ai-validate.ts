import type { ProjectModel, ProjectModelComponent } from "@/types/project";

/**
 * Client-side structural validation run after an AI changeset is applied to
 * the cloned model. Mirrors the server's ValidateModel invariants; a failed
 * check rejects the whole changeset (the original model is kept).
 */
export function ValidateModelClient(model: ProjectModel): boolean {
  if (!model || typeof model !== "object") return false;
  if (model.schemaVersion !== 1) return false;
  if (model.type !== "app" && model.type !== "game") return false;
  if (!Array.isArray(model.screens) || model.screens.length === 0) return false;

  const screenIds = new Set<string>();
  for (const screen of model.screens) {
    if (!screen.id || screenIds.has(screen.id)) return false;
    screenIds.add(screen.id);
    const componentIds = new Set<string>();

    const walk = (nodes: ProjectModelComponent[]): boolean => {
      for (const node of nodes) {
        if (!node.id || !node.type || componentIds.has(node.id)) return false;
        componentIds.add(node.id);
        if (node.children && !walk(node.children)) return false;
      }
      return true;
    };
    if (!walk(screen.components)) return false;
  }

  if (model.navigation?.startScreenId && !screenIds.has(model.navigation.startScreenId)) {
    return false;
  }
  return true;
}
