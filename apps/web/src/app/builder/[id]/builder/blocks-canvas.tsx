"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CATEGORY_COLORS,
  addParked,
  addStatement,
  attachParked,
  duplicateAttached,
  duplicateParked,
  findBlock,
  removeParked,
  setSlot,
  splitParkedRun,
  locateRun,
} from "@/lib/project-model/blocks";
import {
  createRegistryBlock,
  getAnyBlockDef,
} from "@/lib/project-model/block-registry";
import { EVENT_LABELS, getDef, eventLabel, translatedBlockLabel, translatedEventLabel } from "@/lib/project-model/registry";
import { useI18n } from "@/lib/i18n/i18n";
import { targetOfTouchEvent } from "@/lib/project-model/scene";
import { useBuilder, componentLabel } from "./builder-context";
import { InputEditor, MiniButton, SlotChip } from "./blocks-editors";
import {
  BlockIcon,
  GhostBlock,
  GhostPaletteBlock,
  blockShellStyle,
  parseLabel,
} from "./blocks-visual";
import { useBlocksDnd, type DragInfo, type DropTarget } from "./blocks-dnd";
import { IconClose } from "@/components/visuals/icons";
import type {
  ProjectModel,
  ProjectModelBlock,
  ProjectModelComponent,
  ProjectModelPoint,
  ProjectModelScreen,
} from "@/types/project";

/**
 * The Blocks canvas: a Scratch-style free workspace over the canonical block
 * IR. Every event handler is a script the user can place anywhere; blocks can
 * be detached and parked freely, dragged between scripts, nested in
 * containers, and reconnected — with live insertion guides and socket
 * highlights during the drag. Positions live on the canonical model
 * (logic.positions), so the layout survives save and reload. The canvas is a
 * view: every edit goes through the shared builder actions and lands as one
 * undoable commit per gesture.
 */

