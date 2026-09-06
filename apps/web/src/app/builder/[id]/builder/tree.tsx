"use client";

import { useState } from "react";
import { getDef } from "@/lib/project-model/registry";
import { useBuilder, componentLabel, type DragPayload } from "./builder-context";
import type { ProjectModelComponent } from "@/types/project";
import {
  IconChevronLeft,
  IconCopy,
  IconTrash,
} from "@/components/visuals/icons";

/**
 * The layer tree: the screen's component hierarchy with selection, expand/
 * collapse, reorder (up/down within the parent), duplicate, delete, and
 * drag-to-canvas for moving/nesting.
 */
export function ComponentTree() {
  const { model, activeScreenId } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId) ?? model.screens[0];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!screen || screen.components.length === 0) {
    return (
      <p className="px-3 py-4 text-[12px] leading-5 text-mist">
        Nothing on this screen yet. Drag a component from the palette onto the canvas.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-px p-1.5" role="tree" aria-label="Component tree">
      {screen.components.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: ProjectModelComponent;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { model, activeScreenId, selectedId, select, actions, draggingRef } = useBuilder();
  const def = getDef(node.type);
  const selected = selectedId === node.id;
  const hasChildren = (node.children ?? []).length > 0;
  const isCollapsed = collapsed.has(node.id);

  const onDragStart = (event: React.DragEvent) => {
    const payload: DragPayload = { kind: "move", componentId: node.id, screenId: activeScreenId };
    draggingRef.current = payload;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  };

  return (
    <li role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined}>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={() => {
          draggingRef.current = null;
        }}
        title="Drag onto the canvas to move"
        onClick={() => select(node.id)}
        className={`group flex h-7 cursor-default items-center gap-1 rounded-md pr-1 text-[12px] transition-colors ${
          selected ? "bg-violet/15 text-ink" : "text-fog hover:bg-surface"
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isCollapsed ? `Expand ${componentLabel(node)}` : `Collapse ${componentLabel(node)}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            <IconChevronLeft
              size={12}
              style={{ transform: isCollapsed ? undefined : "rotate(-90deg)" }}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span className="shrink-0 text-mist">
          {def ? <def.glyph size={12} /> : "?"}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {componentLabel(node)}
          <span className="ml-1.5 text-[10px] text-mist">{def?.label ?? node.type}</span>
        </span>

        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <TreeButton label={`Move ${componentLabel(node)} up`} onClick={() => actions.reorder(node.id, -1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M12 19V5m-6 6 6-6 6 6" />
            </svg>
          </TreeButton>
          <TreeButton label={`Move ${componentLabel(node)} down`} onClick={() => actions.reorder(node.id, 1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14m-6-6 6 6 6-6" />
            </svg>
          </TreeButton>
          <TreeButton label={`Duplicate ${componentLabel(node)}`} onClick={() => actions.duplicateComponent(node.id)}>
            <IconCopy size={12} />
          </TreeButton>
          <TreeButton label={`Delete ${componentLabel(node)}`} danger onClick={() => actions.removeComponent(node.id)}>
            <IconTrash size={12} />
          </TreeButton>
        </span>
      </div>

      {hasChildren && !isCollapsed ? (
        <ul role="group" className="flex flex-col gap-px">
          {node.children!.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TreeButton({
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
      className={`flex h-5 w-5 items-center justify-center rounded text-mist transition-colors hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
        danger ? "hover:text-rose" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
