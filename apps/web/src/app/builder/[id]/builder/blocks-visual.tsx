"use client";

import { CATEGORY_COLORS, CATEGORY_LABELS, type BlockCategory } from "@/lib/project-model/blocks";
import { getAnyBlockDef } from "@/lib/project-model/block-registry";
import type { ProjectModelBlock } from "@/types/project";

/**
 * Pure block visuals shared by the canvas, the palette, and the drag ghost:
 * the block icon set, the colored block shell, and a static (non-interactive)
 * renderer used while dragging. No builder/drag context in here — everything
 * is a function of the block definition and the block data.
 */

/** Small stroke icons, one per block type (24px viewBox, drawn for Ideaven). */
const BLOCK_ICON_PATHS: Record<string, string> = {
  "set-property": "M5 8h8m4 0h2M5 16h2m4 0h8M13 5.5v5M7 13.5v5",
  "set-variable": "M6.5 7h11v10h-11zM9.5 12h5",
  "change-variable": "M6.5 7h11v10h-11zM12 9.5v5M9.5 12h5",
  "show-message": "M4.5 6.5h15v9h-9.5l-4 3.5v-3.5h-1.5zM8 9.5h8M8 12h5",
  navigate: "M4.5 12h15m-6-6.5L20 12l-6.5 6.5",
  if: "M7 5v5.5A3.5 3.5 0 0 0 10.5 14H18m0 0-3-3m3 3-3 3",
  "play-sound": "M9 18.5V6l9-2v12.5M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm9-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  "stop-sound": "M4 9.5v5h3l4.5 4v-13l-4.5 4H4zM16.5 9.5l4.5 5m0-5-4.5 5",
  text: "M5 6.5V5h14v1.5M12 5v14M9.5 19h5",
  number: "M9 4.5 7.5 19.5M16.5 4.5 15 19.5M5 9h15M4 15h15",
  "get-property": "M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.8 15.8 20 20",
  "get-variable": "M6.5 7h11v10h-11zM13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
  join: "M9.5 14.5 14.5 9.5M8.5 12 6 14.5a3.5 3.5 0 0 0 5 5L13.5 17M15.5 12 18 9.5a3.5 3.5 0 0 0-5-5L10.5 7",
  equals: "M5 9.5h14M5 14.5h14",
  add: "M12 5v14M5 12h14",
};

const FALLBACK_ICON = "M6.5 6.5h11v11h-11z";

export function BlockIcon({ type, size = 13 }: { type: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d={BLOCK_ICON_PATHS[type] ?? FALLBACK_ICON} />
    </svg>
  );
}

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

export function blockColor(type: string): string {
  const def = getAnyBlockDef(type);
  return def ? CATEGORY_COLORS[def.category] : "#6f7789";
}

export function blockCategoryLabel(type: string): string {
  const def = getAnyBlockDef(type);
  return def ? CATEGORY_LABELS[def.category] : "Other";
}

export type { BlockCategory };

/** Shell style shared by real canvas blocks and ghost blocks. Longhand border
 * properties only — mixing the `border` shorthand with borderBottom overrides
 * elsewhere trips React's conflicting-style warning during rerenders. */
export function blockShellStyle(color: string, selected = false): React.CSSProperties {
  return {
    background: color,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: `rgb(10 12 18 / ${selected ? "0.55" : "0.35"})`,
    boxShadow: selected
      ? `0 0 0 2.5px color-mix(in srgb, ${color} 60%, white 8%), 0 6px 18px -6px rgb(0 0 0 / 0.6)`
      : "0 2px 8px -2px rgb(0 0 0 / 0.45)",
  };
}

// ---- static ghost rendering ---------------------------------------------------

/** A static, non-interactive block (drag ghost). Renders the whole subtree. */
export function GhostBlock({ block }: { block: ProjectModelBlock }) {
  const def = getAnyBlockDef(block.type);
  const color = blockColor(block.type);
  const parts = def
    ? parseLabel(def.label)
    : [{ text: block.type, ref: null as string | null }];

  return (
    <div className="relative inline-block w-max rounded-[10px]" style={blockShellStyle(color)}>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
        <span className="text-[#0b0e16]">
          <BlockIcon type={block.type} />
        </span>
        {parts.map((part, i) =>
          part.ref === null ? (
            <span key={i} className="text-[12.5px] font-medium text-[#0b0e16]">
              {part.text}
            </span>
          ) : def?.slots?.some((s) => s.key === part.ref) ? (
            <GhostSocket key={i} label={part.ref} filled={Boolean(block.slots?.[part.ref])} />
          ) : (
            <GhostInput key={i} label={part.ref} />
          ),
        )}
      </div>
      {def?.container ? (
        <div className="mx-3 mb-3 rounded-lg border border-dashed border-black/30 bg-black/25 p-2">
          {(block.children ?? []).map((child) => (
            <GhostBlock key={child.id} block={child} />
          ))}
          {(block.elseChildren ?? []).length > 0 ? (
            <div className="mt-2 border-t border-black/20 pt-2">
              {(block.elseChildren ?? []).map((child) => (
                <GhostBlock key={child.id} block={child} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Dashed socket placeholder shown on ghost blocks. */
function GhostSocket({ label, filled }: { label: string; filled: boolean }) {
  return (
    <span
      className={`inline-flex h-6 min-w-12 items-center justify-center rounded-[5px] px-1.5 text-[11px] ${
        filled ? "bg-black/30 text-white/80" : "border border-dashed border-black/35 bg-black/15 text-black/50"
      }`}
    >
      {filled ? "◇" : `◇ ${label}`}
    </span>
  );
}

function GhostInput({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 min-w-12 items-center justify-center rounded-[5px] bg-[rgb(10_12_18_/_0.28)] px-2 text-[11.5px] text-white/70">
      {label}
    </span>
  );
}

/** Ghost for a palette item (definition only, no model data yet). */
export function GhostPaletteBlock({ blockType }: { blockType: string }) {
  const def = getAnyBlockDef(blockType);
  if (!def) return null;
  const color = blockColor(blockType);
  const parts = parseLabel(def.label);
  return (
    <div className="relative inline-block w-max rounded-[10px]" style={blockShellStyle(color)}>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
        <span className="text-[#0b0e16]">
          <BlockIcon type={blockType} />
        </span>
        {parts.map((part, i) =>
          part.ref === null ? (
            <span key={i} className="text-[12.5px] font-medium text-[#0b0e16]">
              {part.text}
            </span>
          ) : def?.slots?.some((s) => s.key === part.ref) ? (
            <GhostSocket key={i} label={part.ref} filled={false} />
          ) : (
            <GhostInput key={i} label={part.ref} />
          ),
        )}
      </div>
      {def.container ? (
        <div className="mx-3 mb-3 h-10 rounded-lg border border-dashed border-black/30 bg-black/25" />
      ) : null}
    </div>
  );
}
