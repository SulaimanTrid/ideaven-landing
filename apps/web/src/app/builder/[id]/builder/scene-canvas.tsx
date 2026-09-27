"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useBuilder, componentLabel } from "@/app/builder/[id]/builder/builder-context";
import { autoTileFactor, cameraConfig, cellColorFor, entityRect, entitiesOf, entityVisible, shadeHex, sortedRenderOrder, tileColorAt, tilemapCellSize, tilemapGrid, tilesToMap, tilesToString, type EntityRect } from "@/lib/project-model/scene";
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
  activeTile = 1,
  showSorting = false,
}: {
  screen: ProjectModelScreen;
  scale: number;
  snap: boolean;
  tool?: SceneTool;
  /** Tile value the Paint tool writes (from the toolbar's palette swatches). */
  activeTile?: number;
  /** TASK 15: overlay each entity's layer name + order (depth debugging). */
  showSorting?: boolean;
}) {
  const { selectedId, select, actions } = useBuilder();
  const entities = entitiesOf(screen);
  // TASK 15: one deterministic render-order pipeline (layer → order → model
  // index) shared with the runtimes. Memoized — sorting never runs per frame.
  const sortedEntities = useMemo(() => sortedRenderOrder(screen), [screen]);
  const [live, setLive] = useState<Record<string, EntityRect>>({});
  // The cell the paint cursor is over (Paint/Erase feedback before commit).
  const [hoverCell, setHoverCell] = useState<{ id: string; col: number; row: number } | null>(null);
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
            if (paint.tiles.get(key) === activeTile) return;
            paint.tiles.set(key, activeTile);
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
    [scale, snap, select, actions, tool, activeTile],
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Camera framing (TASK 14): the camera entity's rect is the viewport it
          frames; when bounds are on, the world rectangle shows too — one quiet
          overlay, not visual noise. Derived from the same camera props the
          runtime reads. */}
      {entities.filter((e) => e.type === "camera").map((camera) => {
        const cfg = cameraConfig(camera.props);
        return (
          <div key={`camera-overlay-${camera.id}`} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {cfg.boundsEnabled ? (
              <div
                data-camera-bounds="true"
                style={{
                  position: "absolute",
                  left: cfg.minX,
                  top: cfg.minY,
                  width: Math.max(1, cfg.maxX - cfg.minX),
                  height: Math.max(1, cfg.maxY - cfg.minY),
                  border: "2px dashed rgb(143 123 255 / 0.4)",
                  borderRadius: 8,
                }}
              />
            ) : null}
          </div>
        );
      })}
      {/* SYSTEM 5: light gizmos — radius rings reflecting the real configured
          radius, editor-only (pointer-events none, never exported). */}
      {entities
        .filter((e) => e.type === "light" && e.props?.enabled !== false)
        .map((light) => {
          const rect = rectOf(light);
          const radius = typeof light.props?.radius === "number" && Number.isFinite(light.props.radius) && light.props.radius >= 8 ? light.props.radius : 140;
          const color = typeof light.props?.color === "string" ? light.props.color : "#ffd9a0";
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          return (
            <div
              key={`light-gizmo-${light.id}`}
              data-light-gizmo="true"
              aria-hidden="true"
              style={{
                position: "absolute",
                left: cx - radius,
                top: cy - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: "50%",
                border: `1.5px dashed ${color}66`,
                background: `radial-gradient(circle, ${color}14 0%, rgba(0,0,0,0) 70%)`,
                pointerEvents: "none",
              }}
            />
          );
        })}
      {/* TASK 15: the design canvas renders in the SAME deterministic order
          as the runtime (layer → order → model index) — the editor never
          lies about what will be in front. */}
      {sortedEntities.map((component) => {
        const rect = rectOf(component);
        const rotation = rotationOf(component);
        const visible = entityVisible(component.props);
        const selected = selectedId === component.id;
        const layerName = String(component.props?.sortingLayer ?? "") || "World";
        return (
          <div
            key={component.id}
            data-node-id={component.id}
            data-sorting-layer={layerName}
            onPointerDown={(event) => onPointerDown(event, component, "move")}
            onPointerMove={
              tool !== "select" && component.type === "tilemap"
                ? (event) => {
                    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
                    const grid = tilemapGrid(component.props);
                    const col = Math.floor((event.clientX - box.left) / scale / tilemapCellSize(component.props));
                    const row = Math.floor((event.clientY - box.top) / scale / tilemapCellSize(component.props));
                    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) {
                      setHoverCell(null);
                      return;
                    }
                    setHoverCell((current) =>
                      current?.id === component.id && current.col === col && current.row === row
                        ? current
                        : { id: component.id, col, row },
                    );
                  }
                : undefined
            }
            onPointerLeave={
              tool !== "select" && component.type === "tilemap"
                ? () => setHoverCell(null)
                : undefined
            }
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
              // The camera's viewport spans the whole stage: it must never
              // intercept clicks meant for the entities it frames. Its label
              // chip (below) is the drag/select handle.
              pointerEvents: component.type === "camera" ? "none" : undefined,
            }}
          >
            <EntityGlyph component={component} rect={rect} />
            {showSorting ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -8,
                  left: 4,
                  padding: "0 4px",
                  borderRadius: 3,
                  background: "rgb(10 12 18 / 0.78)",
                  color: "#a9b0c2",
                  fontSize: 8.5,
                  fontFamily: "var(--font-mono, monospace)",
                  letterSpacing: 0.5,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {layerName} · {typeof component.props?.sortingOrder === "number" ? component.props.sortingOrder : 0}
              </span>
            ) : null}
            {component.type === "camera" ? (
              // The camera's only hit area: its name chip. The viewport itself
              // must stay click-through (see pointerEvents above), so the chip
              // re-enables pointer events for select/drag.
              <span
                data-camera-handle="true"
                style={{
                  position: "absolute",
                  top: -10,
                  left: 4,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgb(10 12 18 / 0.82)",
                  border: `1px solid ${typeof component.props?.color === "string" ? component.props.color : "#58c7f0"}`,
                  color: typeof component.props?.color === "string" ? component.props.color : "#58c7f0",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  whiteSpace: "nowrap",
                  pointerEvents: "auto",
                  cursor: "move",
                }}
              >
                ⌗ {typeof component.props?.name === "string" && component.props.name.trim() !== "" ? component.props.name : "Camera"}
              </span>
            ) : null}
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

      {/* Paint/Erase hover feedback: the exact cell the stroke will touch,
          shaded by the same auto-tile rule that will render it. */}
      {hoverCell
        ? (() => {
            const component = entities.find((e) => e.id === hoverCell.id);
            if (!component) return null;
            const rect = rectOf(component);
            const cell = tilemapCellSize(component.props);
            const painted = tilesToMap(String(component.props?.tiles ?? ""));
            const willPaint = tool === "paint";
            const color = willPaint
              ? shadeHex(tileColorAt(component.props, activeTile), component.props?.autoTile === true ? autoTileFactor((c, r) => painted.has(`${c},${r}`), hoverCell.col, hoverCell.row) : 1)
              : "#f43f5e";
            return (
              <div
                aria-hidden="true"
                data-hover-cell={`${hoverCell.col},${hoverCell.row}`}
                style={{
                  position: "absolute",
                  left: rect.x + hoverCell.col * cell,
                  top: rect.y + hoverCell.row * cell,
                  width: cell,
                  height: cell,
                  background: willPaint ? color : "transparent",
                  outline: `2px solid ${color}`,
                  outlineOffset: -2,
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
            );
          })()
        : null}
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
    case "camera":
      // The camera frames the world; on the design stage it renders as a
      // viewport outline with a corner viewfinder mark, not a solid shape.
      return (
        <div
          title={label}
          data-camera-viewport="true"
          style={{
            width: "100%",
            height: "100%",
            border: `2px dashed ${color}`,
            borderRadius: 8,
            background: `${color}08`,
            display: "flex",
            alignItems: "flex-end",
            padding: 4,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color, opacity: 0.85 }}>
            ⌗ {typeof component.props?.name === "string" ? component.props.name : "CAMERA"}
          </span>
        </div>
      );
    case "light":
      // SYSTEM 5: the light's stage handle — a glowing dot; the radius ring
      // around it comes from the gizmo overlay above.
      return (
        <div
          title={label}
          style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 12px ${color}`,
              border: "2px solid rgb(255 255 255 / 0.7)",
            }}
          />
        </div>
      );
    case "emitter":
      // SYSTEM 18: emitter stage handle — a cone pointing along the emission
      // direction (0° = up).
      return (
        <div title={label} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50% 50% 50% 0",
              background: "#ffd9a0",
              border: "2px solid rgb(255 255 255 / 0.7)",
              transform: `rotate(${(typeof component.props?.direction === "number" ? component.props.direction : 0) - 45}deg)`,
            }}
          />
        </div>
      );
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
      const tiles = String(component.props?.tiles ?? "");
      const painted = tilesToMap(tiles);
      const isPainted = (c: number, r: number) => painted.has(`${c},${r}`);
      const cells: React.ReactNode[] = [];
      tiles.split(";").forEach((seg) => {
        const [pos, tile] = seg.trim().split(":");
        if (!pos) return;
        const [colS, rowS] = pos.split(",");
        const col = parseInt(colS ?? "", 10);
        const row = parseInt(rowS ?? "", 10);
        const tileNum = parseInt(tile ?? "1", 10);
        if (!Number.isFinite(col) || !Number.isFinite(row)) return;
        cells.push(
          <div
            key={`${col}-${row}`}
            data-cell={`${col},${row}`}
            data-tile={Number.isFinite(tileNum) ? tileNum : 1}
            style={{ position: "absolute", left: col * cell, top: row * cell, width: cell, height: cell, background: cellColorFor(component.props, col, row, isPainted, Number.isFinite(tileNum) ? tileNum : 1), boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.06)" }}
          />,
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
