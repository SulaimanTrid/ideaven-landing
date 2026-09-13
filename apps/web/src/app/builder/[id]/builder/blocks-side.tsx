"use client";

import { useMemo, useState } from "react";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/project-model/blocks";
import {
  allExpressionDefs,
  allStatementDefs,
  createRegistryBlock,
  extensionNameFor,
  getAnyBlockDef,
  isExtensionBlock,
} from "@/lib/project-model/block-registry";
import { eventsFor, getDef, EVENT_LABELS, SCREEN_EVENTS, ENTITY_TYPES, eventLabel, translatedBlockLabel, translatedEventLabel, translatedCategoryLabel } from "@/lib/project-model/registry";
import { entitiesOf, touchEventFor, targetOfTouchEvent } from "@/lib/project-model/scene";
import { useI18n } from "@/lib/i18n/i18n";
import { useBuilder, componentLabel } from "./builder-context";
import { useBlocksDnd } from "./blocks-dnd";
import { BlockIcon } from "./blocks-visual";
import { IconClose, IconPlus } from "@/components/visuals/icons";
import type { ProjectModelComponent } from "@/types/project";

/**
 * Side panels for Blocks mode: the handler list for the active screen (left),
 * plus the statement palette and project variables (right). Handlers appear
 * automatically from the components that exist on the screen. The palette is
 * context-aware: with a component handler selected it surfaces blocks
 * pre-wired to that component, and blocks declared by installed extensions
 * group under the extension's name.
 */
export function BlocksSidePanel() {
  return <HandlersPanel />;
}

