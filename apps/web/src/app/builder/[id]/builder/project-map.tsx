"use client";

import { useMemo, useState } from "react";
import {
  assetNodeId,
  buildProjectGraph,
  componentNodeId,
  handlerNodeId,
  relationshipsOf,
  screenNodeId,
  variableNodeId,
  type GraphNode,
} from "@/lib/project-model/graph";
import { useBuilder, componentLabel } from "./builder-context";
import { getDef } from "@/lib/project-model/registry";
import { cn } from "@ideaven/ui";
import type { ProjectModelComponent } from "@/types/project";

/**
 * Project Map (roadmap 4.0 M2): the visual graph over the real model —
 * screens, components, logic, data, assets, extension provenance. Selecting
 * any entity shows its relationships; entities with a home in the builder
 * offer a direct jump there. Derived-only: nothing here edits the project.
 */

const KIND_LABELS: Record<GraphNode["kind"], string> = {
  screen: "Screen",
  component: "Component",
  handler: "Event handler",
  block: "Block",
  variable: "Variable",
  asset: "Asset",
  extension: "Extension",
};

const KIND_COLOR: Record<GraphNode["kind"], string> = {
  screen: "#58c7f0",
  component: "#8f7bff",
  handler: "#ff7d9c",
  block: "#ffb454",
  variable: "#46e3b4",
  asset: "#f2c94c",
  extension: "#c99bff",
};

const ALL_KINDS: Array<GraphNode["kind"]> = [
  "component",
  "handler",
  "block",
  "variable",
  "asset",
  "extension",
];

