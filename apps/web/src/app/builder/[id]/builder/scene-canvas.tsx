"use client";

import { useCallback, useRef, useState } from "react";
import { useBuilder, componentLabel } from "@/app/builder/[id]/builder/builder-context";
import { entityRect, entitiesOf, entityVisible, tilemapCellSize, tilemapGrid, tilesToMap, tilesToString, type EntityRect } from "@/lib/project-model/scene";
import type { ProjectModelComponent, ProjectModelScreen } from "@/types/project";
import { imageUrl } from "@/lib/api";

/**
 * The scene editor canvas (TASK 08): game screens edit as a 2D stage.
 * Select, move (drag), scale (corner handle), rotate (inspector field,
 * rendered live), duplicate, delete — every gesture commits once through
 * the shared model path, so undo/redo and autosave behave like every other
 * edit. Grid dots + optional snap keep placement deliberate.
 *
 * Tilemap painting (SYSTEM 4): with the Paint or Erase tool active, a
 * pointer gesture on a tilemap edits its cells instead of moving it — each
 * cell change commits `tiles` through the same updateProps path, so the
 * canonical model, undo, and autosave all see every cell.
 */

const SNAP = 10;

/** Tools for the selected tilemap; move/resize stays the select-tool behavior. */
export type SceneTool = "select" | "paint" | "erase";