function HandlersPanel() {
  const { model, activeScreenId, selectedHandlerId, selectHandler, actions } = useBuilder();
  const { t } = useI18n();
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
  const sceneEntities = screen ? entitiesOf(screen) : [];
  // Scene entities expose dynamic touch events: "when <this> touches <other>".
  const touchEvents =
    target && ENTITY_TYPES.has(target.type)
      ? sceneEntities.filter((e) => e.id !== target.id).map((e) => touchEventFor(e.id))
      : [];
  const availableEvents = [
    ...(target ? eventsFor(target.type) : [...SCREEN_EVENTS]),
    ...touchEvents,
  ];
  /** Human label for any event, resolving scene touch targets by name. */
  const eventDisplayName = (name: string): string => {
    const touched = targetOfTouchEvent(name);
    if (touched === null) return translatedEventLabel(name, t as unknown as (key: string) => string);
    const other = sceneEntities.find((e) => e.id === touched);
    return `Touches ${other ? componentLabel(other) : "a missing entity"}`;
  };

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
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Event handlers</h3>
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
          const eventText = eventLabel(handler.event) === "Touches"
            ? eventDisplayName(handler.event)
            : translatedEventLabel(handler.event, t as unknown as (key: string) => string);
          const label =
            handler.componentId === null
              ? `${t("block.when")} Screen ${translatedEventLabel(handler.event, t as unknown as (key: string) => string)}`
              : component
                ? `${componentLabel(component)} ${eventText}`
                : `Missing component ${translatedEventLabel(handler.event, t as unknown as (key: string) => string)}`;
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
              .filter((c) => eventsFor(c.type).length > 0 || ENTITY_TYPES.has(c.type))
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
                {eventDisplayName(name)}
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

/** Statement palette (right rail in Blocks mode): search, drag sources, click-to-add.
 * `extensionTick` bumps whenever installed extensions register, so the
 * vocabulary memo re-derives with the freshly registered blocks. */
export function BlockPalette({ extensionTick = 0 }: { extensionTick?: number }) {
  const { model, activeScreenId, selectedHandlerId, actions } = useBuilder();
  const { t } = useI18n();
  const dnd = useBlocksDnd();
  const screen = model.screens.find((s) => s.id === activeScreenId);
  const handler = screen?.logic?.handlers.find((h) => h.id === selectedHandlerId) ?? null;

  const [query, setQuery] = useState("");

  const statements = useMemo(() => allStatementDefs(), [extensionTick]);
  const reporters = useMemo(() => allExpressionDefs(), [extensionTick]);

  const q = query.trim().toLowerCase();
  const matches = (label: string, type: string, category: string) =>
    q === "" || label.toLowerCase().includes(q) || type.toLowerCase().includes(q) || category.toLowerCase().includes(q);

  // Context: the handler's component gets a dedicated group with blocks
  // pre-wired to it (Button1 → set/get-property for Button1 at the top).
  const contextComponent = handler?.componentId
    ? (() => {
        const list: ProjectModelComponent[] = [];
        const walk = (nodes: ProjectModelComponent[]) => {
          for (const node of nodes) {
            list.push(node);
            if (node.children) walk(node.children);
          }
        };
        if (screen) walk(screen.components);
        return list.find((c) => c.id === handler.componentId) ?? null;
      })()
    : null;

  // Typing a variable's name surfaces that variable's data blocks first.
  const variableMatches = useMemo(() => {
    if (q === "") return [];
    return model.variables.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 3);
  }, [model.variables, q]);

  const add = (type: string, preset?: { inputs?: Record<string, string | number | boolean> }) => {
    if (!handler) return;
    const block = createRegistryBlock(type, preset);
    if (!block) return;
    actions.addStatement(handler.id, null, handler.body.length, block);
  };

  const startStatementDrag = (
    event: React.PointerEvent,
    type: string,
    preset?: { inputs?: Record<string, string | number | boolean> },
  ) => {
    dnd.begin({ type: "palette-statement", blockType: type, preset }, event);
  };

  const startReporterDrag = (event: React.PointerEvent, type: string) => {
    dnd.begin({ type: "palette-reporter", blockType: type }, event);
  };

  // Group statements: built-in categories first, then one group per extension.
  const groups = useMemo(() => {
    const byCategory = new Map<string, typeof statements>();
    const byExtension = new Map<string, typeof statements>();
    for (const def of statements) {
      if (!matches(translatedBlockLabel(def, t as unknown as (key: string) => string), def.type, translatedCategoryLabel(def.category, t as unknown as (key: string) => string))) continue;
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
  }, [statements, q, extensionTick]);

  // Palette adapts to the project type (realignment §11): game projects
  // surface flow/state/control first — the gameplay-oriented categories —
  // while app projects lead with UI. Same IR, same blocks, different order.
  const isGame = model.type === "game";
  const categoryOrder = isGame
    ? ["navigation", "variables", "control", "audio", "ui", "text", "logic"]
    : ["ui", "variables", "navigation", "control", "audio", "text", "logic"];
  const orderedCategories = [...groups.byCategory.entries()].sort(
    (a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]),
  );

  const reporterItems = reporters.filter((def) => matches(translatedBlockLabel(def, t as unknown as (key: string) => string), def.type, translatedCategoryLabel(def.category, t as unknown as (key: string) => string)));
  const variableReporters = q !== "" ? reporterItems.filter((def) => def.type === "get-variable") : [];

  return (
    <div className="flex flex-col gap-4 p-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search blocks… (Ctrl+F)"
        aria-label="Search blocks"
        data-block-search
        onKeyDown={(event) => event.stopPropagation()}
        className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      />

      {variableMatches.length > 0 ? (
        <section aria-label="Blocks for matching variables">
          <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
            For variable{variableMatches.length > 1 ? "s" : ""} {variableMatches.map((v) => `“${v.name}”`).join(", ")}
          </h3>
          <div className="flex flex-col gap-1.5">
            {["set-variable", "change-variable"].map((type) => (
              <PaletteStatement
                key={type}
                blockType={type}
                onAdd={() => add(type, { inputs: { name: variableMatches[0]?.name ?? "" } })}
                onDragStart={(event) =>
                  startStatementDrag(event, type, { inputs: { name: variableMatches[0]?.name ?? "" } })
                }
                disabled={!handler}
              />
            ))}
          </div>
        </section>
      ) : null}

      {contextComponent ? (
        <section aria-label={`Blocks for ${componentLabel(contextComponent)}`}>
          <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
            For {componentLabel(contextComponent)}
          </h3>
          <div className="flex flex-col gap-1.5">
            <PaletteStatement
              blockType="set-property"
              onAdd={() => add("set-property", { inputs: { componentId: contextComponent.id } })}
              onDragStart={(event) =>
                startStatementDrag(event, "set-property", { inputs: { componentId: contextComponent.id } })
              }
            />
            <PaletteStatement
              blockType="show-message"
              onAdd={() => add("show-message")}
              onDragStart={(event) => startStatementDrag(event, "show-message")}
            />
          </div>
        </section>
      ) : null}

      <section aria-label="Statement blocks">
        <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
          Statement blocks
        </h3>
        {!handler ? (
          <p className="px-1 text-[12px] leading-5 text-mist">
            Click adds to the selected handler — pick one on the left. You can
            still drag blocks onto the canvas: drop them on a script to connect,
            or on free canvas to park them as drafts.
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {orderedCategories.map(([category, defs]) => (
            <div key={category} className="flex flex-col gap-1.5">
              <p className="px-1 text-[11px] font-medium text-mist">{translatedCategoryLabel(category as string, t as unknown as (key: string) => string)}</p>
              {defs.map((def) => (
                <PaletteStatement
                  key={def.type}
                  blockType={def.type}
                  labelOverride={translatedBlockLabel(def, t as unknown as (key: string) => string)}
                  onAdd={() => add(def.type)}
                  onDragStart={(event) => startStatementDrag(event, def.type)}
                  disabled={!handler}
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
                  blockType={def.type}
                  labelOverride={translatedBlockLabel(def, t as unknown as (key: string) => string)}
                  onAdd={() => add(def.type)}
                  onDragStart={(event) => startStatementDrag(event, def.type)}
                  disabled={!handler}
                />
              ))}
            </div>
          ))}
          {handler && groups.byCategory.size === 0 && groups.byExtension.size === 0 ? (
            <p className="px-1 text-[12px] text-mist">No blocks match “{query}”.</p>
          ) : null}
        </div>
      </section>

      <section aria-label="Value blocks">
        <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
          Values · drag into a socket
        </h3>
        {variableReporters.length > 0 ? (
          <div className="mb-2 flex flex-col gap-1.5">
            {variableMatches.map((v) => (
              <PaletteReporter
                key={v.id}
                blockType="get-variable"
                label={`variable ${v.name}`}
                onDragStart={(event) =>
                  dnd.begin(
                    { type: "palette-reporter", blockType: "get-variable", preset: { inputs: { name: v.name } } },
                    event,
                  )
                }
              />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {reporterItems
            .filter((def) => !(q !== "" && def.type === "get-variable"))
            .map((def) => (
              <PaletteReporter
                key={def.type}
                blockType={def.type}
                label={translatedBlockLabel(def, t as unknown as (key: string) => string).replace(/\{(\w+)\}/g, "＿")}
                onDragStart={(event) => startReporterDrag(event, def.type)}
              />
            ))}
          {reporterItems.length === 0 ? (
            <p className="px-1 text-[12px] text-mist">No value blocks match.</p>
          ) : null}
        </div>
      </section>

      <VariablesPanel />

      <p className="px-1 text-[11px] leading-5 text-mist">
        Drag a block onto a script to connect it, or onto free canvas to park
        it. The same logic drives the generated code in Code mode.
      </p>
    </div>
  );
}

function PaletteStatement({
  blockType,
  labelOverride,
  onAdd,
  onDragStart,
  disabled,
}: {
  blockType: string;
  labelOverride?: string;
  onAdd: () => void;
  onDragStart: (event: React.PointerEvent) => void;
  disabled?: boolean;
}) {
  const dnd = useBlocksDnd();
  const color = CATEGORY_COLORS[getAnyBlockDef(blockType)?.category ?? "ui"];
  const label = labelOverride ?? blockType;
  return (
    <button
      type="button"
      data-palette-statement={blockType}
      onPointerDown={onDragStart}
      onClick={() => {
        if (!dnd.wasDrag()) onAdd();
      }}
      title={disabled ? "Select a handler first — or drag onto the canvas" : "Click to append · drag to place"}
      aria-disabled={disabled || undefined}
      className={`flex cursor-grab items-center gap-1.5 rounded-[9px] px-2.5 py-2 text-left text-[12px] font-medium text-[#0b0e16] transition-transform hover:translate-x-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/50 active:cursor-grabbing ${
        disabled ? "opacity-80" : ""
      }`}
      style={{
        background: color,
        border: "1px solid rgb(10 12 18 / 0.3)",
        boxShadow: "0 2px 6px -2px rgb(0 0 0 / 0.5)",
      }}
    >
      <span className="shrink-0">
        <BlockIcon type={blockType} />
      </span>
      <span className="min-w-0">{label.replace(/\{(\w+)\}/g, "＿")}</span>
    </button>
  );
}

function PaletteReporter({
  blockType,
  label,
  onDragStart,
}: {
  blockType: string;
  label: string;
  onDragStart: (event: React.PointerEvent) => void;
}) {
  const color = CATEGORY_COLORS[getAnyBlockDef(blockType)?.category ?? "ui"];
  return (
    <span
      data-palette-reporter={blockType}
      draggable={false}
      onPointerDown={onDragStart}
      title="Drag into a value socket on the canvas — or onto free canvas to park it"
      className="cursor-grab rounded-[8px] px-2.5 py-1 text-[11.5px] font-medium text-[#0b0e16] active:cursor-grabbing"
      style={{
        background: color,
        border: "1px solid rgb(10 12 18 / 0.3)",
      }}
    >
      {label}
    </span>
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
      <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
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
