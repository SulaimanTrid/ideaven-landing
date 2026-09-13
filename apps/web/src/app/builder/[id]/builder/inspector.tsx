"use client";

import { useEffect, useState } from "react";
import { eventsFor, getDef, EVENT_LABELS, type FieldDef } from "@/lib/project-model/registry";
import { locateComponent } from "@/lib/project-model/ops";
import { useBuilder } from "./builder-context";
import { IconCopy, IconTrash } from "@/components/visuals/icons";

/**
 * The properties inspector for the selected component — or, when nothing is
 * selected, the active screen's presentation. Only fields relevant to the
 * selected type are shown; every edit commits to the canonical model.
 */
export function Inspector() {
  const { model, selectedId, activeScreenId } = useBuilder();

  if (!selectedId) {
    return <ScreenInspector screenId={activeScreenId} />;
  }

  const location = locateComponent(model, selectedId);
  if (!location) {
    return (
      <p className="px-3 py-4 text-[12px] text-mist">
        The selected component is no longer in the model.
      </p>
    );
  }

  return <ComponentInspector nodeId={selectedId} />;
}

// ---- screen inspector -----------------------------------------------------------

function ScreenInspector({ screenId }: { screenId: string }) {
  const { model, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === screenId);
  if (!screen) return null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <Section title="Screen">
        <StaticRow label="Name" value={screen.name} />
        <StaticRow label="ID" value={screen.id} mono />
        <StaticRow label="Components" value={String(screen.components.length)} />
      </Section>
      <Section title="Appearance">
        <ColorField
          label="Background"
          value={typeof screen.styles?.background === "string" ? screen.styles.background : "#ffffff"}
          onChange={(value) => actions.updateScreenStyles(screenId, { background: value })}
        />
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-[12px] text-fog">Scrollable screen</span>
          <input
            type="checkbox"
            checked={screen.styles?.scrollable === true}
            onChange={(event) => actions.updateScreenStyles(screenId, { scrollable: event.target.checked })}
            className="h-4 w-4 accent-[#8f7bff]"
          />
        </label>
      </Section>
      <p className="px-1 text-[11px] leading-5 text-mist">
        Select a component on the canvas or in the tree to edit its properties.
      </p>
    </div>
  );
}

// ---- component inspector ----------------------------------------------------------

