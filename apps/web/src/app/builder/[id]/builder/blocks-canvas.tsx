"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addStatement as addStatementOp,
  findBlock,
  removeBlock as removeBlockOp,
  CATEGORY_COLORS,
} from "@/lib/project-model/blocks";
import { createRegistryBlock, getAnyBlockDef } from "@/lib/project-model/block-registry";
import { EVENT_LABELS, getDef } from "@/lib/project-model/registry";
import { useBuilder, componentLabel } from "./builder-context";
import {
  InputEditor,
  MiniButton,
  SlotChip,
  parseLabel,
  readDragPayload,
  setDragPayload,
} from "./blocks-editors";
import { IconClose } from "@/components/visuals/icons";
import type { ProjectModelBlock, ProjectModelComponent } from "@/types/project";

/**
 * The Blocks canvas (2.0 Phase 2): a Scratch-style free canvas over the same
 * block IR — hat block for the handler, snap strips between statements,
 * C-block arms, draggable reporter sockets, zoom/pan, minimap, and keyboard
 * shortcuts. It is strictly a view-model: every edit goes through the shared
 * builder actions (one undoable commit per gesture).
 */

interface CanvasProps {
  handler: {
    id: string;
    componentId: string | null;
    event: string;
    body: ProjectModelBlock[];
  };
  components: ProjectModelComponent[];
  screenName: string;
}

const STACK_MIME = "x-ideaven-statement";
const REPORTER_MIME = "x-ideaven-reporter";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