interface CanvasProps {
  screen: ProjectModelScreen;
  components: ProjectModelComponent[];
  screenName: string;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const PLANE_W = 4200;
const PLANE_H = 2600;

export function BlocksCanvas({ screen, components, screenName }: CanvasProps) {
  const {
    model,
    activeScreenId,
    actions,
    commitModel,
    selectedHandlerId,
    selectHandler,
  } = useBuilder();
  const dnd = useBlocksDnd();

  const handlers = useMemo(() => screen.logic?.handlers ?? [], [screen.logic]);
  const parked = useMemo(() => screen.logic?.parked ?? [], [screen.logic]);
  const positions = useMemo(
    () => screen.logic?.positions ?? {},
    [screen.logic],
  );

  const [view, setView] = useState({ x: 48, y: 28, zoom: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [measured, setMeasured] = useState<
    Record<string, { w: number; h: number }>
  >({});
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  const scriptRefs = useRef(new Map<string, HTMLDivElement>());

  const viewRef = useRef(view);
  viewRef.current = view;
  const modelRef = useRef(model);
  modelRef.current = model;
  const screenIdRef = useRef(activeScreenId);
  screenIdRef.current = activeScreenId;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  // ---- view transforms ---------------------------------------------------------

  const clientToCanvas = useCallback(
    (clientX: number, clientY: number): ProjectModelPoint => {
      const rect = wrapRef.current?.getBoundingClientRect();
      const viewNow = viewRef.current;
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewNow.x) / viewNow.zoom,
        y: (clientY - rect.top - viewNow.y) / viewNow.zoom,
      };
    },
    [],
  );
  const clientToCanvasRef = useRef(clientToCanvas);
  clientToCanvasRef.current = clientToCanvas;

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const applied = zoom / v.zoom;
      return {
        zoom,
        x: cx - (cx - v.x) * applied,
        y: cy - (cy - v.y) * applied,
      };
    });
  }, []);

  // Pan via background drag; blocks/hat stop propagation, strips and gaps pan.
  const onPointerDown = (event: React.PointerEvent) => {
    const target = event.target as Element;
    if (target.closest("[data-ui]")) return;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      vx: view.x,
      vy: view.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelected(null);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan) return;
    setView((v) => ({
      ...v,
      x: pan.vx + (event.clientX - pan.x),
      y: pan.vy + (event.clientY - pan.y),
    }));
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
        zoomAt(
          event.deltaY < 0 ? 1.1 : 1 / 1.1,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      } else {
        setView((v) => ({
          ...v,
          x: v.x - event.deltaX,
          y: v.y - event.deltaY,
        }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---- layout -----------------------------------------------------------------

  const autoPositionsRef = useRef<Record<string, ProjectModelPoint>>({});

  // Measure rendered scripts/parked runs, then auto-place anything without a
  // stored position (first open of a project never mutates the model — the
  // auto layout persists only when the user actually drags something).
  useLayoutEffect(() => {
    const next: Record<string, { w: number; h: number }> = {};
    for (const [id, el] of scriptRefs.current) {
      next[id] = { w: el.offsetWidth, h: el.offsetHeight };
    }
    setMeasured((prev) => {
      const same =
        Object.keys(prev).length === Object.keys(next).length &&
        Object.entries(next).every(
          ([id, size]) =>
            prev[id] &&
            Math.abs(prev[id].w - size.w) < 1 &&
            Math.abs(prev[id].h - size.h) < 1,
        );
      return same ? prev : next;
    });
  });

  const hasExplicit = useCallback(
    (id: string) => positions[id] !== undefined,
    [positions],
  );

  const autoPositions = useMemo(() => {
    const map: Record<string, ProjectModelPoint> = {};
    let cursorX = 48;
    let cursorY = 28;
    let rowH = 0;
    for (const handler of handlers) {
      if (positions[handler.id] !== undefined) continue;
      const size = measured[handler.id];
      const w = size?.w ?? 300;
      if (cursorX > 48 && cursorX + w > PLANE_W / 2) {
        cursorX = 48;
        cursorY += rowH + 44;
        rowH = 0;
      }
      map[handler.id] = { x: cursorX, y: cursorY };
      cursorX += w + 48;
      rowH = Math.max(rowH, size?.h ?? 180);
    }
    for (const run of parked) {
      const lead = run[0];
      if (!lead || positions[lead.id] !== undefined) continue;
      map[lead.id] = { x: cursorX > 48 ? cursorX : 48, y: cursorY + rowH + 44 };
      cursorY += (measured[lead.id]?.h ?? 120) + 28;
    }
    return map;
  }, [handlers, parked, positions, measured]);
  autoPositionsRef.current = autoPositions;

  // Clicking a handler in the side list pans the script into view — only when
  // the selection actually changes. Re-running on background re-measures would
  // yank the view back and fight manual panning / Reset view.
  const lastFocusedHandlerRef = useRef<string | null>(null);
  const measuredRef = useRef(measured);
  measuredRef.current = measured;
  useEffect(() => {
    if (!selectedHandlerId || lastFocusedHandlerRef.current === selectedHandlerId) return;
    lastFocusedHandlerRef.current = selectedHandlerId;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const el = scriptRefs.current.get(selectedHandlerId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const visible =
      r.left >= w.left &&
      r.right <= w.right &&
      r.top >= w.top &&
      r.bottom <= w.bottom;
    if (visible) return;
    const pos =
      positionsRef.current[selectedHandlerId] ??
      autoPositionsRef.current[selectedHandlerId];
    const size = measuredRef.current[selectedHandlerId];
    if (!pos) return;
    setView((v) => ({
      ...v,
      x: wrap.clientWidth / 2 - (pos.x + (size?.w ?? 300) / 2) * v.zoom,
      y: Math.max(
        24,
        wrap.clientHeight / 3 - (pos.y + (size?.h ?? 140) / 2) * v.zoom,
      ),
    }));
  }, [selectedHandlerId]);

  // ---- drag & drop ---------------------------------------------------------------

  const resolveTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      kind: DragInfo["kind"],
    ): DropTarget | null => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return null;
      let node: Element | null = el;
      while (node && node !== document.body) {
        const dz = node.getAttribute("data-dz");
        if (dz === "ignore") return null;
        if (dz === "socket") {
          if (kind === "reporter") {
            const handlerId = node.getAttribute("data-h");
            const blockId = node.getAttribute("data-block");
            const slotKey = node.getAttribute("data-slot");
            if (handlerId && blockId && slotKey) {
              return { type: "socket", handlerId, blockId, slotKey };
            }
          }
          node = node.parentElement;
          continue;
        }
        if (kind === "statement" && (dz === "strip" || dz === "arm")) {
          const handlerId = node.getAttribute("data-h");
          if (handlerId) {
            const parentId = node.getAttribute("data-p") || null;
            const branch =
              node.getAttribute("data-b") === "else" ? "else" : "then";
            const index = Number(node.getAttribute("data-i") ?? "0");
            return {
              type: "stack",
              handlerId,
              parentId,
              branch,
              index: Number.isFinite(index) ? index : 0,
            };
          }
        }
        if (kind === "statement" && dz === "block") {
          const handlerId = node.getAttribute("data-h");
          if (handlerId) {
            const rect = node.getBoundingClientRect();
            const after = clientY - rect.top > rect.height / 2;
            const base = Number(node.getAttribute("data-i") ?? "0");
            return {
              type: "stack",
              handlerId,
              parentId: node.getAttribute("data-p") || null,
              branch: node.getAttribute("data-b") === "else" ? "else" : "then",
              index: (Number.isFinite(base) ? base : 0) + (after ? 1 : 0),
            };
          }
        }
        if (dz === "park") {
          const point = clientToCanvasRef.current(clientX, clientY);
          return { type: "park", x: point.x, y: point.y };
        }
        node = node.parentElement;
      }
      return null;
    },
    [],
  );

  const canvasApi = useMemo(() => ({ resolveTarget }), [resolveTarget]);
  useEffect(() => {
    dnd.registerCanvas(canvasApi);
    return () => dnd.registerCanvas(null);
  }, [dnd, canvasApi]);

  /** Grab metadata for a drag that starts on a rendered element. */
  const grabFor = useCallback((event: React.PointerEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const pointerCanvas = clientToCanvasRef.current(
      event.clientX,
      event.clientY,
    );
    const origin = clientToCanvasRef.current(rect.left, rect.top);
    return {
      grabCanvas: {
        dx: pointerCanvas.x - origin.x,
        dy: pointerCanvas.y - origin.y,
      },
      grabClient: {
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
      },
    };
  }, []);

  // ---- drop application (one gesture = one undoable commit) ----------------------

  /** Wire a reporter into a socket; an occupied socket's expression parks under the pointer. */
  const commitModelWithDisplaced = useCallback(
    (
      model: ProjectModel,
      screenId: string,
      target: Extract<DropTarget, { type: "socket" }>,
      block: ProjectModelBlock,
      drag: DragInfo,
    ) => {
      const displaced =
        findBlock(model, screenId, target.handlerId, target.blockId)?.block
          .slots?.[target.slotKey] ?? null;
      let next = setSlot(
        model,
        screenId,
        target.handlerId,
        target.blockId,
        target.slotKey,
        block,
      );
      if (displaced) {
        const point = clientToCanvasRef.current(drag.pointer.x, drag.pointer.y);
        next = addParked(next, screenId, displaced, point.x, point.y);
      }
      commitModel(next);
    },
    [commitModel],
  );

  const applyDrop = useCallback(
    (drag: DragInfo, target: DropTarget | null) => {
      if (!target) return; // released outside the canvas — put everything back
      const model = modelRef.current;
      const screenId = screenIdRef.current;

      switch (drag.source.type) {
        case "palette-statement": {
          const block = createRegistryBlock(
            drag.source.blockType,
            drag.source.preset,
          );
          if (!block) return;
          if (target.type === "stack") {
            commitModel(
              addStatement(
                model,
                screenId,
                target.handlerId,
                target.parentId,
                target.index,
                block,
                target.branch,
              ),
            );
            selectHandler(target.handlerId);
            setSelected(block.id);
          } else if (target.type === "park") {
            commitModel(addParked(model, screenId, block, target.x, target.y));
            setSelected(block.id);
          }
          return;
        }
        case "palette-reporter": {
          const block = createRegistryBlock(
            drag.source.blockType,
            drag.source.preset,
          );
          if (!block) return;
          if (target.type === "socket") {
            commitModelWithDisplaced(model, screenId, target, block, drag);
          } else if (target.type === "park") {
            commitModel(addParked(model, screenId, block, target.x, target.y));
          }
          return;
        }
        case "script": {
          if (target.type === "stack") {
            actions.moveRunTo(
              drag.source.handlerId,
              drag.source.blockId,
              target,
            );
            selectHandler(target.handlerId);
            setSelected(drag.source.blockId);
          } else if (target.type === "park") {
            actions.parkStatement(
              drag.source.handlerId,
              drag.source.blockId,
              target.x - drag.grabCanvas.dx,
              target.y - drag.grabCanvas.dy,
            );
            setSelected(drag.source.blockId);
          }
          return;
        }
        case "parked": {
          const { leadBlockId, offset } = drag.source;
          const tailLead =
            offset > 0 ? (drag.snapshot.run?.[0]?.id ?? null) : leadBlockId;
          if (target.type === "stack" && tailLead) {
            if (offset > 0) {
              // Composition: split the parked run, then attach the tail — one commit.
              // The split position is irrelevant: attaching clears it.
              const split = splitParkedRun(
                model,
                screenId,
                leadBlockId,
                offset,
                0,
                0,
              );
              if (split === model) return;
              const attached = attachParked(split, screenId, tailLead, target);
              if (attached === split) return;
              commitModel(attached);
            } else {
              actions.attachParkedRun(leadBlockId, target);
            }
            selectHandler(target.handlerId);
            setSelected(tailLead);
          } else if (target.type === "park") {
            const x = target.x - drag.grabCanvas.dx;
            const y = target.y - drag.grabCanvas.dy;
            if (offset > 0) {
              const split = splitParkedRun(
                model,
                screenId,
                leadBlockId,
                offset,
                x,
                y,
              );
              if (split !== model) commitModel(split);
            } else {
              actions.moveParkedRun(leadBlockId, x, y);
            }
          }
          return;
        }
        case "slot": {
          const expr = drag.snapshot.reporter;
          if (!expr) return;
          if (target.type === "socket") {
            const same =
              drag.source.handlerId === target.handlerId &&
              drag.source.ownerBlockId === target.blockId &&
              drag.source.slotKey === target.slotKey;
            if (same) return;
            let next = setSlot(
              model,
              screenId,
              drag.source.handlerId,
              drag.source.ownerBlockId,
              drag.source.slotKey,
              null,
            );
            const displaced =
              findBlock(next, screenId, target.handlerId, target.blockId)?.block
                .slots?.[target.slotKey] ?? null;
            next = setSlot(
              next,
              screenId,
              target.handlerId,
              target.blockId,
              target.slotKey,
              expr,
            );
            if (displaced) {
              const point = clientToCanvasRef.current(
                drag.pointer.x,
                drag.pointer.y,
              );
              next = addParked(next, screenId, displaced, point.x, point.y);
            }
            commitModel(next);
          } else if (target.type === "park") {
            let next = setSlot(
              model,
              screenId,
              drag.source.handlerId,
              drag.source.ownerBlockId,
              drag.source.slotKey,
              null,
            );
            next = addParked(next, screenId, expr, target.x, target.y);
            commitModel(next);
          }
          return;
        }
        case "script-position": {
          if (target.type === "park") {
            actions.moveScript(
              drag.source.handlerId,
              target.x - drag.grabCanvas.dx,
              target.y - drag.grabCanvas.dy,
            );
          }
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitModel, commitModelWithDisplaced, selectHandler, actions],
  );

  useEffect(() => {
    dnd.registerDropHandler(applyDrop);
    return () => dnd.registerDropHandler(null);
  }, [dnd, applyDrop]);

  // ---- drag begin callbacks (passed down; keeps block nodes context-free) ---------

  const beginScriptBlockDrag = useCallback(
    (event: React.PointerEvent, handlerId: string, blockId: string) => {
      const hit = locateRun(
        modelRef.current,
        screenIdRef.current,
        handlerId,
        blockId,
      );
      if (!hit) return;
      const run: ProjectModelBlock[] = JSON.parse(JSON.stringify(hit.run));
      dnd.begin({ type: "script", handlerId, blockId }, event, {
        ...grabFor(event),
        snapshot: { run },
      });
    },
    [dnd, grabFor],
  );

  const beginParkedDrag = useCallback(
    (event: React.PointerEvent, leadBlockId: string, offset: number) => {
      const run = parked.find((candidate) => candidate[0]?.id === leadBlockId);
      if (!run) return;
      const tail: ProjectModelBlock[] = JSON.parse(
        JSON.stringify(run.slice(offset)),
      );
      if (tail.length === 0) return;
      dnd.begin({ type: "parked", leadBlockId, offset }, event, {
        ...grabFor(event),
        snapshot: { run: tail },
      });
    },
    [dnd, grabFor, parked],
  );

  const beginHatDrag = useCallback(
    (event: React.PointerEvent, handlerId: string) => {
      dnd.begin({ type: "script-position", handlerId }, event, grabFor(event));
    },
    [dnd, grabFor],
  );

  const beginSlotDrag = useCallback(
    (
      event: React.PointerEvent,
      handlerId: string,
      ownerBlockId: string,
      slotKey: string,
      expr: ProjectModelBlock,
    ) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      dnd.begin({ type: "slot", handlerId, ownerBlockId, slotKey }, event, {
        grabClient: {
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
        },
        snapshot: { reporter: JSON.parse(JSON.stringify(expr)) },
      });
    },
    [dnd],
  );

  // ---- selection & keyboard --------------------------------------------------------

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    for (const handler of handlers) {
      if (findBlock(model, activeScreenId, handler.id, selected)) {
        actions.removeBlock(handler.id, selected);
        setSelected(null);
        return;
      }
    }
    for (const run of parked) {
      if (run.some((block) => block.id === selected)) {
        commitModel(removeParked(model, activeScreenId, run[0]!.id));
        setSelected(null);
        return;
      }
    }
  }, [selected, handlers, parked, model, activeScreenId, actions, commitModel]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    for (const handler of handlers) {
      const next = duplicateAttached(
        model,
        activeScreenId,
        handler.id,
        selected,
      );
      if (next !== model) {
        commitModel(next);
        return;
      }
    }
    for (const run of parked) {
      if (run[0]?.id === selected) {
        commitModel(duplicateParked(model, activeScreenId, selected));
        return;
      }
    }
  }, [selected, handlers, parked, model, activeScreenId, commitModel]);

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
    if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (event.key === "Escape") {
      setSelected(null);
      return;
    }
    if (!selected) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const handlerId = handlers.find((h) =>
        findBlock(model, activeScreenId, h.id, selected),
      )?.id;
      if (handlerId)
        actions.moveStatement(
          handlerId,
          selected,
          event.key === "ArrowUp" ? -1 : 1,
        );
    }
  };

  // ---- render ----------------------------------------------------------------------

  const drag = dnd.drag;
  const dragKind = drag?.kind ?? null;
  const hiddenIds = useMemo(() => {
    const ids = new Set<string>();
    if (drag?.kind === "statement")
      for (const block of drag.snapshot.run ?? []) ids.add(block.id);
    if (drag?.kind === "reporter" && drag.source.type === "slot")
      ids.add(`${drag.source.ownerBlockId}:${drag.source.slotKey}`);
    return ids;
  }, [drag]);

  // Echo: while the hat is dragged, the script follows the pointer live.
  const echoPos =
    drag && drag.kind === "position" && drag.source.type === "script-position"
      ? (() => {
          const point = clientToCanvas(drag.pointer.x, drag.pointer.y);
          return {
            x: point.x - drag.grabCanvas.dx,
            y: point.y - drag.grabCanvas.dy,
          };
        })()
      : null;

  const showStatementGuides = dragKind === "statement";
  const showSocketGuides = dragKind === "reporter";

  // overflow-clip (not hidden): the plane is panned via transform, so the
  // viewport must never become a scroll container — programmatic scrolls
  // (focus, scrollIntoView) would silently shift every overlay.
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
      className="relative min-h-0 flex-1 overflow-clip bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:22px_22px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-violet"
    >
      {/* Viewport toolbar */}
      <div
        data-ui
        data-dz="ignore"
        className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-lg"
      >
        <MiniButton
          label="Zoom out"
          onClick={() => zoomAt(1 / 1.2, boxSize.w / 2, boxSize.h / 2)}
        >
          −
        </MiniButton>
        <span className="w-10 text-center font-mono text-[11px] text-mist">
          {Math.round(view.zoom * 100)}%
        </span>
        <MiniButton
          label="Zoom in"
          onClick={() => zoomAt(1.2, boxSize.w / 2, boxSize.h / 2)}
        >
          ＋
        </MiniButton>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <MiniButton
          label="Reset view"
          onClick={() => setView({ x: 48, y: 28, zoom: 1 })}
        >
          ⌖
        </MiniButton>
        <MiniButton
          label="Keyboard shortcuts"
          onClick={() => setHelpOpen((v) => !v)}
        >
          ?
        </MiniButton>
      </div>
      {helpOpen ? (
        <div
          data-ui
          data-dz="ignore"
          className="absolute right-3 top-14 z-20 w-64 rounded-lg border border-line bg-panel/95 p-3 text-[12px] leading-6 text-fog shadow-xl"
        >
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
            <li>
              <Kbd>Del</Kbd> delete · <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd> duplicate
            </li>
            <li>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> move selected block
            </li>
            <li>
              <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undo · <Kbd>Ctrl</Kbd>+<Kbd>⇧</Kbd>+
              <Kbd>Z</Kbd> redo
            </li>
            <li>
              <Kbd>Esc</Kbd> deselect or cancel a drag
            </li>
            <li>
              drag background to pan · <Kbd>Ctrl</Kbd>+wheel zoom
            </li>
            <li>drop a block on free canvas to park it</li>
          </ul>
        </div>
      ) : null}

      {/* Transformed plane (the park zone covers the whole workspace) */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        <div
          data-dz="park"
          className="relative"
          style={{ width: PLANE_W, height: PLANE_H }}
        >
          {handlers.length === 0 && parked.length === 0 && !dragKind ? (
            <div className="absolute left-6 top-6 max-w-sm rounded-2xl border border-dashed border-line bg-card/60 p-6">
              <p className="text-[15px] font-medium text-ink">
                This screen has no logic yet.
              </p>
              <p className="mt-1.5 text-[13px] leading-6 text-fog">
                Create an event handler from the left panel, then drag blocks
                here. Blocks dropped on free canvas stay parked as drafts —
                connect them whenever you are ready.
              </p>
            </div>
          ) : null}

          {handlers.map((handler) => {
            const stored = positions[handler.id];
            const pos = stored ?? autoPositions[handler.id] ?? { x: 48, y: 28 };
            const isEchoed =
              echoPos !== null &&
              drag?.source.type === "script-position" &&
              drag.source.handlerId === handler.id;
            return (
              <div
                key={handler.id}
                ref={(el) => {
                  if (el) scriptRefs.current.set(handler.id, el);
                  else scriptRefs.current.delete(handler.id);
                }}
                data-script={handler.id}
                className="absolute"
                style={{
                  left: isEchoed ? echoPos.x : pos.x,
                  top: isEchoed ? echoPos.y : pos.y,
                }}
              >
                <HatBlock
                  handler={handler}
                  components={components}
                  screenName={screenName}
                  selected={selectedHandlerId === handler.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    selectHandler(handler.id);
                    beginHatDrag(event, handler.id);
                  }}
                  onDelete={() => actions.removeHandler(handler.id)}
                />
                <div
                  className="ml-1 flex flex-col items-start border-l-2 pl-3"
                  style={{
                    borderColor: `color-mix(in srgb, ${CATEGORY_COLORS.navigation} 45%, transparent)`,
                  }}
                >
                  <StackList
                    blocks={handler.body}
                    handlerId={handler.id}
                    parentId={null}
                    branch="then"
                    components={components}
                    selected={selected}
                    onSelect={(blockId) => {
                      setSelected(blockId);
                      selectHandler(handler.id);
                    }}
                    hiddenIds={hiddenIds}
                    showGuides={showStatementGuides}
                    onBlockPointerDown={beginScriptBlockDrag}
                    beginSlotDrag={beginSlotDrag}
                  />
                </div>
              </div>
            );
          })}

          {parked.map((run) => {
            const lead = run[0];
            if (!lead) return null;
            const pos = positions[lead.id] ??
              autoPositions[lead.id] ?? { x: 480, y: 480 };
            return (
              <div
                key={lead.id}
                ref={(el) => {
                  if (el) scriptRefs.current.set(lead.id, el);
                  else scriptRefs.current.delete(lead.id);
                }}
                data-parked={lead.id}
                className="absolute z-20"
                style={{ left: pos.x, top: pos.y }}
              >
                <div className="flex w-max flex-col">
                  {run.map((block, offset) => (
                    <ParkedBlock
                      key={block.id}
                      block={block}
                      leadBlockId={lead.id}
                      offset={offset}
                      components={components}
                      selected={selected === block.id}
                      hidden={hiddenIds.has(block.id)}
                      onSelect={() => setSelected(block.id)}
                      onPointerDown={(event) =>
                        beginParkedDrag(event, lead.id, offset)
                      }
                      onDuplicate={() =>
                        commitModel(
                          duplicateParked(model, activeScreenId, lead.id),
                        )
                      }
                      onDelete={() =>
                        commitModel(
                          removeParked(model, activeScreenId, lead.id),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Drag ghost, rendered inside the plane so it matches zoom */}
          {drag && drag.kind !== "position" ? (
            <GhostLayer drag={drag} clientToCanvas={clientToCanvas} />
          ) : null}
        </div>
      </div>

      <Minimap
        handlers={handlers}
        parked={parked}
        positions={positions}
        autoPositions={autoPositions}
        measured={measured}
        view={view}
        boxSize={boxSize}
        onJump={(cx, cy) =>
          setView((v) => ({
            ...v,
            x: boxSize.w / 2 - cx * v.zoom,
            y: boxSize.h / 2 - cy * v.zoom,
          }))
        }
      />

      {/* Keep the viewport size fresh for the minimap + zoom controls */}
      <BoxMeasurer wrapRef={wrapRef} onMeasure={setBoxSize} />
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1 font-mono text-[10px] text-fog">
      {children}
    </kbd>
  );
}

function BoxMeasurer({
  wrapRef,
  onMeasure,
}: {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  onMeasure: (size: { w: number; h: number }) => void;
}) {
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => onMeasure({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [wrapRef, onMeasure]);
  return null;
}

// ---- hat -------------------------------------------------------------------------------

/** Hat label for any event; touch events name their target entity. */
function hatEventText(event: string, components: ProjectModelComponent[], t: (key: string) => string): string {
  const touched = targetOfTouchEvent(event);
  if (touched !== null) {
    const other = components.find((c) => c.id === touched);
    const touchWord = t("block.touches");
    return `${touchWord === "block.touches" ? "touches" : touchWord} ${other ? componentLabel(other) : "a missing entity"}`;
  }
  return `${translatedEventLabel(event, t)}s`;
}

function HatBlock({
  handler,
  components,
  screenName,
  selected,
  onPointerDown,
  onDelete,
}: {
  handler: {
    id: string;
    componentId: string | null;
    event: string;
    body: ProjectModelBlock[];
  };
  components: ProjectModelComponent[];
  screenName: string;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onDelete: () => void;
}) {
  const { t: tHat } = useI18n();
  const component = handler.componentId
    ? components.find((c) => c.id === handler.componentId)
    : null;
  return (
    <div
      data-ui
      onPointerDown={onPointerDown}
      className="relative inline-block cursor-grab rounded-t-[16px] px-4 pb-3 pt-2.5 active:cursor-grabbing"
      style={{
        ...blockShellStyle(CATEGORY_COLORS.navigation, selected),
        borderWidth: "1px 1px 0 1px",
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }}
    >
      <HatCurve color={CATEGORY_COLORS.navigation} />
      <p className="flex items-center gap-1.5 whitespace-nowrap pr-8 text-[13.5px] font-semibold text-[#0b0e16]">
        <BlockIcon type="navigate" size={14} />
        <span className="font-bold">{tHat("block.when")}</span>{" "}
        {handler.componentId === null ? (
          <span>Screen “{screenName}”</span>
        ) : component ? (
          <span>
            {componentLabel(component)}{" "}
            <span className="opacity-70">
              ({getDef(component.type)?.label ?? component.type})
            </span>
          </span>
        ) : (
          <span className="font-semibold text-[#7a1030]">
            missing component
          </span>
        )}{" "}
        <span className="font-bold">
          {hatEventText(handler.event, components, tHat as unknown as (key: string) => string)}
        </span>
      </p>
      <div className="absolute right-2 top-2">
        <MiniButton label="Delete handler" danger onClick={onDelete}>
          ✕
        </MiniButton>
      </div>
    </div>
  );
}

function HatCurve({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="absolute -top-[9px] left-5 h-[10px] w-12 rounded-t-full border border-b-0"
      style={{ background: color, borderColor: "rgb(10 12 18 / 0.35)" }}
    />
  );
}

// ---- stacks ----------------------------------------------------------------------------

interface StackProps {
  blocks: ProjectModelBlock[];
  handlerId: string;
  parentId: string | null;
  branch: "then" | "else";
  components: ProjectModelComponent[];
  selected: string | null;
  onSelect: (blockId: string) => void;
  hiddenIds: Set<string>;
  showGuides: boolean;
  onBlockPointerDown: (
    event: React.PointerEvent,
    handlerId: string,
    blockId: string,
  ) => void;
  beginSlotDrag: (
    event: React.PointerEvent,
    handlerId: string,
    ownerBlockId: string,
    slotKey: string,
    expr: ProjectModelBlock,
  ) => void;
}

function StackList(props: StackProps) {
  const { blocks, parentId, branch } = props;
  return (
    <div className="flex w-max flex-col">
      {blocks.map((block, index) => (
        <React.Fragment key={block.id}>
          <DropStrip
            handlerId={props.handlerId}
            parentId={parentId}
            branch={branch}
            index={index}
            showGuides={props.showGuides}
          />
          <ScriptBlock {...props} block={block} index={index} />
        </React.Fragment>
      ))}
      <DropStrip
        handlerId={props.handlerId}
        parentId={parentId}
        branch={branch}
        index={blocks.length}
        last
        showGuides={props.showGuides}
      />
    </div>
  );
}

function DropStrip({
  handlerId,
  parentId,
  branch,
  index,
  last,
  showGuides,
}: {
  handlerId: string;
  parentId: string | null;
  branch: "then" | "else";
  index: number;
  last?: boolean;
  showGuides: boolean;
}) {
  const dnd = useBlocksDnd();
  const target = dnd.target;
  const active =
    showGuides &&
    target?.type === "stack" &&
    target.handlerId === handlerId &&
    target.parentId === parentId &&
    target.branch === branch &&
    target.index === index;

  return (
    <div
      data-dz="strip"
      data-h={handlerId}
      data-p={parentId ?? ""}
      data-b={branch}
      data-i={index}
      data-last={last ? "" : undefined}
      className={`relative z-10 w-full min-w-40 transition-all ${active ? "h-5" : showGuides ? "h-3.5" : "h-2.5"} ${
        showGuides ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full transition-colors ${
          active
            ? "h-1.5 bg-mint shadow-[0_0_10px_rgba(70,227,180,0.85)]"
            : showGuides
              ? "h-px bg-mint/30"
              : "h-0.5 bg-transparent"
        }`}
      />
    </div>
  );
}

function ScriptBlock(
  props: StackProps & { block: ProjectModelBlock; index: number },
) {
  const {
    block,
    handlerId,
    index,
    parentId,
    branch,
    components,
    selected,
    onSelect,
    hiddenIds,
    onBlockPointerDown,
  } = props;
  const { actions } = useBuilder();
  const { t: tStmt } = useI18n();
  const def = getAnyBlockDef(block.type);
  const color = def ? CATEGORY_COLORS[def.category] : "#6f7789";
  const isSel = selected === block.id;
  const parts = def
    ? parseLabel(translatedBlockLabel(def, tStmt as unknown as (key: string) => string))
    : [{ text: `unknown block “${block.type}”`, ref: null as string | null }];
  const hidden = hiddenIds.has(block.id);

  if (hidden) return <div className="h-0" />;

  return (
    <div
      data-dz="block"
      data-h={handlerId}
      data-p={parentId ?? ""}
      data-b={branch}
      data-i={index}
      data-ui
      data-block={block.id}
      onPointerDown={(event) => {
        const t = event.target as Element;
        if (t.closest("input, select, textarea, button, [data-nodrag]")) {
          // Controls stay interactive — and grabbing near one must not pan the
          // canvas either, so swallow the event instead of letting it bubble.
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        onSelect(block.id);
        onBlockPointerDown(event, handlerId, block.id);
      }}
      onClick={(event) => event.stopPropagation()}
      className="group relative w-max cursor-grab rounded-[10px] active:cursor-grabbing"
      style={blockShellStyle(color, isSel)}
      aria-selected={isSel}
      aria-label={def?.label ?? block.type}
    >
      <span
        aria-hidden
        className="absolute -bottom-[4px] left-3.5 h-[8px] w-[18px] rounded-b-full"
        style={{ background: color }}
      />

      {/* Row actions — pointer-events only while visible, so hidden buttons
          never intercept drags landing on overlapping content */}
      <div className="pointer-events-none absolute -top-2.5 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <MiniButton
          label="Move up"
          onClick={() => actions.moveStatement(handlerId, block.id, -1)}
        >
          ↑
        </MiniButton>
        <MiniButton
          label="Move down"
          onClick={() => actions.moveStatement(handlerId, block.id, 1)}
        >
          ↓
        </MiniButton>
        <MiniButton
          label="Duplicate block"
          onClick={() => actions.duplicateStatementBlock(handlerId, block.id)}
        >
          ⧉
        </MiniButton>
        <MiniButton
          label="Delete block"
          danger
          onClick={() => actions.removeBlock(handlerId, block.id)}
        >
          ✕
        </MiniButton>
      </div>

      <BlockRow
        block={block}
        def={def}
        parts={parts}
        color={color}
        components={components}
        handlerId={handlerId}
        beginSlotDrag={props.beginSlotDrag}
      />

      {def?.container ? (
        <>
          <Arm
            handlerId={handlerId}
            parentId={block.id}
            branch="then"
            count={(block.children ?? []).length}
            color={color}
            showGuides={props.showGuides}
          >
            <StackList
              {...props}
              blocks={block.children ?? []}
              parentId={block.id}
              branch="then"
            />
          </Arm>
          {block.type === "if" ? (
            <Arm
              handlerId={handlerId}
              parentId={block.id}
              branch="else"
              count={(block.elseChildren ?? []).length}
              color={color}
              showGuides={props.showGuides}
            >
              <StackList
                {...props}
                blocks={block.elseChildren ?? []}
                parentId={block.id}
                branch="else"
              />
            </Arm>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** The label row: icon, text segments, typed inputs, and value sockets. */
function BlockRow({
  block,
  def,
  parts,
  color,
  components,
  handlerId,
  beginSlotDrag,
}: {
  block: ProjectModelBlock;
  def: ReturnType<typeof getAnyBlockDef>;
  parts: { text: string; ref: string | null }[];
  color: string;
  components: ProjectModelComponent[];
  handlerId: string;
  beginSlotDrag: StackProps["beginSlotDrag"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
      <span className="text-[#0b0e16]" title={def ? undefined : block.type}>
        <BlockIcon type={block.type} />
      </span>
      {parts.map((part, i) =>
        part.ref === null ? (
          <span key={i} className="text-[12.5px] font-medium text-[#0b0e16]">
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
            beginDrag={beginSlotDrag}
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
  );
}

function Arm({
  handlerId,
  parentId,
  branch,
  count,
  color,
  showGuides,
  children,
}: {
  handlerId: string;
  parentId: string;
  branch: "then" | "else";
  count: number;
  color: string;
  showGuides: boolean;
  children: React.ReactNode;
}) {
  const dnd = useBlocksDnd();
  const active =
    showGuides &&
    dnd.target?.type === "stack" &&
    dnd.target.handlerId === handlerId &&
    dnd.target.parentId === parentId &&
    dnd.target.branch === branch &&
    (dnd.target.index >= count || count === 0);

  return (
    <div
      data-dz="arm"
      data-h={handlerId}
      data-p={parentId}
      data-b={branch}
      data-i={count}
      onPointerDown={(event) => event.stopPropagation()}
      className={`mx-3 mb-3 flex flex-col rounded-lg border border-dashed bg-black/25 p-2 transition-colors ${
        active
          ? "border-mint bg-mint/10"
          : showGuides
            ? "border-mint/40"
            : "border-black/30"
      }`}
    >
      <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b0e16]/70">
        {branch}
      </p>
      {children}
    </div>
  );
}

// ---- parked blocks -----------------------------------------------------------------------

function ParkedBlock({
  block,
  leadBlockId,
  offset,
  components,
  selected,
  hidden,
  onSelect,
  onPointerDown,
  onDuplicate,
  onDelete,
}: {
  block: ProjectModelBlock;
  leadBlockId: string;
  offset: number;
  components: ProjectModelComponent[];
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
  onPointerDown: (event: React.PointerEvent) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t: tStmt } = useI18n();
  const def = getAnyBlockDef(block.type);
  const color = def ? CATEGORY_COLORS[def.category] : "#6f7789";
  const parts = def
    ? parseLabel(translatedBlockLabel(def, tStmt as unknown as (key: string) => string))
    : [{ text: block.type, ref: null as string | null }];

  if (hidden) return <div className="h-0" />;

  return (
    <div
      data-ui
      data-block={block.id}
      onPointerDown={(event) => {
        const t = event.target as Element;
        if (t.closest("input, select, textarea, button, [data-nodrag]")) {
          // Controls stay interactive — and grabbing near one must not pan the
          // canvas either, so swallow the event instead of letting it bubble.
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        onSelect();
        onPointerDown(event);
      }}
      onClick={(event) => event.stopPropagation()}
      className="group relative w-max cursor-grab rounded-[10px] active:cursor-grabbing"
      style={blockShellStyle(color, selected)}
      aria-selected={selected}
      aria-label={`${def?.label ?? block.type} (parked draft)`}
    >
      <span
        aria-hidden
        className="absolute -bottom-[4px] left-3.5 h-[8px] w-[18px] rounded-b-full"
        style={{ background: color }}
      />
      {offset === 0 ? (
        <div className="pointer-events-none absolute -top-2.5 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <MiniButton label="Duplicate parked run" onClick={onDuplicate}>
            ⧉
          </MiniButton>
          <MiniButton label="Delete parked run" danger onClick={onDelete}>
            ✕
          </MiniButton>
        </div>
      ) : null}
      <BlockRow
        block={block}
        def={def}
        parts={parts}
        color={color}
        components={components}
        handlerId=""
        beginSlotDrag={() => {}}
      />
      {def?.container ? (
        <div className="mx-3 mb-3 rounded-lg border border-dashed border-black/30 bg-black/25 p-2">
          <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0b0e16]/70">
            then
          </p>
          {(block.children ?? []).length === 0 ? (
            <p className="px-1 py-1.5 text-[11px] text-black/45">
              Attach this block to a script to fill its branches.
            </p>
          ) : (
            (block.children ?? []).map((child) => (
              <div key={child.id} className="opacity-80">
                <GhostBlock block={child} />
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---- ghost --------------------------------------------------------------------------------

function GhostLayer({
  drag,
  clientToCanvas,
}: {
  drag: DragInfo;
  clientToCanvas: (clientX: number, clientY: number) => ProjectModelPoint;
}) {
  const point = clientToCanvas(drag.pointer.x, drag.pointer.y);
  const left = point.x - drag.grabCanvas.dx;
  const top = point.y - drag.grabCanvas.dy;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-40 w-max"
      style={{ left, top, filter: "drop-shadow(0 14px 22px rgb(0 0 0 / 0.5))" }}
    >
      {drag.snapshot.run?.length ? (
        <div className="flex w-max flex-col">
          {drag.snapshot.run.map((block) => (
            <GhostBlock key={block.id} block={block} />
          ))}
        </div>
      ) : drag.snapshot.reporter ? (
        <GhostBlock block={drag.snapshot.reporter} />
      ) : drag.source.type === "palette-statement" ||
        drag.source.type === "palette-reporter" ? (
        <GhostPaletteBlock blockType={drag.source.blockType} />
      ) : null}
    </div>
  );
}

// ---- minimap --------------------------------------------------------------------------------

function Minimap({
  handlers,
  parked,
  positions,
  autoPositions,
  measured,
  view,
  boxSize,
  onJump,
}: {
  handlers: { id: string }[];
  parked: ProjectModelBlock[][];
  positions: Record<string, ProjectModelPoint>;
  autoPositions: Record<string, ProjectModelPoint>;
  measured: Record<string, { w: number; h: number }>;
  view: { x: number; y: number; zoom: number };
  boxSize: { w: number; h: number };
  onJump: (contentX: number, contentY: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const MW = 168;
  const MH = 108;

  const rects = useMemo(() => {
    const out: {
      x: number;
      y: number;
      w: number;
      h: number;
      parked: boolean;
    }[] = [];
    for (const handler of handlers) {
      const pos = positions[handler.id] ?? autoPositions[handler.id];
      if (!pos) continue;
      const size = measured[handler.id] ?? { w: 300, h: 160 };
      out.push({ x: pos.x, y: pos.y, w: size.w, h: size.h, parked: false });
    }
    for (const run of parked) {
      const lead = run[0];
      if (!lead) continue;
      const pos = positions[lead.id] ?? autoPositions[lead.id];
      if (!pos) continue;
      const size = measured[lead.id] ?? { w: 220, h: 60 };
      out.push({ x: pos.x, y: pos.y, w: size.w, h: size.h, parked: true });
    }
    return out;
  }, [handlers, parked, positions, autoPositions, measured]);

  const bounds = useMemo(() => {
    let maxX = 800;
    let maxY = 600;
    for (const rect of rects) {
      maxX = Math.max(maxX, rect.x + rect.w + 80);
      maxY = Math.max(maxY, rect.y + rect.h + 80);
    }
    return { w: maxX, h: maxY };
  }, [rects]);

  const scale = Math.min(MW / bounds.w, MH / bounds.h, 1);

  if (handlers.length === 0 && parked.length === 0) return null;

  const jump = (event: React.PointerEvent) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    onJump(
      (event.clientX - rect.left) / scale,
      (event.clientY - rect.top) / scale,
    );
  };

  return (
    <div
      data-ui
      data-dz="ignore"
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
        {rects.map((rect, i) => (
          <rect
            key={i}
            x={rect.x * scale}
            y={rect.y * scale}
            width={Math.max(6, rect.w * scale)}
            height={Math.max(3, rect.h * scale)}
            rx={1.5}
            fill={
              rect.parked
                ? "rgba(70,227,180,0.25)"
                : `color-mix(in srgb, ${CATEGORY_COLORS.navigation} ${rect.parked ? 40 : 55}%, #2a3040)`
            }
          />
        ))}
        <rect
          x={Math.max(0, -view.x / view.zoom) * scale}
          y={Math.max(0, -view.y / view.zoom) * scale}
          width={Math.min(MW - 2, (boxSize.w / view.zoom) * scale)}
          height={Math.min(MH - 2, (boxSize.h / view.zoom) * scale)}
          fill="rgba(70,227,180,0.08)"
          stroke="rgba(70,227,180,0.7)"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}
