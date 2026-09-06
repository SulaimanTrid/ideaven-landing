import type { ProjectModel } from "@/types/project";

/**
 * Deterministic model diagnostics: structural problems the canonical model
 * itself reveals, independent of code. This is the seed of the Ideaven
 * validator — severity levels follow the platform convention (ERROR /
 * WARNING / INFO) and every diagnostic targets a navigable source (a
 * handler/block for Blocks mode, the code view for code-level issues).
 */

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ModelDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** Where the diagnostic points. */
  screenId: string;
  handlerId?: string;
  blockId?: string;
  componentId?: string;
}

/** Structural shape the block walker needs (subset of ProjectModelBlock). */
interface DiagBlock {
  id: string;
  type: string;
  inputs?: Record<string, unknown>;
  children?: DiagBlock[];
  elseChildren?: DiagBlock[];
  slots?: Record<string, DiagBlock | undefined>;
}

export function collectModelDiagnostics(model: ProjectModel): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [];
  const variableNames = new Set(model.variables.map((v) => v.name));

  for (const screen of model.screens) {
    if (screen.components.length === 0) {
      out.push({
        severity: "warning",
        message: `Screen “${screen.name}” is empty — drag components from the palette.`,
        screenId: screen.id,
      });
    }

    // Asset references are soft: an image whose "asset:<id>" no longer
    // resolves (the asset was deleted) renders as a broken source — flagged
    // here, never silently rewritten.
    const assetIds = new Set(model.assets.map((a) => a.id));
    const flat: { id: string; type: string; props?: Record<string, unknown> }[] = [];
    const walk = (nodes: typeof screen.components) => {
      for (const node of nodes) {
        flat.push({ id: node.id, type: node.type, props: node.props });
        if (node.children) walk(node.children);
      }
    };
    walk(screen.components);
    const componentIds = new Set(flat.map((c) => c.id));

    for (const component of flat) {
      if (component.type !== "image") continue;
      const src = component.props?.src;
      if (typeof src === "string" && src.startsWith("asset:")) {
        const assetId = src.slice(6);
        if (assetId !== "" && !assetIds.has(assetId)) {
          out.push({
            severity: "warning",
            message: `Image references an asset that is no longer in the project. Pick another in the Assets panel.`,
            screenId: screen.id,
            componentId: component.id,
          });
        }
      }
    }

    for (const handler of screen.logic?.handlers ?? []) {
      const where =
        handler.componentId === null
          ? "Screen"
          : componentIds.has(handler.componentId)
            ? `Component ${handler.componentId}`
            : null;

      if (handler.body.length === 0) {
        out.push({
          severity: "info",
          message: `${where ?? "Handler"} has no blocks yet — the ${handler.event} event does nothing.`,
          screenId: screen.id,
          handlerId: handler.id,
        });
      }

      if (handler.componentId !== null && !componentIds.has(handler.componentId)) {
        out.push({
          severity: "error",
          message: `This handler references a deleted component. Reconnect it in Blocks or delete the handler.`,
          screenId: screen.id,
          handlerId: handler.id,
          blockId: handler.body[0]?.id,
          componentId: handler.componentId,
        });
      }

      const checkBlock = (block: DiagBlock): void => {
        if (block.type === "navigate") {
          const target = block.inputs?.screenId;
          if (typeof target === "string" && target !== "" && !model.screens.some((s) => s.id === target)) {
            out.push({
              severity: "error",
              message: `Navigate targets a screen that does not exist.`,
              screenId: screen.id,
              handlerId: handler.id,
              blockId: block.id,
            });
          }
        }
        if (block.type === "set-property" || block.type === "get-property") {
          const componentId = block.inputs?.componentId;
          if (typeof componentId === "string" && componentId !== "" && !componentIds.has(componentId)) {
            out.push({
              severity: "error",
              message: `${block.type === "set-property" ? "Set" : "Get"} property references a deleted component.`,
              screenId: screen.id,
              handlerId: handler.id,
              blockId: block.id,
              componentId,
            });
          }
        }
        if (block.type === "set-variable" || block.type === "get-variable") {
          const name = block.inputs?.name;
          if (typeof name === "string" && name !== "" && !variableNames.has(name)) {
            out.push({
              severity: "error",
              message: `Variable “${name}” does not exist — create it in the Variables panel.`,
              screenId: screen.id,
              handlerId: handler.id,
              blockId: block.id,
            });
          }
        }
        for (const child of block.children ?? []) checkBlock(child);
        for (const child of block.elseChildren ?? []) checkBlock(child);
        for (const slot of Object.values(block.slots ?? {})) {
          if (slot) checkBlock(slot);
        }
      };

      for (const block of handler.body) checkBlock(block);
    }
  }

  return out;
}
