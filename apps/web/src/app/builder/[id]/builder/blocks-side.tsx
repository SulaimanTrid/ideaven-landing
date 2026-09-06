"use client";

import { useMemo, useState } from "react";
import { CATEGORY_COLORS } from "@/lib/project-model/blocks";
import {
  allExpressionDefs,
  allStatementDefs,
  createRegistryBlock,
  extensionNameFor,
  isExtensionBlock,
} from "@/lib/project-model/block-registry";
import { eventsFor, getDef, EVENT_LABELS, SCREEN_EVENTS } from "@/lib/project-model/registry";
import { useBuilder, componentLabel } from "./builder-context";
import { setDragPayload, type BlockDragPayload } from "./blocks-editors";
import { IconClose, IconPlus } from "@/components/visuals/icons";
import type { ProjectModelComponent } from "@/types/project";

/**
 * Side panels for Blocks mode: the handler list for the active screen (left),
 * plus the statement palette and project variables (right). Handlers appear
 * automatically from the components that exist on the screen.
 */
export function BlocksSidePanel() {
  return <HandlersPanel />;
}

function HandlersPanel() {
  const { model, activeScreenId, selectedHandlerId, selectHandler, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId);
  const handlers = screen?.logic?.handlers ?? [];

  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState<string>(""); // "" = screen
  const [event, setEvent] = useState<string>("");

  const components = (() => {
    const list: ProjectModelComponent[] = [];
    const walk = (nodes: ProjectModelComponent[]) => {
      for (const node of nodes) {
        list.push(node);
        if (node.children) walk(node.children);
      }
    };
    if (screen) walk(screen.components);
    return list;
  })();

  const target = targetId === "" ? null : components.find((c) => c.id === targetId) ?? null;
  const availableEvents = target ? eventsFor(target.type) : [...SCREEN_EVENTS];

  const submit = () => {
    const componentId = target ? target.id : null;
    if (!event || (componentId === null && !availableEvents.includes(event as "initialize"))) {
      return;
    }
    const id = actions.addHandler(componentId, event);
    selectHandler(id);
    setAdding(false);
    setEvent("");
  };

  return (
    <div className="border-b border-line p-3">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <h3 className="font-mono text-[10px] tracking-[0.16em] text-mist uppercase">Event handlers</h3>
        <button
          type="button"
          aria-label="Add handler"
          title="Add handler"
          onClick={() => setAdding((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconPlus size={14} />
        </button>
      </div>

      {handlers.length === 0 && !adding ? (
        <p className="px-1 pb-1 text-[12px] leading-5 text-mist">
          No handlers on this screen yet.
        </p>
      ) : null}

      <ul className="flex flex-col gap-0.5">
        {handlers.map((handler) => {
          const component = handler.componentId
            ? components.find((c) => c.id === handler.componentId)
            : null;
          const selected = handler.id === selectedHandlerId;
          const label =
            handler.componentId === null
              ? `Screen ${EVENT_LABELS[handler.event] ?? handler.event}`
              : component
                ? `${componentLabel(component)} ${EVENT_LABELS[handler.event] ?? handler.event}`
                : `Missing component ${EVENT_LABELS[handler.event] ?? handler.event}`;
          return (
            <li key={handler.id}>
              <div
                className={`group flex h-8 items-center gap-1 rounded-md px-2 text-[12px] transition-colors ${
                  selected ? "bg-surface-strong text-ink" : "text-fog hover:bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectHandler(handler.id)}
                  className={`min-w-0 flex-1 truncate text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                    handler.componentId !== null && !component ? "text-rose" : ""
                  }`}
                >
                  <span className="text-sky">when</span> {label}
                  <span className="ml-1 text-[10px] text-mist">
                    ({handler.body.length} block{handler.body.length === 1 ? "" : "s"})
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete handler"
                  title="Delete handler"
                  onClick={() => actions.removeHandler(handler.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mist opacity-0 transition-opacity hover:text-rose focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint group-hover:opacity-100"
                >
                  <IconClose size={12} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2">
          <select
            aria-label="Handler target"
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setEvent("");
            }}
            className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            <option value="">Screen events</option>
            {components
              .filter((c) => eventsFor(c.type).length > 0)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {componentLabel(c)} · {getDef(c.type)?.label ?? c.type}
                </option>
              ))}
          </select>
          <select
            aria-label="Event"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            <option value="">choose event…</option>
            {availableEvents.map((name) => (
              <option key={name} value={name}>
                {EVENT_LABELS[name] ?? name}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={submit}
              disabled={event === ""}
              className="h-8 flex-1 rounded-md bg-violet-deep text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-50"
            >
              Add handler
            </button>
            <button
              type="button"
              aria-label="Cancel adding handler"
              onClick={() => setAdding(false)}
              className="h-8 rounded-md border border-line px-2 text-[12px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Statement palette (right rail in Blocks mode): search, drag sources, click-to-add. */
export function BlockPalette() {
  const { model, activeScreenId, selectedHandlerId, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === selectedHandlerId) ?? null;

  const [query, setQuery] = useState("");

  const statements = useMemo(() => allStatementDefs(), []);
  const reporters = useMemo(() => allExpressionDefs(), []);

  const matches = (label: string, type: string) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    return label.toLowerCase().includes(q) || type.toLowerCase().includes(q);
  };

  const add = (type: string) => {
    if (!handler) return;
    const block = createRegistryBlock(type);
    if (!block) return;
    actions.addStatement(handler.id, null, handler.body.length, block);
  };

  const startDrag = (event: React.DragEvent, payload: BlockDragPayload, marker: string) => {
    setDragPayload(event, payload);
    event.dataTransfer.setData(marker, "");
  };

  // Group statements: built-in categories first, then one group per extension.
  const groups = useMemo(() => {
    const byCategory = new Map<string, typeof statements>();
    const byExtension = new Map<string, typeof statements>();
    for (const def of statements) {
      if (!matches(def.label, def.type)) continue;
      if (isExtensionBlock(def.type)) {
        const name = extensionNameFor(def.type) ?? "Extension";
        const list = byExtension.get(name) ?? [];
        list.push(def);
        byExtension.set(name, list);
      } else {
        const list = byCategory.get(def.category) ?? [];
        list.push(def);
        byCategory.set(def.category, list);
      }
    }
    return { byCategory, byExtension };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statements, query]);

  const reporterItems = reporters.filter((def) => matches(def.label, def.type));

  return (
    <div className="flex flex-col gap-4 p-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search blocks…"
        aria-label="Search blocks"
        className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      />

      <section aria-label="Statement blocks">
        <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
          Statement blocks
        </h3>
        {!handler ? (
          <p className="px-1 text-[12px] leading-5 text-mist">
            Select a handler on the left to add blocks. You can still drag
            blocks onto the canvas once one is open.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {[...groups.byCategory.entries()].map(([category, defs]) => (
              <div key={category} className="flex flex-col gap-1.5">
                <p className="px-1 text-[11px] font-medium text-mist">{category}</p>
                {defs.map((def) => (
                  <PaletteStatement
                    key={def.type}
                    def={def}
                    onAdd={() => add(def.type)}
                    onDragStart={(event) =>
                      startDrag(event, { kind: "statement-new", blockType: def.type }, "x-ideaven-statement")
                    }
                  />
                ))}
              </div>
            ))}
            {[...groups.byExtension.entries()].map(([name, defs]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <p className="px-1 text-[11px] font-medium text-violet">⬡ {name}</p>
                {defs.map((def) => (
                  <PaletteStatement
                    key={def.type}
                    def={def}
                    onAdd={() => add(def.type)}
                    onDragStart={(event) =>
                      startDrag(event, { kind: "statement-new", blockType: def.type }, "x-ideaven-statement")
                    }
                  />
                ))}
              </div>
            ))}
            {groups.byCategory.size === 0 && groups.byExtension.size === 0 ? (
              <p className="px-1 text-[12px] text-mist">No blocks match “{query}”.</p>
            ) : null}
          </div>
        )}
      </section>

      <section aria-label="Value blocks">
        <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
          Values · drag into a socket
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {reporterItems.map((def) => {
            const color = CATEGORY_COLORS[def.category];
            return (
              <span
                key={def.type}
                draggable
                data-palette-reporter={def.type}
                title="Drag into a value socket on the canvas"
                onDragStart={(event) =>
                  startDrag(event, { kind: "reporter-new", blockType: def.type }, "x-ideaven-reporter")
                }
                className="cursor-grab rounded-full px-2.5 py-1 text-[11.5px] text-fog active:cursor-grabbing"
                style={{
                  background: `color-mix(in srgb, ${color} 14%, #12151f)`,
                  border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
                }}
              >
                {def.label.replace(/\{(\w+)\}/g, "＿")}
              </span>
            );
          })}
          {reporterItems.length === 0 ? (
            <p className="px-1 text-[12px] text-mist">No value blocks match.</p>
          ) : null}
        </div>
      </section>

      <VariablesPanel />

      <p className="px-1 text-[11px] leading-5 text-mist">
        Drag blocks between the palette and the canvas to snap them in place.
        The same logic drives the generated code in Code mode.
      </p>
    </div>
  );
}

function PaletteStatement({
  def,
  onAdd,
  onDragStart,
}: {
  def: { type: string; label: string; category: keyof typeof CATEGORY_COLORS };
  onAdd: () => void;
  onDragStart: (event: React.DragEvent) => void;
}) {
  const color = CATEGORY_COLORS[def.category];
  return (
    <button
      type="button"
      draggable
      data-palette-statement={def.type}
      onDragStart={onDragStart}
      onClick={onAdd}
      title="Click to append · drag to place"
      className="cursor-grab rounded-lg px-2.5 py-2 text-left text-[12px] text-ink transition-transform hover:translate-x-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint active:cursor-grabbing"
      style={{
        background: `color-mix(in srgb, ${color} 12%, #12151f)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        borderLeft: `4px solid ${color}`,
      }}
    >
      {def.label.replace(/\{(\w+)\}/g, "＿")}
    </button>
  );
}

function VariablesPanel() {
  const { model, actions } = useBuilder();
  const [name, setName] = useState("");

  const submit = () => {
    if (name.trim() === "") return;
    actions.addVariable(name, "text");
    setName("");
  };

  return (
    <section aria-label="Variables">
      <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
        Variables
      </h3>
      {model.variables.length === 0 ? (
        <p className="px-1 pb-1 text-[12px] text-mist">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 px-1 pb-2">
          {model.variables.map((variable) => (
            <li key={variable.id} className="flex h-7 items-center justify-between rounded-md px-1.5 text-[12px] text-fog hover:bg-surface">
              <span className="min-w-0 truncate">{variable.name}</span>
              <button
                type="button"
                aria-label={`Delete variable ${variable.name}`}
                title="Delete variable"
                onClick={() => actions.removeVariable(variable.id)}
                className="flex h-5 w-5 items-center justify-center rounded text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                <IconClose size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New variable name"
          aria-label="New variable name"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        />
        <button
          type="submit"
          className="h-8 rounded-md border border-line px-2 text-[12px] text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          Add
        </button>
      </form>
    </section>
  );
}