export function ProjectMap() {
  const { project, model } = useBuilder();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<GraphNode["kind"]>>(new Set());

  /** Row visibility: matches the search text and the active kind filters. */
  const visible = (label: string, kind: GraphNode["kind"], forced = false) => {
    if (!forced && kinds.size > 0 && !kinds.has(kind)) return false;
    const q = query.trim().toLowerCase();
    if (q !== "" && !label.toLowerCase().includes(q)) return false;
    return true;
  };

  const graph = useMemo(() => buildProjectGraph(model), [model]);
  const selected = selectedId ? graph.nodes.get(selectedId) ?? null : null;
  const groups = useMemo(
    () => (selectedId ? relationshipsOf(graph, selectedId) : []),
    [graph, selectedId],
  );

  const flatComponents = (screen: (typeof model.screens)[number]) => {
    const list: { node: ProjectModelComponent; depth: number }[] = [];
    const walk = (nodes: ProjectModelComponent[], depth: number) => {
      for (const node of nodes) {
        list.push({ node, depth });
        if (node.children) walk(node.children, depth + 1);
      }
    };
    walk(screen.components, 1);
    return list;
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Tree */}
      <div className="min-h-0 overflow-y-auto rounded-xl border border-line bg-card p-4">
        <div className="flex flex-col gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the map…"
            aria-label="Search project map"
            className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter node types">
            {ALL_KINDS.map((kind) => {
              const active = kinds.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setKinds((current) => {
                      const next = new Set(current);
                      if (next.has(kind)) next.delete(kind);
                      else next.add(kind);
                      return next;
                    })
                  }
                  className={`rounded-full border px-2 py-0.5 text-[10.5px] capitalize transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint ${
                    active ? "text-ink" : "text-mist hover:text-fog"
                  }`}
                  style={{ borderColor: active ? KIND_COLOR[kind] : undefined }}
                >
                  {kind}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
          {project.name}
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {model.screens.map((screen) => {
            const sId = screenNodeId(screen.id);
            const handlers = screen.logic?.handlers ?? [];
            return (
              <div key={screen.id}>
                <MapRow
                  active={selectedId === sId}
                  color={KIND_COLOR.screen}
                  kind="Screen"
                  label={screen.name}
                  onClick={() => setSelectedId(sId)}
                />
                <div className="ml-3 border-l border-line pl-3">
                  {flatComponents(screen)
                    .filter(({ node }) => visible(componentLabel(node), "component"))
                    .map(({ node, depth }) => {
                      const cId = componentNodeId(screen.id, node.id);
                      return (
                        <MapRow
                          key={node.id}
                          indent={depth}
                          active={selectedId === cId}
                          color={KIND_COLOR.component}
                          kind={getDef(node.type)?.label ?? node.type}
                          label={componentLabel(node)}
                          onClick={() => setSelectedId(cId)}
                        />
                      );
                    })}
                  {screen.components.length === 0 ? (
                    <p className="py-0.5 text-[12px] text-mist">No components yet.</p>
                  ) : null}
                  {handlers
                    .map((handler) => {
                      const hId = handlerNodeId(screen.id, handler.id);
                      const comp = flatComponents(screen).find((c) => c.node.id === handler.componentId)?.node;
                      const label = `${handler.componentId === null ? "screen" : comp ? componentLabel(comp) : "missing component"} · ${handler.body.length} blocks`;
                      return { handler, hId, label };
                    })
                    .filter(({ label }) => visible(label, "handler"))
                    .map(({ hId, label }) => (
                      <MapRow
                        key={hId}
                        active={selectedId === hId}
                        color={KIND_COLOR.handler}
                        kind="handler"
                        label={label}
                        onClick={() => setSelectedId(hId)}
                      />
                    ))}
                </div>
              </div>
            );
          })}

          <GraphSection title="Data · variables">
            {model.variables
              .filter((variable) => visible(variable.name, "variable"))
              .map((variable) => {
                const vId = variableNodeId(variable.name);
                return (
                  <MapRow
                    key={variable.id}
                    active={selectedId === vId}
                    color={KIND_COLOR.variable}
                    kind={variable.type}
                    label={variable.name}
                    onClick={() => setSelectedId(vId)}
                  />
                );
              })}
            {model.variables.length === 0 ? <Empty /> : null}
          </GraphSection>

          <GraphSection title="Assets">
            {model.assets
              .filter((asset) => visible(asset.name, "asset"))
              .map((asset) => {
                const aId = assetNodeId(asset.id);
                return (
                  <MapRow
                    key={asset.id}
                    active={selectedId === aId}
                    color={KIND_COLOR.asset}
                    kind={asset.kind}
                    label={asset.name}
                    onClick={() => setSelectedId(aId)}
                  />
                );
              })}
            {model.assets.length === 0 ? <Empty /> : null}
          </GraphSection>

          <GraphSection title="Extensions (used in logic)">
            {[...new Set([...graph.nodes.values()].filter((n) => n.kind === "extension").map((n) => n.id))]
              .filter((id) => {
                const ext = graph.nodes.get(id);
                return ext ? visible(ext.label, "extension") : false;
              })
              .map(
              (id) => {
                const ext = graph.nodes.get(id);
                if (!ext) return null;
                return (
                  <MapRow
                    key={id}
                    active={selectedId === id}
                    color={KIND_COLOR.extension}
                    kind="Extension"
                    label={ext.label}
                    onClick={() => setSelectedId(id)}
                  />
                );
              },
            )}
            {[...graph.nodes.values()].every((n) => n.kind !== "extension") ? <Empty /> : null}
          </GraphSection>
        </div>
      </div>

      {/* Inspector */}
      <div className="min-h-0 overflow-y-auto rounded-xl border border-line bg-card p-4">
        {!selected ? (
          <p className="text-[13px] leading-6 text-mist">
            Select anything in the map to see what it connects to — what wires
            this component, which screen uses this asset, where this variable
            is written.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[selected.kind] }} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">{selected.label}</p>
                <p className="text-[11.5px] text-mist">
                  {KIND_LABELS[selected.kind]}
                  {selected.sublabel ? ` · ${selected.sublabel}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              {groups.length === 0 ? (
                <p className="text-[12.5px] text-mist">No relationships yet.</p>
              ) : (
                groups.map((group) => (
                  <div key={`${group.kind}:${group.direction}`}>
                    <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                      {group.label}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {group.nodes.map((node) => (
                        <RelationshipRow key={node.id} node={node} onSelect={() => setSelectedId(node.id)} />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <p className="py-0.5 text-[12px] text-mist">None yet.</p>;
}

function GraphSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.16em] text-mist uppercase">{title}</p>
      <div className="mt-1 flex flex-col">{children}</div>
    </div>
  );
}

function MapRow({
  active,
  color,
  kind,
  label,
  indent = 0,
  onClick,
}: {
  active: boolean;
  color: string;
  kind: string;
  label: string;
  indent?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint",
        active && "bg-surface ring-1 ring-line",
      )}
      style={{ marginLeft: indent * 14 }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 truncate text-[12.5px] text-fog">{label}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-mist">{kind}</span>
    </button>
  );
}

function RelationshipRow({ node, onSelect }: { node: GraphNode; onSelect: () => void }) {
  const { setActiveScreen, selectHandler, setMode } = useBuilder();
  const jump = () => {
    if (!node.screenId) {
      onSelect();
      return;
    }
    setActiveScreen(node.screenId);
    if (node.handlerId) {
      selectHandler(node.handlerId);
      setMode("blocks");
    } else if (node.kind === "screen" || node.kind === "component") {
      setMode("design");
    } else {
      onSelect();
    }
  };
  return (
    <li>
      <button
        type="button"
        onClick={jump}
        className="flex w-full items-center gap-2 rounded-md border border-line px-2 py-1.5 text-left transition-colors hover:border-violet/40 hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[node.kind] }} />
        <span className="min-w-0 truncate text-[12px] text-fog">{node.label}</span>
        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-mist uppercase">
          {KIND_LABELS[node.kind]}
        </span>
      </button>
    </li>
  );
}
