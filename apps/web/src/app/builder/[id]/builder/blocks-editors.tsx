"use client";

import { useState } from "react";
import { CATEGORY_COLORS, setSlot as setSlotOp } from "@/lib/project-model/blocks";
import { createRegistryBlock, getAnyBlockDef } from "@/lib/project-model/block-registry";
import { useBuilder, componentLabel } from "./builder-context";
import { getDef, type FieldDef } from "@/lib/project-model/registry";
import type { ProjectModelBlock, ProjectModelComponent } from "@/types/project";
import { IconClose } from "@/components/visuals/icons";

/**
 * Shared block editors for the Blocks canvas and palette: label parsing,
 * typed input editors, and the drag payloads that move blocks between the
 * palette and the canvas. Everything edits the one canonical IR through the
 * builder actions — the canvas is a view, never a second model.
 */

/** Split a block label into text segments and {placeholder} references. */
export function parseLabel(label: string): { text: string; ref: string | null }[] {
  const parts: { text: string; ref: string | null }[] = [];
  const regex = /\{(\w+)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(label)) !== null) {
    if (match.index > last) parts.push({ text: label.slice(last, match.index), ref: null });
    parts.push({ text: match[1] ?? "", ref: match[1] ?? null });
    last = match.index + match[0].length;
  }
  if (last < label.length) parts.push({ text: label.slice(last), ref: null });
  return parts;
}

// ---- drag payloads -----------------------------------------------------------------

/** What travels on the dataTransfer between palette, canvas stacks, and slots. */
export type BlockDragPayload =
  | { kind: "statement-new"; blockType: string }
  | { kind: "statement-move"; handlerId: string; blockId: string }
  | { kind: "reporter-new"; blockType: string }
  | {
      kind: "reporter-move";
      handlerId: string;
      ownerBlockId: string;
      slotKey: string;
      expr: ProjectModelBlock;
    };

export const DND_MIME = "application/x-ideaven-block";

export function setDragPayload(event: React.DragEvent, payload: BlockDragPayload): void {
  event.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "copyMove";
}

export function readDragPayload(event: React.DragEvent): BlockDragPayload | null {
  const raw = event.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BlockDragPayload;
  } catch {
    return null;
  }
}

export function categoryColor(type: string): string {
  const def = getAnyBlockDef(type);
  return def ? CATEGORY_COLORS[def.category] : "#6f7789";
}

// ---- small controls ------------------------------------------------------------------

