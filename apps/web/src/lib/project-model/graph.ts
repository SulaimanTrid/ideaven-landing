import type { ProjectModel, ProjectModelBlock } from "@/types/project";
import { isExtensionBlock } from "./block-registry";

/**
 * Project Graph (roadmap 4.0 M2): one derived graph document over the
 * canonical model — UI (screens/components), logic (handlers/blocks and
 * navigation), data (variables), assets, and extension provenance. It is
 * the query layer behind the Project Map: "what uses this asset?", "what
 * wires this component?", "where is this variable written?". Derived-only:
 * building it never mutates the model.
 */

export type GraphNodeKind =
  | "screen"
  | "component"
  | "handler"
  | "block"
  | "variable"
  | "asset"
  | "extension";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
  /** Where a click-through should land. */
  screenId?: string;
  handlerId?: string;
  blockId?: string;
}

export type GraphEdgeKind =
  | "contains" // screen → component/handler, component → child, handler → block
  | "wires" // handler → the component whose event it handles
  | "navigates" // navigate block → target screen
  | "writes" // set-variable block → variable
  | "reads" // get-variable block → variable
  | "uses-asset" // component → asset
  | "provides"; // extension → its block

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface ProjectGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export const screenNodeId = (id: string) => `screen:${id}`;
export const componentNodeId = (screenId: string, id: string) => `component:${screenId}:${id}`;
export const handlerNodeId = (screenId: string, id: string) => `handler:${screenId}:${id}`;
export const blockNodeId = (screenId: string, handlerId: string, id: string) =>
  `block:${screenId}:${handlerId}:${id}`;
export const variableNodeId = (name: string) => `variable:${name}`;
export const assetNodeId = (id: string) => `asset:${id}`;
export const extensionNodeId = (slug: string) => `extension:${slug}`;

export function extensionSlugOfType(type: string): string | null {
  if (!isExtensionBlock(type)) return null;
  const parts = type.split(":");
  return parts.length >= 2 && parts[1] ? parts[1] : null;
}

function blockSummary(block: ProjectModelBlock): string {
  const def = block.type;
  if (block.type === "navigate") {
    return `navigate → ${typeof block.inputs?.screenId === "string" ? block.inputs.screenId : "…"}`;
  }
  if (block.type === "set-variable" || block.type === "get-variable") {
    return `${block.type === "set-variable" ? "set" : "get"} ${typeof block.inputs?.name === "string" ? block.inputs.name : "…"}`;
  }
  if (block.type === "set-property" || block.type === "get-property") {
    return `${block.type === "set-property" ? "set" : "get"} property`;
  }
  return def;
}

