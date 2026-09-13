"use client";

import { useBuilder } from "./builder-context";
import { useBlocksDnd } from "./blocks-dnd";
import { getAnyBlockDef } from "@/lib/project-model/block-registry";
import { getDef, type FieldDef } from "@/lib/project-model/registry";
import type { ProjectModelBlock, ProjectModelComponent } from "@/types/project";
import { IconClose } from "@/components/visuals/icons";

/**
 * Shared block editors for the Blocks canvas and palette: typed input
 * editors, the value-socket pill, and small chrome controls. Everything
 * edits the one canonical IR through the builder actions — the canvas is a
 * view, never a second model. Drag gestures are owned by the pointer-based
 * drag controller (blocks-dnd); these components only mark their drop zones
 * and hand gesture starts to the canvas callbacks.
 */

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
      onPointerDown={(event) => event.stopPropagation()}
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
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
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
  const commit = (next: string | number | boolean) => actions.setBlockInput(handlerId, block.id, inputKey, next);

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
            label: `${componentLabelOf(c)} · ${getDef(c.type)?.label ?? c.type}`,
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

  // boolean literal: a real true/false select (never a string pretending).
  if (spec.kind === "boolean") {
    return (
      <select
        value={value === true ? "true" : "false"}
        aria-label={spec.label}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => commit(event.target.value === "true")}
        className="h-7 w-20 rounded-[5px] border border-black/20 bg-[rgb(10_12_18_/_0.28)] px-1 text-[12px] text-white/95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/50"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  // text / number literal inputs
  return (
    <input
      type={spec.kind === "number" ? "number" : "text"}
      defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      placeholder={spec.label}
      aria-label={spec.label}
      onPointerDown={(event) => event.stopPropagation()}
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

function componentLabelOf(node: ProjectModelComponent): string {
  const text = node.props?.text ?? node.props?.label;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : node.type;
}

// ---- expression slot -----------------------------------------------------------------
// One reporter socket: shows the wired expression pill (grabbable to another
// socket or onto the canvas) or an empty dashed socket that accepts palette /
// canvas reporters. Drop resolution happens on the canvas via the data-dz
// attributes; the drag controller's target drives the highlight.

export function SlotChip({
  block,
  slotKey,
  handlerId,
  components,
  color,
  beginDrag,
}: {
  block: ProjectModelBlock;
  slotKey: string;
  handlerId: string;
  components: ProjectModelComponent[];
  color: string;
  beginDrag: (
    event: React.PointerEvent,
    handlerId: string,
    ownerBlockId: string,
    slotKey: string,
    expr: ProjectModelBlock,
  ) => void;
}) {
  void color;
  const { actions } = useBuilder();
  const dnd = useBlocksDnd();
  const expr = block.slots?.[slotKey];

  const isReportedDrag = dnd.drag?.kind === "reporter";
  const isOwnDrag =
    dnd.drag?.source.type === "slot" &&
    dnd.drag.source.ownerBlockId === block.id &&
    dnd.drag.source.slotKey === slotKey;
  const active =
    isReportedDrag &&
    dnd.target?.type === "socket" &&
    dnd.target.handlerId === handlerId &&
    dnd.target.blockId === block.id &&
    dnd.target.slotKey === slotKey;

  if (!expr || isOwnDrag) {
    return (
      <span
        data-dz="socket"
        data-h={handlerId}
        data-block={block.id}
        data-slot={slotKey}
        role="button"
        tabIndex={0}
        aria-label={`Empty ${slotKey} socket — drop a value block here`}
        className={`inline-flex h-7 min-w-16 items-center justify-center rounded-[5px] border border-dashed px-2 text-[12px] transition-colors ${
          active
            ? "border-solid border-mint bg-mint/20 shadow-[0_0_0_2px_rgba(70,227,180,0.4)]"
            : isReportedDrag
              ? "border-mint/60 bg-[rgb(10_12_18_/_0.14)]"
              : "border-black/35 bg-[rgb(10_12_18_/_0.14)]"
        } ${isOwnDrag ? "opacity-40" : ""}`}
      >
        <span className="text-mist">＿</span>
      </span>
    );
  }

  const def = getAnyBlockDef(expr.type);

  return (
    <span
      data-dz="socket"
      data-h={handlerId}
      data-block={block.id}
      data-slot={slotKey}
      onPointerDown={(event) => {
        const target = event.target as Element;
        if (target.closest("input, select, textarea, button")) return;
        event.stopPropagation();
        beginDrag(event, handlerId, block.id, slotKey, expr);
      }}
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex cursor-grab items-center gap-1 rounded-[5px] border border-black/25 px-1.5 py-0.5 transition-shadow active:cursor-grabbing ${
        active ? "shadow-[0_0_0_2.5px_rgba(70,227,180,0.65)]" : ""
      }`}
      style={{ background: "rgb(10 12 18 / 0.28)" }}
      aria-label={`${slotKey} value — drag to move`}
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
          <SlotChip block={expr} slotKey="a" handlerId={handlerId} components={components} color={color} beginDrag={beginDrag} />
          <span className="text-[12px] text-mist">{expr.type === "join" ? "&" : "="}</span>
          <SlotChip block={expr} slotKey="b" handlerId={handlerId} components={components} color={color} beginDrag={beginDrag} />
        </>
      ) : (
        <span className="text-[12px] text-mist">{expr.type}</span>
      )}
      <button
        type="button"
        aria-label="Clear value"
        title="Clear"
        onPointerDown={(event) => event.stopPropagation()}
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