export function MiniButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-5 w-5 items-center justify-center rounded border border-line bg-panel text-[11px] leading-none text-mist transition-colors hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
        danger ? "hover:text-rose" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function SmallSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
}: {
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      className="h-7 max-w-44 truncate rounded-[5px] border border-black/20 bg-[rgb(10_12_18_/_0.28)] px-1.5 text-[12px] text-white/95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/50 disabled:opacity-50 [&_option]:text-ink"
    >
      <option value="">choose…</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// ---- typed input editor --------------------------------------------------------------

export function InputEditor({
  block,
  inputKey,
  handlerId,
  components,
}: {
  block: ProjectModelBlock;
  inputKey: string;
  handlerId: string;
  components: ProjectModelComponent[];
}) {
  const { model, actions } = useBuilder();
  const def = getAnyBlockDef(block.type);
  const spec = def?.inputs?.find((i) => i.key === inputKey);
  if (!spec) return <span className="text-[13px] text-mist">{`{${inputKey}}`}</span>;

  const value = block.inputs?.[inputKey];
  const commit = (next: string | number) => actions.setBlockInput(handlerId, block.id, inputKey, next);

  if (spec.kind === "component") {
    const known = components.some((c) => c.id === value);
    return (
      <SmallSelect
        ariaLabel={spec.label}
        value={typeof value === "string" ? value : ""}
        onChange={commit}
        options={[
          ...components.map((c) => ({
            value: c.id,
            label: `${componentLabel(c)} · ${getDef(c.type)?.label ?? c.type}`,
          })),
          ...(typeof value === "string" && value !== "" && !known
            ? [{ value, label: "(missing component)" }]
            : []),
        ]}
      />
    );
  }

  if (spec.kind === "property") {
    const componentId = typeof block.inputs?.componentId === "string" ? block.inputs.componentId : "";
    const component = components.find((c) => c.id === componentId);
    const componentDef = component ? getDef(component.type) : undefined;
    return (
      <SmallSelect
        ariaLabel={spec.label}
        value={typeof value === "string" ? value : ""}
        onChange={commit}
        disabled={!componentDef}
        options={(componentDef?.propFields ?? []).map((field: FieldDef) => ({
          value: field.key,
          label: field.label,
        }))}
      />
    );
  }

  if (spec.kind === "screen") {
    return (
      <SmallSelect
        ariaLabel={spec.label}
        value={typeof value === "string" ? value : ""}
        onChange={commit}
        options={model.screens.map((s) => ({ value: s.id, label: s.name }))}
      />
    );
  }

  if (spec.kind === "variable") {
    return (
      <SmallSelect
        ariaLabel={spec.label}
        value={typeof value === "string" ? value : ""}
        onChange={commit}
        options={[
          ...model.variables.map((v) => ({ value: v.name, label: v.name })),
          ...(typeof value === "string" && value !== "" && !model.variables.some((v) => v.name === value)
            ? [{ value, label: `${value} (deleted)` }]
            : []),
        ]}
      />
    );
  }

  // text / number literal inputs
  return (
    <input
      type={spec.kind === "number" ? "number" : "text"}
      defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      placeholder={spec.label}
      aria-label={spec.label}
      onMouseDown={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const raw = event.target.value;
        if (spec.kind === "number") {
          const parsed = Number(raw);
          commit(Number.isNaN(parsed) ? 0 : parsed);
        } else {
          commit(raw);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        event.stopPropagation();
      }}
      className="h-7 w-28 rounded-[5px] border border-black/20 bg-[rgb(10_12_18_/_0.28)] px-2 text-[12px] text-white/95 placeholder:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/50"
    />
  );
}

// ---- expression slot -----------------------------------------------------------------
// One reporter socket: shows the wired expression pill (draggable to another
// socket) or an empty dashed socket that accepts palette/canvas reporters.

export function SlotChip({
  block,
  slotKey,
  handlerId,
  components,
  color,
}: {
  block: ProjectModelBlock;
  slotKey: string;
  handlerId: string;
  components: ProjectModelComponent[];
  color: string;
}) {
  const { model, activeScreenId, actions, commitModel } = useBuilder();
  const [over, setOver] = useState(false);
  const expr = block.slots?.[slotKey];

  const accept = (payload: BlockDragPayload) => {
    if (payload.kind === "reporter-new") {
      const created = createRegistryBlock(payload.blockType);
      if (created) actions.setSlot(handlerId, block.id, slotKey, created);
      return;
    }
    if (payload.kind === "reporter-move") {
      const same =
        payload.handlerId === handlerId && payload.ownerBlockId === block.id && payload.slotKey === slotKey;
      if (same) return;
      const exprClone: ProjectModelBlock = JSON.parse(JSON.stringify(payload.expr));
      // One undoable step: clear the old socket, wire the new one.
      const cleared = setSlotOp(model, activeScreenId, handlerId, payload.ownerBlockId, payload.slotKey, null);
      commitModel(setSlotOp(cleared, activeScreenId, handlerId, block.id, slotKey, exprClone));
    }
  };

  if (!expr) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={`Empty ${slotKey} socket — drop or click to add a value`}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOver(false);
          const payload = readDragPayload(event);
          if (payload) accept(payload);
        }}
        className={`inline-flex h-7 min-w-16 items-center justify-center rounded-[5px] border border-dashed border-black/35 px-2 text-[12px] text-black/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/50 ${
          over ? "border-solid bg-black/20 text-black/70" : "bg-[rgb(10_12_18_/_0.14)]"
        }`}
      >
        <span className="text-mist">＿</span>
      </span>
    );
  }

  const def = getAnyBlockDef(expr.type);

  return (
    <span
      draggable
      onDragStart={(event) => {
        setDragPayload(event, {
          kind: "reporter-move",
          handlerId,
          ownerBlockId: block.id,
          slotKey,
          expr: JSON.parse(JSON.stringify(expr)),
        });
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-[5px] border border-black/25 px-1.5 py-0.5"
      style={{ background: "rgb(10 12 18 / 0.28)" }}
    >
      {def?.inputs?.some((i) => i.key === "value") && expr.type !== "get-variable" ? (
        <InputEditor block={expr} inputKey="value" handlerId={handlerId} components={components} />
      ) : expr.type === "get-property" ? (
        <>
          <InputEditor block={expr} inputKey="componentId" handlerId={handlerId} components={components} />
          <span className="text-mist">.</span>
          <InputEditor block={expr} inputKey="property" handlerId={handlerId} components={components} />
        </>
      ) : expr.type === "get-variable" ? (
        <InputEditor block={expr} inputKey="name" handlerId={handlerId} components={components} />
      ) : expr.type === "join" || expr.type === "equals" ? (
        <>
          <SlotChip block={expr} slotKey="a" handlerId={handlerId} components={components} color={color} />
          <span className="text-[12px] text-mist">{expr.type === "join" ? "&" : "="}</span>
          <SlotChip block={expr} slotKey="b" handlerId={handlerId} components={components} color={color} />
        </>
      ) : (
        <span className="text-[12px] text-mist">{expr.type}</span>
      )}
      <button
        type="button"
        aria-label="Clear value"
        title="Clear"
        onClick={(event) => {
          event.stopPropagation();
          actions.setSlot(handlerId, block.id, slotKey, null);
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-mist transition-colors hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconClose size={11} />
      </button>
    </span>
  );
}
