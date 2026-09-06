"use client";

import { CATEGORY_ORDER, COMPONENT_DEFS, getDef } from "@/lib/project-model/registry";
import { locateComponent } from "@/lib/project-model/ops";
import { useBuilder, type DragPayload } from "./builder-context";

/**
 * The component palette. Items are real registry entries — dragging one onto
 * the canvas creates that exact component with its defaults in the model.
 * Clicking adds it to the selected container (or the screen root), which
 * keeps the palette usable without a pointer drag.
 */
export function Palette() {
  const { model, activeScreenId, selectedId, actions, draggingRef } = useBuilder();

  const startDrag = (event: React.DragEvent, componentType: string) => {
    const payload: DragPayload = { kind: "new", componentType };
    draggingRef.current = payload;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", componentType);
  };

  const endDrag = () => {
    draggingRef.current = null;
  };

  const addTo = (componentType: string) => {
    const selected = selectedId ? locateComponent(model, selectedId) : undefined;
    const selectedIsContainer = selected ? getDef(selected.node.type)?.container === true : false;

    if (selected && selectedIsContainer) {
      const count = selected.node.children?.length ?? 0;
      actions.insertNew(componentType, { screenId: activeScreenId, parentId: selected.node.id, index: count });
      return;
    }
    const screen = model.screens.find((s) => s.id === activeScreenId);
    actions.insertNew(componentType, {
      screenId: activeScreenId,
      parentId: null,
      index: screen?.components.length ?? 0,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      {CATEGORY_ORDER.map((category) => (
        <section key={category.id} aria-label={category.label}>
          <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
            {category.label}
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPONENT_DEFS.filter((def) => def.category === category.id).map((def) => {
              const Glyph = def.glyph;
              return (
                <button
                  key={def.type}
                  type="button"
                  draggable
                  onDragStart={(event) => startDrag(event, def.type)}
                  onDragEnd={endDrag}
                  onClick={() => addTo(def.type)}
                  title={`Add “${def.label}” — or drag onto the canvas`}
                  className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-2.5 text-center transition-colors hover:border-white/20 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint active:cursor-grabbing"
                >
                  <span className="text-fog">
                    <Glyph size={16} />
                  </span>
                  <span className="text-[11px] leading-4 text-fog">{def.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <p className="px-1 pt-1 text-[11px] leading-5 text-mist">
        Click to add to the screen, or drag onto the canvas. Drop on a container to nest.
      </p>
    </div>
  );
}