export function BlocksCanvas({ handler, components, screenName }: CanvasProps) {
  const { model, activeScreenId, actions, commitModel } = useBuilder();
  const [view, setView] = useState({ x: 48, y: 28, zoom: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<"statement" | "reporter" | null>(null);
  const [contentSize, setContentSize] = useState({ w: 0, h: 0 });
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  // Pan via background drag; blocks/slots opt out with [data-ui].
  const onPointerDown = (event: React.PointerEvent) => {
    const target = event.target as Element;
    if (target.closest("[data-ui]")) return;
    panRef.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelected(null);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setView((v) => ({ ...v, x: pan.vx + (event.clientX - pan.x), y: pan.vy + (event.clientY - pan.y) }));
  };
  const onPointerUp = () => {
    panRef.current = null;
  };

  // Non-passive wheel: ctrl/⌘+wheel zooms at the cursor, plain wheel pans.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
      } else {
        setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const applied = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * applied, y: cy - (cy - v.y) * applied };
    });
  }, []);

  // Measure the untransformed content and the visible box for the minimap.
  useEffect(() => {
    const content = contentRef.current;
    const wrap = wrapRef.current;
    if (!content || !wrap) return;
    const measure = () => {
      setContentSize({ w: content.offsetWidth, h: content.offsetHeight });
      setBoxSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Keyboard shortcuts (canvas focused).
  const onKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) actions.redo();
      else actions.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      actions.redo();
      return;
    }
    if (event.key === "Escape") {
      setSelected(null);
      return;
    }
    if (!selected) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      actions.removeBlock(handler.id, selected);
      setSelected(null);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      actions.moveStatement(handler.id, selected, event.key === "ArrowUp" ? -1 : 1);
    }
  };

  // Compose a statement drop: new block from the palette, or move an existing
  // subtree (with same-array index adjustment and cycle rejection).
  const dropStatement = (parentId: string | null, branch: "then" | "else", index: number) => {
    return (event: React.DragEvent) => {
      event.preventDefault();
      setDragKind(null);
      const payload = readDragPayload(event);
      if (!payload) return;
      if (payload.kind === "statement-new") {
        const block = createRegistryBlock(payload.blockType);
        if (block) actions.addStatement(handler.id, parentId, index, block, branch);
        return;
      }
      if (payload.kind !== "statement-move") return;
      if (payload.blockId === parentId) return; // into itself
      const source = findBlock(model, activeScreenId, handler.id, payload.blockId);
      if (!source) return;
      // Reject dropping a container into its own subtree (would cycle).
      if (ancestorChainContains(model, activeScreenId, handler.id, payload.blockId, parentId)) return;
      const sameArray = (source.parent?.id ?? null) === parentId && branchOf(source) === branch;
      const at = sameArray && source.index < index ? index - 1 : index;
      const subtree: ProjectModelBlock = JSON.parse(JSON.stringify(source.block));
      let next = removeBlockOp(model, activeScreenId, handler.id, payload.blockId);
      next = addStatementOp(next, activeScreenId, handler.id, parentId, at, subtree, branch);
      if (next !== model) commitModel(next); // whole gesture = one undo step
      setSelected(payload.blockId);
    };
  };

  const branchOf = (hit: { parent: ProjectModelBlock | null; owner: ProjectModelBlock[] | null }): "then" | "else" => {
    if (!hit.parent) return "then";
    return hit.owner != null && hit.owner === hit.parent.elseChildren ? "else" : "then";
  };

  const dragProps = {
    onDragStart: () => setDragKind("statement"),
    onDragEnd: () => setDragKind(null),
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="application"
      aria-label={`Block canvas for ${screenName}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragOver={(event) => {
        // Palette and canvas drags both flow through here; the MIME marker
        // tells us which drop targets to reveal (payloads are unreadable
        // during dragover, but types are not).
        const types = event.dataTransfer.types;
        setDragKind(types.includes(STACK_MIME) ? "statement" : types.includes(REPORTER_MIME) ? "reporter" : null);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragKind(null);
      }}
      onDrop={() => setDragKind(null)}
      className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:22px_22px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-violet"
    >
      {/* Viewport toolbar */}
      <div data-ui className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-lg">
        <MiniButton label="Zoom out" onClick={() => zoomAt(1 / 1.2, boxSize.w / 2, boxSize.h / 2)}>
          −
        </MiniButton>
        <span className="w-10 text-center font-mono text-[11px] text-mist">{Math.round(view.zoom * 100)}%</span>
        <MiniButton label="Zoom in" onClick={() => zoomAt(1.2, boxSize.w / 2, boxSize.h / 2)}>
          ＋
        </MiniButton>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <MiniButton
          label="Reset view"
          onClick={() => setView({ x: 48, y: 28, zoom: 1 })}
        >
          ⌖
        </MiniButton>
        <MiniButton label="Keyboard shortcuts" onClick={() => setHelpOpen((v) => !v)}>
          ?
        </MiniButton>
      </div>
      {helpOpen ? (
        <div data-ui className="absolute right-3 top-14 z-20 w-64 rounded-lg border border-line bg-panel/95 p-3 text-[12px] leading-6 text-fog shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink">Shortcuts</p>
            <button
              type="button"
              aria-label="Close shortcuts"
              onClick={() => setHelpOpen(false)}
              className="text-mist hover:text-ink"
            >
              <IconClose size={12} />
            </button>
          </div>
          <ul className="mt-1">
            <li><Kbd>Del</Kbd> delete selected block</li>
            <li><Kbd>↑</Kbd> <Kbd>↓</Kbd> move selected block</li>
            <li><Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undo · <Kbd>Ctrl</Kbd>+<Kbd>⇧</Kbd>+<Kbd>Z</Kbd> redo</li>
            <li><Kbd>Esc</Kbd> deselect · drag background to pan</li>
            <li><Kbd>Ctrl</Kbd>+wheel zoom · drag blocks to snap</li>
          </ul>
        </div>
      ) : null}

      {/* Transformed canvas content */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        <div ref={contentRef} className="w-max max-w-full">
          {/* Hat block (the handler) */}
          <div data-ui className="relative inline-block rounded-t-2xl px-4 pb-3 pt-2" style={{ background: `color-mix(in srgb, ${CATEGORY_COLORS.navigation} 16%, #141826)`, borderTop: `3px solid ${CATEGORY_COLORS.navigation}` }}>
            <HatCurve color={CATEGORY_COLORS.navigation} />
            <p className="whitespace-nowrap pr-8 text-[14px] font-medium">
              <span className="text-sky">when</span>{" "}
              {handler.componentId === null ? (
                <span>Screen “{screenName}”</span>
              ) : (() => {
                  const component = components.find((c) => c.id === handler.componentId);
                  return component ? (
                    <span>
                      {componentLabel(component)}{" "}
                      <span className="text-mist">({getDef(component.type)?.label ?? component.type})</span>
                    </span>
                  ) : (
                    <span className="text-rose">missing component</span>
                  );
                })()}{" "}
              <span className="text-sky">{EVENT_LABELS[handler.event] ?? handler.event}s</span>
            </p>
            <div className="absolute right-2 top-2">
              <MiniButton label="Delete handler" danger onClick={() => actions.removeHandler(handler.id)}>
                ✕
              </MiniButton>
            </div>
          </div>

          {/* The stack */}
          <div className="ml-1 flex flex-col items-start gap-0 border-l-2 pl-3" style={{ borderColor: `color-mix(in srgb, ${CATEGORY_COLORS.navigation} 45%, transparent)` }}>
            {handler.body.length === 0 && !dragKind ? (
              <p className="py-6 text-[13px] text-mist">
                Empty — drag a statement block here from the palette.
              </p>
            ) : null}
            <StackList
              blocks={handler.body}
              parentId={null}
              branch="then"
              ancestors={[]}
              handlerId={handler.id}
              components={components}
              selected={selected}
              setSelected={setSelected}
              dragActive={dragKind}
              dropStatement={dropStatement}
              dragProps={dragProps}
            />
          </div>
        </div>
      </div>

      {/* Minimap */}
      <Minimap
        body={handler.body}
        contentSize={contentSize}
        boxSize={boxSize}
        view={view}
        onJump={(cx, cy) => setView((v) => ({ ...v, x: boxSize.w / 2 - cx * v.zoom, y: boxSize.h / 2 - cy * v.zoom }))}
      />
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1 font-mono text-[10px] text-fog">{children}</kbd>
  );
}

/** Is `ancestorId` anywhere above `targetId` in the statement tree? */
function ancestorChainContains(
  model: Parameters<typeof findBlock>[0],
  screenId: string,
  handlerId: string,
  blockId: string,
  ancestorId: string | null,
): boolean {
  if (!ancestorId) return false;
  const hit = findBlock(model, screenId, handlerId, blockId);
  if (!hit) return false;
  let parent = hit.parent;
  while (parent) {
    if (parent.id === ancestorId) return true;
    const parentHit = findBlock(model, screenId, handlerId, parent.id);
    parent = parentHit?.parent ?? null;
  }
  return false;
}

// ---- stack rendering -----------------------------------------------------------------

interface StackProps {
  blocks: ProjectModelBlock[];
  parentId: string | null;
  branch: "then" | "else";
  ancestors: string[];
  handlerId: string;
  components: ProjectModelComponent[];
  selected: string | null;
  setSelected: (id: string | null) => void;
  dragActive: "statement" | "reporter" | null;
  dropStatement: (parentId: string | null, branch: "then" | "else", index: number) => (event: React.DragEvent) => void;
  dragProps: { onDragStart: () => void; onDragEnd: () => void };
}

function StackList(props: StackProps) {
  const { blocks, parentId, branch, dropStatement } = props;
  return (
    <div className="flex w-max flex-col">
      {blocks.map((block, index) => (
        <div key={block.id} className="contents">
          <DropStrip
            stripId={`${parentId ?? "root"}:${branch}:${index}`}
            onDrop={dropStatement(parentId, branch, index)}
          />
          <BlockNode {...props} block={block} />
        </div>
      ))}
      <DropStrip
        stripId={`${parentId ?? "root"}:${branch}:${blocks.length}`}
        last
        onDrop={dropStatement(parentId, branch, blocks.length)}
      />
    </div>
  );
}

function DropStrip({
  stripId,
  onDrop,
  last,
}: {
  stripId: string;
  onDrop: (event: React.DragEvent) => void;
  last?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-strip={stripId}
      data-last={last ? "" : undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(STACK_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        onDrop(event);
      }}
      className={`relative z-10 w-full transition-all ${over ? "h-4" : "h-2.5"}`}
    >
      <div
        className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full transition-colors ${
          over ? "h-1 bg-mint shadow-[0_0_8px_rgba(70,227,180,0.8)]" : "h-0.5 bg-transparent"
        }`}
      />
    </div>
  );
}

function BlockNode(props: StackProps & { block: ProjectModelBlock }) {
  const { block, ancestors, handlerId, components, selected, setSelected, dropStatement, dragProps } = props;
  const { actions } = useBuilder();
  const def = getAnyBlockDef(block.type);
  const color = def ? CATEGORY_COLORS[def.category] : "#6f7789";
  const isSel = selected === block.id;
  const parts = def
    ? parseLabel(def.label)
    : [{ text: `unknown block “${block.type}”`, ref: null as string | null }];

  const nextAncestors = [...ancestors, block.id];

  return (
    <div
      data-ui
      data-block={block.id}
      draggable
      onDragStart={(event) => {
        setDragPayload(event, { kind: "statement-move", handlerId, blockId: block.id });
        event.dataTransfer.setData(STACK_MIME, "");
        dragProps.onDragStart();
      }}
      onDragEnd={dragProps.onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        setSelected(isSel ? null : block.id);
      }}
      className="relative cursor-grab rounded-lg active:cursor-grabbing"
      style={{
        background: `color-mix(in srgb, ${color} 10%, #12151f)`,
        border: `1px solid ${isSel ? color : `color-mix(in srgb, ${color} 35%, transparent)`}`,
        boxShadow: isSel ? `0 0 0 2px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
      }}
      aria-selected={isSel}
    >
      {/* puzzle tab */}
      <span
        aria-hidden
        className="absolute -bottom-1 left-4 h-2 w-4 rounded-b-md"
        style={{ background: `color-mix(in srgb, ${color} 26%, #12151f)` }}
      />

      {/* Row actions */}
      <div className="absolute -top-2.5 right-2 z-10 flex gap-1 opacity-0 transition-opacity [div:hover>&]:opacity-100">
        <MiniButton label="Move up" onClick={() => actions.moveStatement(handlerId, block.id, -1)}>
          ↑
        </MiniButton>
        <MiniButton label="Move down" onClick={() => actions.moveStatement(handlerId, block.id, 1)}>
          ↓
        </MiniButton>
        <MiniButton label="Delete block" danger onClick={() => actions.removeBlock(handlerId, block.id)}>
          ✕
        </MiniButton>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5" style={{ borderLeft: `4px solid ${color}` }}>
        {parts.map((part, i) =>
          part.ref === null ? (
            <span key={i} className="text-[13px] text-fog">
              {part.text}
            </span>
          ) : def?.slots?.some((s) => s.key === part.ref) ? (
            <SlotChip
              key={i}
              block={block}
              slotKey={part.ref!}
              handlerId={handlerId}
              components={components}
              color={color}
            />
          ) : (
            <InputEditor
              key={i}
              block={block}
              inputKey={part.ref!}
              handlerId={handlerId}
              components={components}
            />
          ),
        )}
      </div>

      {/* C-block arms */}
      {def?.container ? (
        <>
          <Arm
            label="then"
            color={color}
            onDrop={dropStatement(block.id, "then", 0)}
          >
            <StackList
              {...props}
              blocks={block.children ?? []}
              parentId={block.id}
              branch="then"
              ancestors={nextAncestors}
            />
          </Arm>
          {block.type === "if" ? (
            <Arm
              label="else"
              color={color}
              onDrop={dropStatement(block.id, "else", 0)}
            >
              <StackList
                {...props}
                blocks={block.elseChildren ?? []}
                parentId={block.id}
                branch="else"
                ancestors={nextAncestors}
              />
            </Arm>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// Actions are used through the builder context; hooking at module scope is
// illegal, so the row actions read the context from a tiny bridge component.

function Arm({
  label,
  color,
  onDrop,
  children,
}: {
  label: string;
  color: string;
  onDrop: (event: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(STACK_MIME)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        event.stopPropagation();
        onDrop(event);
      }}
      className={`mx-3 mb-3 flex flex-col rounded-lg border border-dashed bg-black/20 p-2 transition-colors ${
        over ? "border-mint" : "border-line"
      }`}
    >
      <p className="px-1 pb-0.5 text-[10px] font-medium tracking-[0.14em] text-mist uppercase">{label}</p>
      {children}
    </div>
  );
}

function HatCurve({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="absolute -top-2 left-6 h-3 w-10 rounded-t-full"
      style={{ background: `color-mix(in srgb, ${color} 30%, #141826)` }}
    />
  );
}

// ---- minimap --------------------------------------------------------------------------

function Minimap({
  body,
  contentSize,
  boxSize,
  view,
  onJump,
}: {
  body: ProjectModelBlock[];
  contentSize: { w: number; h: number };
  boxSize: { w: number; h: number };
  view: { x: number; y: number; zoom: number };
  onJump: (contentX: number, contentY: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const MW = 168;
  const MH = 108;
  const scale = contentSize.w > 0 ? Math.min(MW / contentSize.w, MH / Math.max(contentSize.h, 1), 1) : 1;

  const nodes = useMemo(() => {
    const out: { depth: number; count: number }[] = [];
    const walk = (blocks: ProjectModelBlock[], depth: number) => {
      for (const block of blocks) {
        out.push({ depth, count: 1 });
        if (block.children?.length) walk(block.children, depth + 1);
        if (block.elseChildren?.length) walk(block.elseChildren, depth + 1);
      }
    };
    walk(body, 0);
    return out;
  }, [body]);

  if (contentSize.w === 0) return null;

  const vpX = Math.max(0, -view.x / view.zoom);
  const vpY = Math.max(0, -view.y / view.zoom);
  const vpW = boxSize.w / view.zoom;
  const vpH = boxSize.h / view.zoom;

  const jump = (event: React.PointerEvent) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    onJump((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
  };

  return (
    <div
      data-ui
      ref={mapRef}
      title="Minimap — click to navigate"
      onPointerDown={(event) => {
        event.stopPropagation();
        jump(event);
      }}
      className="absolute bottom-3 right-3 z-20 overflow-hidden rounded-lg border border-line bg-panel/95 shadow-lg"
      style={{ width: MW, height: MH }}
    >
      <svg width={MW} height={MH} className="cursor-pointer">
        {nodes.slice(0, 220).map((node, i) => {
          const rowH = 4;
          const perRow = Math.max(1, Math.floor((MW - 8) / 6));
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          return (
            <rect
              key={i}
              x={4 + col * 6 + node.depth * 4}
              y={4 + row * (rowH + 2)}
              width={Math.max(10, 26 - node.depth * 5)}
              height={rowH}
              rx={1.5}
              fill={`color-mix(in srgb, ${CATEGORY_COLORS.navigation} ${70 - node.depth * 15}%, #2a3040)`}
            />
          );
        })}
        <rect
          x={vpX * scale}
          y={vpY * scale}
          width={Math.min(MW - 2, vpW * scale)}
          height={Math.min(MH - 2, vpH * scale)}
          fill="rgba(70,227,180,0.08)"
          stroke="rgba(70,227,180,0.7)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}
