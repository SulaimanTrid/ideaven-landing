"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBuilder, componentLabel } from "@/app/builder/[id]/builder/builder-context";
import { autoTileFactor, cameraConfig, cellColorFor, entityRect, entitiesOf, entityVisible, entityCollidable, entityIsTrigger, shadeHex, sortedRenderOrder, spriteTransformStyle, tileColorAt, tileIsSolid, tilemapCellSize, tilemapGrid, tilemapSolidCellRects, tilesToMap, tilesToString, type EntityRect } from "@/lib/project-model/scene";
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
 * canonical model, undo, and autosave all see every cell. TASK 62: a Fill
 * tool flood-fills a contiguous matching region (bounded by the grid, one
 * gesture = one undo entry), the tile palette shows per-tile solidity, and
 * multi-select (ctrl+click / marquee) unlocks group move + align + group
 * duplicate/delete — every group edit is ONE canonical commit.
 */

const SNAP = 10;

/** Tools for the selected tilemap; move/resize stays the select-tool behavior.
 * TASK 62: "fill" floods a contiguous matching region with the active tile;
 * "erasefill" clears a contiguous painted region. */
export type SceneTool = "select" | "paint" | "erase" | "fill" | "erasefill";

/** The tile-paint tools that take over tilemap gestures. */
const TILE_TOOLS: SceneTool[] = ["paint", "erase", "fill", "erasefill"];

