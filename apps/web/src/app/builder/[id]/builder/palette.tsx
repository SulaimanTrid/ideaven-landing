"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_ORDER, COMPONENT_DEFS, getDef } from "@/lib/project-model/registry";
import { locateComponent } from "@/lib/project-model/ops";
import { useBuilder, type DragPayload } from "./builder-context";
import { ImportExtensionDialog } from "./import-extension";

/**
 * The component palette. Items are real registry entries — dragging one onto
 * the canvas creates that exact component with its defaults in the model.
 * Clicking adds it to the selected container (or the screen root), which
 * keeps the palette usable without a pointer drag. Components whose runtime
 * is not implemented yet render disabled with their honest reason; the
 * Extensions section carries the Import Extension flow.
 */
export function Palette() {
  const { model, activeScreenId, selectedId, actions, draggingRef } = useBuilder();
  const [importOpen, setImportOpen] = useState(false);
  const [importedName, setImportedName] = useState<string | null>(null);
  const importTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (importTimer.current !== null) window.clearTimeout(importTimer.current);
    };
  }, []);

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
      {CATEGORY_ORDER.filter((category) => category.id !== "game" || model.type === "game").map((category) => (
        <section key={category.id} aria-label={category.label}>
          <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
            {category.label}
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {COMPONENT_DEFS.filter((def) => def.category === category.id).map((def) => {
              const Glyph = def.glyph;
              const designed = Boolean(def.designed);
              return (
                <button
                  key={def.type}
                  type="button"
                  draggable={!designed}
                  onDragStart={(event) => {
                    if (designed) {
                      event.preventDefault();
                      return;
                    }
                    startDrag(event, def.type);
                  }}
                  onDragEnd={endDrag}
                  onClick={() => {
                    if (!designed) addTo(def.type);
                  }}
                  aria-disabled={designed || undefined}
                  title={
                    designed
                      ? `${def.label} — designed, not available yet: ${def.designed}`
                      : `Add “${def.label}” — or drag onto the canvas`
                  }
                  className={`flex flex-col items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-2.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                    designed
                      ? "cursor-not-allowed opacity-55"
                      : "cursor-grab hover:border-white/20 hover:bg-surface active:cursor-grabbing"
                  }`}
                >
                  <span className={designed ? "text-mist" : "text-fog"}>
                    <Glyph size={16} />
                  </span>
                  <span className={`text-[11px] leading-4 ${designed ? "text-mist" : "text-fog"}`}>
                    {def.label}
                    {designed ? <span className="block text-[9.5px] uppercase tracking-[0.1em] text-amber/90">designed</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section aria-label="Extensions">
        <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
          Extensions
        </h3>
        {importedName ? (
          <p className="mb-2 rounded-lg border border-mint/50 bg-mint/10 px-2.5 py-2 text-[11.5px] leading-4 text-ink">
            ✓ “{importedName}” installed — its blocks appear in Blocks mode.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet/40 bg-violet/[0.08] px-2 py-2 text-[12px] font-medium text-ink transition-colors hover:border-violet hover:bg-violet/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Import Extension
        </button>
        <p className="mt-1.5 px-1 text-[11px] leading-4 text-mist">
          Install a manifest package: validated, inspected, then registered —
          its blocks show up in Blocks mode.
        </p>
      </section>

      <p className="px-1 pt-1 text-[11px] leading-5 text-mist">
        Click to add to the screen, or drag onto the canvas. Drop on a container to nest.
      </p>

      {importOpen ? (
        <ImportExtensionDialog
          onClose={() => setImportOpen(false)}
          onImported={(name) => {
            setImportOpen(false);
            setImportedName(name);
            if (importTimer.current !== null) window.clearTimeout(importTimer.current);
            importTimer.current = window.setTimeout(() => setImportedName(null), 8000);
          }}
        />
      ) : null}
    </div>
  );
}
