"use client";

import { useCallback, useRef, useState } from "react";
import { useBuilder, componentLabel } from "@/app/builder/[id]/builder/builder-context";
import { entityRect, entitiesOf, entityVisible, type EntityRect } from "@/lib/project-model/scene";
import type { ProjectModelComponent, ProjectModelScreen } from "@/types/project";
import { imageUrl } from "@/lib/api";

/**
 * The scene editor canvas (TASK 08): game screens edit as a 2D stage.
 * Select, move (drag), scale (corner handle), rotate (inspector field,
 * rendered live), duplicate, delete — every gesture commits once through
 * the shared model path, so undo/redo and autosave behave like every other
 * edit. Grid dots + optional snap keep placement deliberate.
 */

const SNAP = 10;

export function SceneEditor({
  screen,
  scale,
  snap,
}: {
  screen: ProjectModelScreen;
  scale: number;
  snap: boolean;
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

  // Drag gestures listen on window: React's conditional container props are
  // evaluated at render time, and a pointerdown whose selection re-render
  // races the first pointermove silently drops the gesture. Window listeners
  // are immune to that and to capture retargeting.
  const onPointerDown = useCallback(
    (event: React.PointerEvent, component: ProjectModelComponent, kind: "move" | "resize") => {
      event.stopPropagation();
      event.preventDefault();
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
    [scale, snap, select, actions],
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
              cursor: "move",
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
    case "enemy":
      return <div title={label} style={{ width: "100%", height: "100%", borderRadius: 8, background: color, boxShadow: "inset -3px -3px 0 rgb(0 0 0 / 0.22)" }} />;
    case "trigger":
      return <div title={label} style={{ width: "100%", height: "100%", border: `2px dashed ${color}`, borderRadius: 8, background: `${color}22` }} />;
    default:
      return <div title={label} style={{ width: "100%", height: "100%", background: color, borderRadius: 6, opacity: 0.92 }} />;
  }
}
