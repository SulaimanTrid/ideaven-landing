"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProjectModelBlock } from "@/types/project";

/**
 * The pointer-based drag controller for Blocks mode. One gesture model is
 * shared by the palette and the canvas: press → 5px threshold → drag with a
 * ghost that follows the pointer → drop resolved against `[data-dz]` zones on
 * the canvas (stack strips, container arms, value sockets, or free canvas =
 * park). Drops are applied by the canvas through a single registered handler,
 * so every gesture is exactly one undoable model commit.
 */

export type DragSource =
  | { type: "palette-statement"; blockType: string; preset?: { inputs?: Record<string, string | number | boolean> } }
  | { type: "palette-reporter"; blockType: string; preset?: { inputs?: Record<string, string | number | boolean> } }
  /** An attached statement — the grab carries the run below it. */
  | { type: "script"; handlerId: string; blockId: string }
  /** A block inside a parked run (offset = index within the run). */
  | { type: "parked"; leadBlockId: string; offset: number }
  /** A wired reporter inside a value socket. */
  | { type: "slot"; handlerId: string; ownerBlockId: string; slotKey: string }
  /** The hat block — moves the whole script (position only). */
  | { type: "script-position"; handlerId: string };

export type DropTarget =
  | { type: "stack"; handlerId: string; parentId: string | null; branch: "then" | "else"; index: number }
  | { type: "socket"; handlerId: string; blockId: string; slotKey: string }
  /** Free canvas — coordinates are canvas px at zoom 1. */
  | { type: "park"; x: number; y: number };

/** What travels with the ghost, resolved from the model when the drag begins. */
export interface DragSnapshot {
  run?: ProjectModelBlock[];
  reporter?: ProjectModelBlock;
}

export interface DragInfo {
  source: DragSource;
  kind: "statement" | "reporter" | "position";
  pointer: { x: number; y: number };
  /** Pointer offset from the dragged element's origin, in canvas px. */
  grabCanvas: { dx: number; dy: number };
  /** Pointer offset from the ghost's top-left, in client px. */
  grabClient: { dx: number; dy: number };
  snapshot: DragSnapshot;
}

export interface DragMeta {
  grabCanvas?: { dx: number; dy: number };
  grabClient?: { dx: number; dy: number };
  snapshot?: DragSnapshot;
}

interface CanvasApi {
  resolveTarget: (clientX: number, clientY: number, kind: DragInfo["kind"]) => DropTarget | null;
}

interface BlocksDndValue {
  drag: DragInfo | null;
  target: DropTarget | null;
  /** True once the current press crossed the drag threshold (click suppression). */
  wasDrag: () => boolean;
  begin: (source: DragSource, event: React.PointerEvent, meta?: DragMeta) => void;
  registerCanvas: (api: CanvasApi | null) => void;
  registerDropHandler: (fn: ((drag: DragInfo, target: DropTarget | null) => void) | null) => void;
}

const BlocksDndContext = createContext<BlocksDndValue | null>(null);

const DRAG_THRESHOLD = 5;

export function BlocksDndProvider({ children }: { children: React.ReactNode }) {
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  const pendingRef = useRef<{
    source: DragSource;
    startX: number;
    startY: number;
    meta: DragMeta;
  } | null>(null);
  const canvasRef = useRef<CanvasApi | null>(null);
  const dropRef = useRef<((drag: DragInfo, target: DropTarget | null) => void) | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const wasDragRef = useRef(false);
  dragRef.current = drag;
  targetRef.current = target;

  const registerCanvas = useCallback((api: CanvasApi | null) => {
    canvasRef.current = api;
  }, []);

  const registerDropHandler = useCallback(
    (fn: ((drag: DragInfo, target: DropTarget | null) => void) | null) => {
      dropRef.current = fn;
    },
    [],
  );

  const finish = useCallback((apply: boolean) => {
    const current = dragRef.current;
    const finalTarget = targetRef.current;
    pendingRef.current = null;
    wasDragRef.current = false;
    dragRef.current = null;
    targetRef.current = null;
    setDrag(null);
    setTarget(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    if (current && apply && dropRef.current) dropRef.current(current, finalTarget);
  }, []);

  const begin = useCallback((source: DragSource, event: React.PointerEvent, meta: DragMeta = {}) => {
    if (event.button !== 0) return;
    pendingRef.current = { source, startX: event.clientX, startY: event.clientY, meta };
    wasDragRef.current = false;
  }, []);

  // Window-level gesture listeners: move → resolve target, up → apply drop.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (event.buttons === 0) {
        finish(false); // pointerup was missed (left the window) — put everything back
        return;
      }
      const active = dragRef.current !== null;
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (!active && distance < DRAG_THRESHOLD) return;
      event.preventDefault();
      if (!active) wasDragRef.current = true;
      const info: DragInfo = {
        source: pending.source,
        kind:
          pending.source.type === "slot" || pending.source.type === "palette-reporter"
            ? "reporter"
            : pending.source.type === "script-position"
              ? "position"
              : "statement",
        pointer: { x: event.clientX, y: event.clientY },
        grabCanvas: pending.meta.grabCanvas ?? { dx: 0, dy: 0 },
        grabClient: pending.meta.grabClient ?? { dx: 0, dy: 0 },
        snapshot: pending.meta.snapshot ?? {},
      };
      dragRef.current = info;
      setDrag(info);
      const api = canvasRef.current;
      const next = api ? api.resolveTarget(event.clientX, event.clientY, info.kind) : null;
      targetRef.current = next;
      setTarget(next);
    };
    const onUp = () => {
      if (pendingRef.current || dragRef.current) finish(true);
    };
    const onCancel = () => {
      if (pendingRef.current || dragRef.current) finish(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragRef.current) {
        event.preventDefault();
        finish(false);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish]);

  const value = useMemo<BlocksDndValue>(
    () => ({
      drag,
      target,
      wasDrag: () => wasDragRef.current,
      begin,
      registerCanvas,
      registerDropHandler,
    }),
    [drag, target, begin, registerCanvas, registerDropHandler],
  );

  // The ghost itself is rendered inside the canvas plane (so it inherits the
  // workspace zoom); position drags echo the real element instead.
  return <BlocksDndContext.Provider value={value}>{children}</BlocksDndContext.Provider>;
}

export function useBlocksDnd(): BlocksDndValue {
  const context = useContext(BlocksDndContext);
  if (!context) throw new Error("useBlocksDnd must be used inside BlocksDndProvider");
  return context;
}