function ComponentInspector({ nodeId }: { nodeId: string }) {
  const { model, actions } = useBuilder();
  const location = locateComponent(model, nodeId);
  if (!location) return null;

  const node = location.node;
  const def = getDef(node.type);

  if (!def) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[12px] text-mist">Unknown component type “{node.type}”.</p>
        <DangerActions nodeId={nodeId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <header className="flex items-center gap-2 px-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet/15 text-violet">
          <def.glyph size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{def.label}</p>
          <p className="truncate font-mono text-[10px] text-mist">{node.id}</p>
        </div>
      </header>

      {def.propFields.length > 0 ? (
        <Section title="Properties">
          {def.propFields.map((field) => (
            <InspectorField
              key={field.key}
              field={field}
              value={node.props?.[field.key]}
              onCommit={(value) => actions.updateProps(node.id, { [field.key]: value })}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Style">
        {def.styleFields.map((field) => (
          <InspectorField
            key={field.key}
            field={field}
            value={node.styles?.[field.key]}
            onCommit={(value) => actions.updateStyles(node.id, { [field.key]: value })}
          />
        ))}
      </Section>

      {eventsFor(def.type).length > 0 ? (
        <EventsSection nodeId={node.id} componentType={def.type} />
      ) : null}

      <DangerActions nodeId={nodeId} />
    </div>
  );
}

/** Event list for the selected component — bridges Design into Blocks. */
function EventsSection({ nodeId, componentType }: { nodeId: string; componentType: string }) {
  const { model, activeScreenId, setMode, selectHandler, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId);
  const handlers = screen?.logic?.handlers ?? [];

  const addHandlerFor = (event: string) => {
    const id = actions.addHandler(nodeId, event);
    selectHandler(id);
    setMode("blocks");
  };

  return (
    <Section title="Events">
      {eventsFor(componentType).map((event) => {
        const count = handlers.filter((h) => h.componentId === nodeId && h.event === event).length;
        return (
          <div key={event} className="flex items-center justify-between gap-2 py-1">
            <span className="text-[12px] text-fog">
              {EVENT_LABELS[event] ?? event}
              {count > 0 ? (
                <span className="ml-1.5 rounded border border-mint/30 bg-mint/10 px-1 py-px text-[10px] text-mint">
                  {count} handler{count === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => addHandlerFor(event)}
              className="h-7 rounded-md border border-line px-2 text-[11px] text-fog transition-colors hover:border-violet hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              + Blocks
            </button>
          </div>
        );
      })}
    </Section>
  );
}

function DangerActions({ nodeId }: { nodeId: string }) {
  const { actions } = useBuilder();
  return (
    <div className="flex gap-2 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => actions.duplicateComponent(nodeId)}
        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line text-[12px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconCopy size={13} />
        Duplicate
      </button>
      <button
        type="button"
        onClick={() => actions.removeComponent(nodeId)}
        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose/30 text-[12px] font-medium text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconTrash size={13} />
        Delete
      </button>
    </div>
  );
}

// ---- fields -------------------------------------------------------------------------

function InspectorField({
  field,
  value,
  onCommit,
}: {
  field: FieldDef;
  value: unknown;
  onCommit: (value: string | number | boolean | undefined) => void;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-[12px] text-fog">{field.label}</span>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onCommit(event.target.checked)}
            className="h-4 w-4 accent-[#8f7bff]"
          />
        </label>
      );
    case "select":
      return (
        <label className="flex flex-col gap-1 py-0.5">
          <span className="text-[12px] text-fog">{field.label}</span>
          <select
            value={typeof value === "string" || typeof value === "number" ? String(value) : (field.options?.[0]?.value ?? "")}
            onChange={(event) => {
              const option = field.options?.find((o) => o.value === event.target.value);
              onCommit(option ? option.value : undefined);
            }}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "color":
      return (
        <ColorField
          label={field.label}
          value={typeof value === "string" ? value : ""}
          hint={field.defaultHint}
          onChange={onCommit}
        />
      );
    case "number":
      return (
        <TextField
          label={field.label}
          value={typeof value === "number" ? String(value) : ""}
          placeholder={field.placeholder}
          numeric={{ min: field.min, max: field.max }}
          onCommit={onCommit}
        />
      );
    case "textarea":
      return (
        <label className="flex flex-col gap-1 py-0.5">
          <span className="text-[12px] text-fog">{field.label}</span>
          <textarea
            defaultValue={typeof value === "string" ? value : ""}
            placeholder={field.placeholder}
            rows={2}
            onBlur={(event) => onCommit(event.target.value)}
            className="w-full resize-y rounded-md border border-line bg-panel px-2 py-1.5 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
        </label>
      );
    default:
      return (
        <TextField
          label={field.label}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onCommit={onCommit}
        />
      );
  }
}

/** Text/number input with commit-on-blur/Enter so history stays readable. */
function TextField({
  label,
  value,
  placeholder,
  numeric,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  numeric?: { min?: number; max?: number };
  onCommit: (value: string | number | boolean | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft === value) return;
    if (numeric) {
      const trimmed = draft.trim();
      if (trimmed === "") {
        onCommit(undefined);
        return;
      }
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) {
        setDraft(value);
        return;
      }
      const clamped = Math.min(numeric.max ?? Infinity, Math.max(numeric.min ?? -Infinity, parsed));
      onCommit(Math.round(clamped));
      return;
    }
    onCommit(draft);
  };

  return (
    <label className="flex flex-col gap-1 py-0.5">
      <span className="text-[12px] text-fog">{label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          event.stopPropagation();
        }}
        placeholder={placeholder}
        inputMode={numeric ? "numeric" : undefined}
        className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === value) return;
    if (trimmed === "") {
      onChange(undefined);
      return;
    }
    // Accept #rgb/#rrggbb and bare hex; anything else is rejected quietly.
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
    if (!hex || hex[1] === undefined) {
      setDraft(value);
      return;
    }
    const body = hex[1].toLowerCase();
    if (body.length === 3) {
      onChange(`#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`);
    } else {
      onChange(`#${body}`);
    }
  };

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <span className="text-[12px] text-fog">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#ffffff"}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line bg-panel p-0.5"
        />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            event.stopPropagation();
          }}
          placeholder={hint ?? "#hex"}
          aria-label={label}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 font-mono text-[12px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        />
      </div>
    </div>
  );
}

// ---- chrome ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
        {title}
      </h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function StaticRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[12px] text-fog">{label}</span>
      <span className={`min-w-0 truncate text-[12px] text-ink ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
