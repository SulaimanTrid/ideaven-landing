"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
 *
 * TASK 63 §6/§7/§8: a sticky search field filters by name/type/category
 * (registry vocabulary only — no second index), categories are collapsible
 * with the state persisted per project type in localStorage, and the
 * primary category (Game Entities / 3D Objects / User Interface) starts
 * open while the rest wait collapsed for beginners.
 */

const PALETTE_ALIASES: Record<string, string> = {
  text: "text textinput text-input passwordinput password-input texttospeech text-to-speech tts label",
  "text-input": "text input field text",
  "password-input": "password secret input text field",
  "text-to-speech": "text to speech tts voice",
  image: "image picture photo",
  sprite: "sprite texture character",
  button: "button tap press",
  player: "player hero character",
  coin: "coin pickup money",
  tilemap: "tilemap tiles level world",
  cube: "cube box 3d",
  sphere: "sphere ball 3d",
  plane: "plane floor ground 3d",
  camera: "camera view follow",
  light: "light lamp glow",
};

function paletteMatches(defLabel: string, defType: string, categoryLabel: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystacks = [
    defLabel.toLowerCase(),
    defType.toLowerCase(),
    categoryLabel.toLowerCase(),
    PALETTE_ALIASES[defType] ?? "",
    PALETTE_ALIASES[defLabel.toLowerCase()] ?? "",
  ];
  return haystacks.some((hay) => hay.includes(q));
}

export function Palette() {
  const { model, activeScreenId, selectedId, actions, draggingRef } = useBuilder();
  const [importOpen, setImportOpen] = useState(false);
  const [importedName, setImportedName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const importTimer = useRef<number | null>(null);

  const visibleCategories = useMemo(
    () =>
      CATEGORY_ORDER.filter((category) =>
        model.type === "3d"
          ? // TASK 58 §13: a 3D project surfaces ONLY the 3D Objects palette —
            // app-UI and 2D-game components never mix into the 3D workflow.
            category.id === "3d"
          : category.id === "3d"
            ? false
            : category.id === "game"
              ? model.type === "game"
              : true,
      ),
    [model.type],
  );

  // TASK 63 §8: collapsible categories, persisted per project type in
  // localStorage (UI-only state — never the project model). Default: the
  // PRIMARY category (first visible for this project type) is open; the
  // rest wait collapsed.
  const primaryId = visibleCategories[0]?.id ?? "ui";
  const storageKey = `ideaven.palette.open.${model.type}`;
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set([primaryId]));
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOpenCategories(new Set(parsed));
        }
      }
    } catch {
      // Private mode / disabled storage: defaults apply.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive when the project type changes
  }, [storageKey]);

  const toggleCategory = (id: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Storage unavailable: the session state still works.
      }
      return next;
    });
  };

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

  const searching = search.trim() !== "";

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* TASK 63 §7: sticky palette search over the registry vocabulary. */}
      <div className="sticky top-0 z-10 -mx-3 -mt-3 bg-panel px-3 pb-2 pt-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search components…"
          aria-label="Search components"
          data-palette-search="true"
          className="h-8 w-full rounded-lg border border-line bg-canvas px-2.5 text-[12.5px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
        />
      </div>

      {searching ? (
        <p className="px-1 text-[11px] text-mist" data-palette-results="true">
          {COMPONENT_DEFS.filter((def) => {
            const category = visibleCategories.find((c) => c.id === def.category);
            return category && paletteMatches(def.label, def.type, category.label, search);
          }).length}{" "}
          matching component{COMPONENT_DEFS.filter((def) => {
            const category = visibleCategories.find((c) => c.id === def.category);
            return category && paletteMatches(def.label, def.type, category.label, search);
          }).length === 1 ? "" : "s"}
        </p>
      ) : null}

      {visibleCategories.map((category, categoryIndex) => {
        const open = searching || openCategories.has(category.id);
        const defs = COMPONENT_DEFS.filter(
          (def) =>
            def.category === category.id &&
            paletteMatches(def.label, def.type, category.label, search),
        );
        if (searching && defs.length === 0) return null;
        return (
          <section key={category.id} aria-label={category.label}>
            {!searching ? (
              <button
                type="button"
                data-category-toggle={category.id}
                aria-expanded={open}
                aria-controls={`palette-category-${category.id}`}
                onClick={() => toggleCategory(category.id)}
                title={`${open ? "Collapse" : "Expand"} ${category.label}`}
                className="flex w-full items-center justify-between rounded-md px-1 pb-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
                    {category.label}
                  </span>
                  {categoryIndex === 0 ? (
                    <span className="ml-1.5 text-[10px] normal-case tracking-normal text-mist opacity-80">
                      · start here
                    </span>
                  ) : null}
                </span>
                <span aria-hidden="true" className={`text-mist transition-transform ${open ? "rotate-90" : ""}`}>
                  ▸
                </span>
              </button>
            ) : (
              <h3 className="px-1 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
                {category.label}
              </h3>
            )}
            <div
              id={`palette-category-${category.id}`}
              className="grid grid-cols-2 gap-1.5"
              hidden={!open}
              role={searching ? undefined : "region"}
              aria-label={category.label}
            >
              {defs.map((def) => {
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
        );
      })}

      {searching ? null : (
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
      )}

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