export function buildProjectGraph(model: ProjectModel): ProjectGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const node = (entry: GraphNode) => {
    if (!nodes.has(entry.id)) nodes.set(entry.id, entry);
  };
  const edge = (from: string, to: string, kind: GraphEdgeKind) => {
    if (from !== to) edges.push({ from, to, kind });
  };

  for (const asset of model.assets) {
    node({
      id: assetNodeId(asset.id),
      kind: "asset",
      label: asset.name,
      sublabel: asset.kind,
    });
  }
  for (const variable of model.variables) {
    node({
      id: variableNodeId(variable.name),
      kind: "variable",
      label: variable.name,
      sublabel: variable.type,
    });
  }

  for (const screen of model.screens) {
    const sNode = screenNodeId(screen.id);
    node({ id: sNode, kind: "screen", label: screen.name, screenId: screen.id });

    const walk = (list: typeof screen.components, parentId: string | null) => {
      for (const component of list) {
        const cNode = componentNodeId(screen.id, component.id);
        node({
          id: cNode,
          kind: "component",
          label: component.props && typeof component.props.text === "string"
            ? String(component.props.text)
            : (component.props && typeof component.props.label === "string"
              ? String(component.props.label)
              : component.id),
          sublabel: component.type,
          screenId: screen.id,
        });
        edge(parentId ? parentId : sNode, cNode, "contains");

        // Asset usage: image srcs reference assets by "asset:<id>".
        const src = component.props?.src;
        if (typeof src === "string" && src.startsWith("asset:")) {
          const assetId = src.slice(6);
          if (assetId !== "") {
            node({
              id: assetNodeId(assetId),
              kind: "asset",
              label: model.assets.find((a) => a.id === assetId)?.name ?? assetId,
              sublabel: "image",
            });
            edge(cNode, assetNodeId(assetId), "uses-asset");
          }
        }

        if (component.children) walk(component.children, cNode);
      }
    };
    walk(screen.components, null);

    if (!screen.logic) continue;
    for (const handler of screen.logic.handlers) {
      const hNode = handlerNodeId(screen.id, handler.id);
      node({
        id: hNode,
        kind: "handler",
        label: `when ${handler.componentId === null ? "screen" : handler.componentId} ${handler.event}s`,
        sublabel: `${handler.body.length} block${handler.body.length === 1 ? "" : "s"}`,
        screenId: screen.id,
        handlerId: handler.id,
      });
      edge(sNode, hNode, "contains");
      if (handler.componentId) {
        edge(hNode, componentNodeId(screen.id, handler.componentId), "wires");
      }

      const walkBlocks = (blocks: ProjectModelBlock[], owner: string) => {
        for (const block of blocks) {
          const bNode = blockNodeId(screen.id, handler.id, block.id);
          node({
            id: bNode,
            kind: "block",
            label: blockSummary(block),
            sublabel: block.type,
            screenId: screen.id,
            handlerId: handler.id,
            blockId: block.id,
          });
          edge(owner, bNode, "contains");

          if (block.type === "navigate") {
            const target = block.inputs?.screenId;
            if (typeof target === "string" && target !== "") {
              node({ id: screenNodeId(target), kind: "screen", label: target, screenId: target });
              edge(bNode, screenNodeId(target), "navigates");
            }
          }
          if (block.type === "set-variable" || block.type === "get-variable") {
            const name = block.inputs?.name;
            if (typeof name === "string" && name !== "") {
              node({ id: variableNodeId(name), kind: "variable", label: name });
              edge(bNode, variableNodeId(name), block.type === "set-variable" ? "writes" : "reads");
            }
          }
          const slug = extensionSlugOfType(block.type);
          if (slug) {
            node({
              id: extensionNodeId(slug),
              kind: "extension",
              label: slug,
              sublabel: "extension",
            });
            edge(extensionNodeId(slug), bNode, "provides");
          }

          if (block.children) walkBlocks(block.children, bNode);
          if (block.elseChildren) walkBlocks(block.elseChildren, bNode);
          for (const slot of Object.values(block.slots ?? {})) {
            if (slot) walkBlocks([slot], bNode);
          }
        }
      };
      walkBlocks(handler.body, hNode);
    }
  }

  return { nodes, edges };
}

export interface RelationshipGroup {
  kind: GraphEdgeKind;
  direction: "in" | "out";
  label: string;
  nodes: GraphNode[];
}

const EDGE_LABELS: Record<GraphEdgeKind, { out: string; in: string }> = {
  contains: { out: "Contains", in: "Contained in" },
  wires: { out: "Handles event of", in: "Wired by handlers" },
  navigates: { out: "Navigates to", in: "Navigated from" },
  writes: { out: "Writes variable", in: "Written by" },
  reads: { out: "Reads variable", in: "Read by" },
  "uses-asset": { out: "Uses asset", in: "Used on" },
  provides: { out: "Provides blocks", in: "Provided by" },
};

/** Grouped incoming + outgoing relationships for one node (Project Map inspector). */
export function relationshipsOf(graph: ProjectGraph, nodeId: string): RelationshipGroup[] {
  const groups = new Map<string, RelationshipGroup>();
  const push = (kind: GraphEdgeKind, direction: "in" | "out", otherId: string) => {
    const other = graph.nodes.get(otherId);
    if (!other) return;
    const key = `${kind}:${direction}`;
    const group = groups.get(key) ?? {
      kind,
      direction,
      label: EDGE_LABELS[kind][direction],
      nodes: [],
    };
    group.nodes.push(other);
    groups.set(key, group);
  };
  for (const edge of graph.edges) {
    if (edge.from === nodeId) push(edge.kind, "out", edge.to);
    if (edge.to === nodeId) push(edge.kind, "in", edge.from);
  }
  return [...groups.values()];
}