export function SceneEditor({
  screen,
  scale,
  snap,
  tool = "select",
  activeTile = 1,
  showSorting = false,
  showCollisions = false,
  showTriggers = false,
  showTileCollision = false,
}: {
  screen: ProjectModelScreen;
  scale: number;
  snap: boolean;
  tool?: SceneTool;
  /** Tile value the Paint tool writes (from the toolbar's palette swatches). */
  activeTile?: number;
  /** TASK 15: overlay each entity's layer name + order (depth debugging). */
  showSorting?: boolean;
  /** TASK 62 §29: editor debug overlays — all default OFF (§37). */
  showCollisions?: boolean;
  showTriggers?: boolean;
  showTileCollision?: boolean;
}) {
  const { selectedId, select, actions } = useBuilder();
  const entities = entitiesOf(screen);
  // TASK 15: one deterministic render-order pipeline (layer → order → model
  // index) shared with the runtimes. Memoized — sorting never runs per frame.
  const sortedEntities = useMemo(() => sortedRenderOrder(screen), [screen]);
  const [live, setLive] = useState<Record<string, EntityRect>>({});
  // The cell the paint cursor is over (Paint/Erase feedback before commit).
  const [hoverCell, setHoverCell] = useState<{ id: string; col: number; row: number } | null>(null);
  // TASK 62 §25: viewport-local multi-selection (ctrl+click / marquee). The
  // primary `selectedId` stays the builder's single selection; the set only
  // extends it for group gestures. Group edits are ONE canonical commit.
  const [multiIds, setMultiIds] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  useEffect(() => {
    setMultiIds(new Set());
    // Reset on selection or SCENE change — not on every model commit (an
    // alignment/group edit produces a new screen object but the same scene).
  }, [selectedId, screen?.id]);
  const dragRef = useRef<{
    id: string;
    kind: "move" | "resize";
    startX: number;
    startY: number;
    origin: EntityRect;
    /** TASK 62: the whole multi-selection moves with the dragged entity. */
    group: { id: string; origin: EntityRect }[];
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

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

      // Tile tools: with Paint/Erase active a gesture edits cells live; with
      // Fill / Erase-fill the whole contiguous region commits in ONE step.
      if (TILE_TOOLS.includes(tool) && kind === "move" && component.type === "tilemap") {
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const grid = tilemapGrid(component.props);
        const paint = {
          id: component.id,
          left: box.left,
          top: box.top,
          cell: tilemapCellSize(component.props),
          cols: grid.cols,
          rows: grid.rows,
          mode: tool as Exclude<SceneTool, "select">,
          tiles: tilesToMap(String(component.props?.tiles ?? "")),
        };
        const cellAt = (clientX: number, clientY: number) => {
          const col = Math.floor((clientX - paint.left) / scale / paint.cell);
          const row = Math.floor((clientY - paint.top) / scale / paint.cell);
          if (col < 0 || row < 0 || col >= paint.cols || row >= paint.rows) return null;
          return { col, row };
        };

        if (tool === "fill" || tool === "erasefill") {          // TASK 62 §18: REAL bounded flood fill. BFS over the tilemap's own
          // grid from the clicked cell; the region is every cell whose value
          // matches the target (fill paints them with the active tile;
          // erase-fill clears contiguous PAINTED cells). Malformed data is
          // normalized by tilesToMap, the grid bounds the walk (no infinite
          // loops), and the whole region is ONE commit = one undo entry.
          const at = cellAt(event.clientX, event.clientY);
          if (!at) return;
          const key = (c: number, r: number) => `${c},${r}`;
          const targetValue = paint.tiles.get(key(at.col, at.row));
          if (tool === "fill" ? paint.tiles.get(key(at.col, at.row)) === activeTile : targetValue === undefined) {
            return; // nothing would change
          }
          const visited = new Set<string>([key(at.col, at.row)]);
          const queue = [at];
          while (queue.length > 0) {
            const cell = queue.shift()!;
            if (tool === "fill") paint.tiles.set(key(cell.col, cell.row), activeTile);
            else paint.tiles.delete(key(cell.col, cell.row));
            for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
              const nc = cell.col + dc;
              const nr = cell.row + dr;
              const nk = key(nc, nr);
              if (nc < 0 || nr < 0 || nc >= paint.cols || nr >= paint.rows) continue;
              if (visited.has(nk)) continue;
              const value = paint.tiles.get(nk);
              const matches = tool === "fill" ? value === targetValue : value !== undefined;
              if (matches) {
                visited.add(nk);
                queue.push({ col: nc, row: nr });
              }
            }
          }
          actions.updateProps(paint.id, { tiles: tilesToString(paint.tiles) });
          return;
        }

        paintRef.current = { ...paint };
        const applyAt = (clientX: number, clientY: number) => {
          const active = paintRef.current;
          if (!active) return;
          const cell = cellAt(clientX, clientY);
          if (!cell) return;
          const key = `${cell.col},${cell.row}`;
          if (active.mode === "paint") {
            if (active.tiles.get(key) === activeTile) return;
            active.tiles.set(key, activeTile);
          } else {
            if (!active.tiles.has(key)) return;
            active.tiles.delete(key);
          }
          // Every cell change is a real model commit (canonical props, undo,
          // autosave) — never local-only state.
          actions.updateProps(active.id, { tiles: tilesToString(active.tiles) });
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
      // TASK 62 §25: ctrl/cmd+click toggles multi-select membership. It does
      // NOT change the primary selection — select() would re-run the reset
      // effect and clear the set it just built.
      if (event.ctrlKey || event.metaKey) {
        setMultiIds((prev) => {
          const next = new Set(prev);
          if (next.has(component.id)) next.delete(component.id);
          else next.add(component.id);
          return next;
        });
        return;
      }
      if (multiIds.size > 1 && !multiIds.has(component.id)) setMultiIds(new Set());
      select(component.id);
      const origin = liveRef.current[component.id] ?? entityRect(component.props, component.type);
      // The whole active selection moves together (single-entity selection
      // moves exactly as before).
      const group =
        multiIds.size > 1 && multiIds.has(component.id)
          ? entities
              .filter((e) => multiIds.has(e.id))
              .map((e) => ({ id: e.id, origin: liveRef.current[e.id] ?? entityRect(e.props, e.type) }))
          : [{ id: component.id, origin }];
      dragRef.current = { id: component.id, kind, startX: event.clientX, startY: event.clientY, origin, group };

      const onMove = (move: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = (move.clientX - drag.startX) / scale;
        const dy = (move.clientY - drag.startY) / scale;
        const round = (value: number) => (snap ? Math.round(value / SNAP) * SNAP : Math.round(value));
        if (drag.kind === "resize") {
          setLive((current) => ({
            ...current,
            [drag.id]: {
              ...drag.origin,
              width: Math.max(8, round(drag.origin.width + dx)),
              height: Math.max(8, round(drag.origin.height + dy)),
            },
          }));
          return;
        }
        setLive((current) => {
          const next = { ...current };
          for (const member of drag.group) {
            next[member.id] = {
              ...member.origin,
              x: Math.max(0, round(member.origin.x + dx)),
              y: Math.max(0, round(member.origin.y + dy)),
            };
          }
          return next;
        });
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
        // One commit per gesture — group moves commit EVERY member through
        // ONE updateComponentsPropsMany (one undo entry).
        if (drag.kind === "move" && drag.group.length > 1) {
          const patches = drag.group
            .map((member) => liveRef.current[member.id])
            .filter((r): r is EntityRect => Boolean(r))
            .map((r, index) => ({ id: drag.group[index]!.id, props: { x: r.x, y: r.y } }));
          actions.updateComponentsPropsMany(patches);
        } else if (drag.kind === "move") {
          actions.updateProps(drag.id, { x: rect.x, y: rect.y });
        } else {
          actions.updateProps(drag.id, { width: rect.width, height: rect.height });
        }
        setLive((current) => {
          const next = { ...current };
          for (const member of drag.group) delete next[member.id];
          return next;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [scale, snap, select, actions, tool, activeTile, entities, multiIds],
  );

  // TASK 62 §25: marquee selection — drag on empty stage with the Select
  // tool sweeps a rectangle; every intersecting entity joins the set.
  const onStagePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (tool !== "select" || event.target !== event.currentTarget || event.button !== 0) return;
      const stage = stageRef.current;
      if (!stage) return;
      event.preventDefault();
      const box = stage.getBoundingClientRect();
      const px = (clientX: number) => (clientX - box.left) / scale;
      const py = (clientY: number) => (clientY - box.top) / scale;
      const x0 = px(event.clientX);
      const y0 = py(event.clientY);
      setMarquee({ x0, y0, x1: x0, y1: y0 });
      const onMove = (move: PointerEvent) => setMarquee({ x0, y0, x1: px(move.clientX), y1: py(move.clientY) });
      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const rect = { x0, y0, x1: px(up.clientX), y1: py(up.clientY) };
        setMarquee(null);
        const minX = Math.min(rect.x0, rect.x1);
        const maxX = Math.max(rect.x0, rect.x1);
        const minY = Math.min(rect.y0, rect.y1);
        const maxY = Math.max(rect.y0, rect.y1);
        if (maxX - minX < 4 && maxY - minY < 4) {
          setMultiIds(new Set()); // a click on empty space clears the set
          return;
        }
        const hit = new Set<string>();
        for (const entity of entities) {
          if (entity.type === "camera") continue;
          const r = entityRect(entity.props, entity.type);
          if (r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY) hit.add(entity.id);
        }
        // No select() here — changing the primary selection would re-run the
        // reset effect and clear the set the sweep just built.
        setMultiIds(hit);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [tool, scale, entities, select],
  );

  // TASK 62 §26: alignment over the selection's real bounds — ONE commit.
  const alignSelection = useCallback(
    (mode: "left" | "center-x" | "right" | "top" | "middle" | "bottom") => {
      const ids = multiIds.size > 1 ? [...multiIds] : [];
      if (ids.length < 2) return;
      const members = ids
        .map((id) => {
          const component = entities.find((e) => e.id === id);
          if (!component) return null;
          const rect = liveRef.current[id] ?? entityRect(component.props, component.type);
          return { id, rect };
        })
        .filter((m): m is { id: string; rect: EntityRect } => m !== null);
      if (members.length < 2) return;
      const minX = Math.min(...members.map((m) => m.rect.x));
      const maxX = Math.max(...members.map((m) => m.rect.x + m.rect.width));
      const minY = Math.min(...members.map((m) => m.rect.y));
      const maxY = Math.max(...members.map((m) => m.rect.y + m.rect.height));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const patches = members.map(({ id, rect }) => {
        let { x, y } = rect;
        if (mode === "left") x = minX;
        if (mode === "right") x = maxX - rect.width;
        if (mode === "center-x") x = centerX - rect.width / 2;
        if (mode === "top") y = minY;
        if (mode === "bottom") y = maxY - rect.height;
        if (mode === "middle") y = centerY - rect.height / 2;
        return { id, props: { x: Math.round(x), y: Math.round(y) } };
      });
      actions.updateComponentsPropsMany(patches);
      setLive({});
    },
    [multiIds, entities, actions],
  );

  return (
    <div ref={stageRef} style={{ position: "absolute", inset: 0 }} onPointerDown={onStagePointerDown}>
      {/* TASK 62 §29: debug overlays — editor preferences, ALL default OFF;
          they read the same canonical props the runtime collides with. */}
      {showCollisions
        ? entities
            .filter((e) => e.type !== "camera" && entityCollidable(e.props, e.type) && !entityIsTrigger(e.type, e.props))
            .map((entity) => {
              const rect = rectOf(entity);
              return (
                <div
                  key={`debug-solid-${entity.id}`}
                  data-debug-solid={entity.id}
                  aria-hidden="true"
                  style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, border: "2px dashed rgb(70 227 180 / 0.8)", borderRadius: 4, pointerEvents: "none" }}
                />
              );
            })
        : null}
      {showTriggers
        ? entities
            .filter((e) => entityIsTrigger(e.type, e.props) && entityCollidable(e.props, e.type))
            .map((entity) => {
              const rect = rectOf(entity);
              return (
                <div
                  key={`debug-trigger-${entity.id}`}
                  data-debug-trigger={entity.id}
                  aria-hidden="true"
                  style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.width, height: rect.height, border: "2px dashed rgb(255 180 84 / 0.85)", background: "rgb(255 180 84 / 0.12)", borderRadius: 4, pointerEvents: "none" }}
                />
              );
            })
        : null}
      {showTileCollision
        ? entities
            .filter((e) => e.type === "tilemap")
            .flatMap((entity) =>
              tilemapSolidCellRects(entity.props, rectOf(entity)).map((cell, index) => (
                <div
                  key={`debug-tile-${entity.id}-${index}`}
                  data-debug-tile-solid={`${Math.round(cell.x)},${Math.round(cell.y)}`}
                  aria-hidden="true"
                  style={{ position: "absolute", left: cell.x, top: cell.y, width: cell.width, height: cell.height, outline: "1.5px solid rgb(70 227 180 / 0.7)", outlineOffset: -1, pointerEvents: "none" }}
                />
              )),
            )
        : null}
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
        // TASK 62 §10/§11: pivot + flip through the ONE formula — the editor
        // composes rotate + flips on the SAME element with the pivot as the
        // transform origin, exactly like the runtime and the export.
        const orientation = spriteTransformStyle(component.props);
        const composed = [
          rotation ? `rotate(${rotation}deg)` : "",
          orientation.transform ?? "",
        ].filter(Boolean).join(" ");
        const visible = entityVisible(component.props);
        const selected = selectedId === component.id;
        const inMulti = multiIds.has(component.id);
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
              transform: composed || undefined,
              transformOrigin: orientation.transformOrigin,
              opacity: visible ? 1 : 0.35,
              outline: selected
                ? "2px solid #8f7bff"
                : inMulti
                  ? "2px solid #5fa8ff"
                  : "1px solid rgb(255 255 255 / 0.18)",
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

      {/* TASK 62 §25: marquee sweep visual (editor-only). */}
      {marquee ? (
        <div
          aria-hidden="true"
          data-marquee="true"
          style={{
            position: "absolute",
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
            border: "1.5px dashed rgb(95 168 255 / 0.9)",
            background: "rgb(95 168 255 / 0.08)",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {/* TASK 62 §26: group toolbar for a multi-selection — alignment over the
          selection's real bounds, group duplicate/delete; ONE commit each. */}
      {multiIds.size > 1 ? (
        <div
          data-align-toolbar="true"
          className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-line bg-[#12151f]/95 p-1 shadow-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-sky">
            {multiIds.size} selected
          </span>
          {(
            [
              ["left", "⇤", "Align left"],
              ["center-x", "⇔", "Align centers horizontally"],
              ["right", "⇥", "Align right"],
              ["top", "⇡", "Align top"],
              ["middle", "⇕", "Align middles vertically"],
              ["bottom", "⇣", "Align bottom"],
            ] as const
          ).map(([mode, glyph, label]) => (
            <button
              key={mode}
              type="button"
              data-align={mode}
              aria-label={label}
              title={label}
              onClick={() => alignSelection(mode)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[12px] text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
            >
              {glyph}
            </button>
          ))}
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />
          <button
            type="button"
            data-group-duplicate="true"
            aria-label="Duplicate selection"
            title="Duplicate selection (one undo step)"
            onClick={() => actions.duplicateComponentsMany([...multiIds])}
            className="flex h-6 items-center rounded-md px-1.5 text-[11px] text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          >
            ⧉
          </button>
          <button
            type="button"
            data-group-delete="true"
            aria-label="Delete selection"
            title="Delete selection (one undo step)"
            onClick={() => {
              actions.removeComponentsMany([...multiIds]);
              setMultiIds(new Set());
            }}
            className="flex h-6 items-center rounded-md px-1.5 text-[11px] text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The visual of one entity on the design stage (mirrors the runtime's shapes). */
function EntityGlyph({ component, rect }: { component: ProjectModelComponent; rect: EntityRect }) {
  const color = typeof component.props?.color === "string" ? component.props.color : "#58c7f0";
  const label = componentLabel(component);
  const texture = typeof component.props?.src === "string" && component.props.src.trim() !== "" ? component.props.src.trim() : null;
  if (texture) {
    // TASK 62 §10/§11: the SAME pivot/flip formula the runtime and export
    // use — the editor never lies about the anchor or the mirroring.
    const orientation = spriteTransformStyle(component.props);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- project asset or user URL
      <img
        src={imageUrl(texture)}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "fill", imageRendering: "pixelated", pointerEvents: "none", transform: orientation.transform, transformOrigin: orientation.transformOrigin }}
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