export function SceneEditor({
  screen,
  scale,
  snap,
  tool = "select",
}: {
  screen: ProjectModelScreen;
  scale: number;
  snap: boolean;
  tool?: SceneTool;
}) {
  const { selectedId, select, actions } = useBuilder();
  const entities = entitiesOf(screen);
  const [live, setLive] = useState<Record<string, EntityRect>>({});
  const dragRef = useRef<{
    id: string;
    kind: "move" | "resize";
    startX: number;
    startY: number;
    origin: EntityRect;
  } | null>(null);

  const rectOf = useCallback(
    (component: ProjectModelComponent): EntityRect =>
      live[component.id] ?? entityRect(component.props, component.type),
    [live],
  );

  const rotationOf = (component: ProjectModelComponent): number => {
    const rotation = component.props?.rotation;
    return typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;
  };

  const liveRef = useRef(live);
  liveRef.current = live;

  // Tile painting gesture state: the tilemap under the pointer plus its
  // working cell map, so a drag paints many cells against one snapshot and
  // each change lands in the model immediately.
  const paintRef = useRef<{
    id: string;
    left: number;
    top: number;
    cell: number;
    cols: number;
    rows: number;
    mode: Exclude<SceneTool, "select">;
    tiles: Map<string, number>;
  } | null>(null);

  // Drag gestures listen on window: React's conditional container props are
  // evaluated at render time, and a pointerdown whose selection re-render
  // races the first pointermove silently drops the gesture. Window listeners
  // are immune to that and to capture retargeting.
  const onPointerDown = useCallback(
    (event: React.PointerEvent, component: ProjectModelComponent, kind: "move" | "resize") => {
      event.stopPropagation();
      event.preventDefault();

      // Tile painting: with Paint/Erase active, a gesture on a tilemap edits
      // cells instead of dragging the entity.
      if (tool !== "select" && kind === "move" && component.type === "tilemap") {
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const grid = tilemapGrid(component.props);
        paintRef.current = {
          id: component.id,
          left: box.left,
          top: box.top,
          cell: tilemapCellSize(component.props),
          cols: grid.cols,
          rows: grid.rows,
          mode: tool,
          tiles: tilesToMap(String(component.props?.tiles ?? "")),
        };
        const applyAt = (clientX: number, clientY: number) => {
          const paint = paintRef.current;
          if (!paint) return;
          const col = Math.floor((clientX - paint.left) / scale / paint.cell);
          const row = Math.floor((clientY - paint.top) / scale / paint.cell);
          if (col < 0 || row < 0 || col >= paint.cols || row >= paint.rows) return;
          const key = `${col},${row}`;
          if (paint.mode === "paint") {
            if (paint.tiles.get(key) === 1) return;
            paint.tiles.set(key, 1);
          } else {
            if (!paint.tiles.has(key)) return;
            paint.tiles.delete(key);
          }
          // Every cell change is a real model commit (canonical props, undo,
          // autosave) — never local-only state.
          actions.updateProps(paint.id, { tiles: tilesToString(paint.tiles) });
        };
        applyAt(event.clientX, event.clientY);
        const onPaintMove = (move: PointerEvent) => applyAt(move.clientX, move.clientY);
        const onPaintUp = () => {
          window.removeEventListener("pointermove", onPaintMove);
          window.removeEventListener("pointerup", onPaintUp);
          window.removeEventListener("pointercancel", onPaintUp);
          paintRef.current = null;
        };
        window.addEventListener("pointermove", onPaintMove);
        window.addEventListener("pointerup", onPaintUp);
        window.addEventListener("pointercancel", onPaintUp);
        return;
      }

      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      select(component.id);
      const origin = liveRef.current[component.id] ?? entityRect(component.props, component.type);
      dragRef.current = { id: component.id, kind, startX: event.clientX, startY: event.clientY, origin };

      const onMove = (move: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = (move.clientX - drag.startX) / scale;
        const dy = (move.clientY - drag.startY) / scale;
        const round = (value: number) => (snap ? Math.round(value / SNAP) * SNAP : Math.round(value));
        setLive((current) => ({
          ...current,
          [drag.id]:
            drag.kind === "move"
              ? {
                  ...drag.origin,
                  x: Math.max(0, round(drag.origin.x + dx)),
                  y: Math.max(0, round(drag.origin.y + dy)),
                }
              : {
                  ...drag.origin,
                  width: Math.max(8, round(drag.origin.width + dx)),
                  height: Math.max(8, round(drag.origin.height + dy)),
                },
        }));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        const rect = liveRef.current[drag.id];
        if (!rect) return;
        // One commit per gesture — the same path the inspector uses.
        if (drag.kind === "move") {
          actions.updateProps(drag.id, { x: rect.x, y: rect.y });
        } else {
          actions.updateProps(drag.id, { width: rect.width, height: rect.height });
        }
        setLive((current) => {
          const next = { ...current };
          delete next[drag.id];
          return next;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [scale, snap, select, actions, tool],
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {entities.map((component) => {
        const rect = rectOf(component);
        const rotation = rotationOf(component);
        const visible = entityVisible(component.props);
        const selected = selectedId === component.id;
        return (
          <div
            key={component.id}
            data-node-id={component.id}
            onPointerDown={(event) => onPointerDown(event, component, "move")}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              opacity: visible ? 1 : 0.35,
              outline: selected ? "2px solid #8f7bff" : "1px solid rgb(255 255 255 / 0.18)",
              outlineOffset: 1,
              borderRadius: 6,
              cursor: tool !== "select" && component.type === "tilemap" ? "crosshair" : "move",
              touchAction: "none",
            }}
          >
            <EntityGlyph component={component} rect={rect} />
            {selected ? (
              <>
                {/* Scale handle */}
                <span
                  aria-hidden="true"
                  onPointerDown={(event) => onPointerDown(event, component, "resize")}
                  style={{
                    position: "absolute",
                    right: -6,
                    bottom: -6,
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: "#8f7bff",
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                />
                {/* Duplicate / delete */}
                <span className="absolute -top-7 right-0 flex gap-1" onPointerDown={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={`Duplicate ${componentLabel(component)}`}
                    title="Duplicate"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.duplicateComponent(component.id);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel text-[11px] text-fog hover:text-ink"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${componentLabel(component)}`}
                    title="Delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.removeComponent(component.id);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel text-[11px] text-rose hover:text-ink"
                  >
                    ✕
                  </button>
                </span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The visual of one entity on the design stage (mirrors the runtime's shapes). */
function EntityGlyph({ component, rect }: { component: ProjectModelComponent; rect: EntityRect }) {
  const color = typeof component.props?.color === "string" ? component.props.color : "#58c7f0";
  const label = componentLabel(component);
  const texture = typeof component.props?.src === "string" && component.props.src.trim() !== "" ? component.props.src.trim() : null;
  if (texture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- project asset or user URL
      <img
        src={imageUrl(texture)}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "fill", imageRendering: "pixelated", pointerEvents: "none" }}
      />
    );
  }
  switch (component.type) {
    case "player":
      return (
        <div title={label} style={{ width: "100%", height: "100%", borderRadius: 9, background: color, boxShadow: "inset -4px -4px 0 rgb(0 0 0 / 0.18)" }} />
      );
    case "platform":
      return <div title={label} style={{ width: "100%", height: "100%", background: color, borderRadius: 4, boxShadow: "inset 0 2px 0 rgb(255 255 255 / 0.12)" }} />;
    case "coin":
      return (
        <div title={label} style={{ width: "100%", height: "100%", borderRadius: "50%", background: color, boxShadow: "inset -3px -3px 0 rgb(0 0 0 / 0.28)" }} />
      );
    case "tilemap": {
      const cell = tilemapCellSize(component.props);
      const tileColor = typeof component.props?.tileColor === "string" ? component.props.tileColor : color;
      const tiles = String(component.props?.tiles ?? "");
      const cells: React.ReactNode[] = [];
      tiles.split(";").forEach((seg) => {
        const [pos, tile] = seg.trim().split(":");
        if (!pos) return;
        const [colS, rowS] = pos.split(",");
        const col = parseInt(colS ?? "", 10);
        const row = parseInt(rowS ?? "", 10);
        if (!Number.isFinite(col) || !Number.isFinite(row)) return;
        cells.push(
          <div key={`${col}-${row}`} data-cell={`${col},${row}`} style={{ position: "absolute", left: col * cell, top: row * cell, width: cell, height: cell, background: tileColor, boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }} />,
        );
      });
      return <div title={label} data-tile-count={cells.length} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>{cells}</div>;
    }
    case "enemy":
      return <div title={label} style={{ width: "100%", height: "100%", borderRadius: 8, background: color, boxShadow: "inset -3px -3px 0 rgb(0 0 0 / 0.22)" }} />;
    case "trigger":
      return <div title={label} style={{ width: "100%", height: "100%", border: `2px dashed ${color}`, borderRadius: 8, background: `${color}22` }} />;
    default:
      return <div title={label} style={{ width: "100%", height: "100%", background: color, borderRadius: 6, opacity: 0.92 }} />;
  }
}
