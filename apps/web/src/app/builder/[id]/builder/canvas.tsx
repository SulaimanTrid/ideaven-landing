"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBuilder, type DropSpot } from "./builder-context";
import { ComponentNode, DropLine } from "./renderer";
import { DeviceFrame } from "@/components/builder/device-frame";
import { findScreen } from "@/lib/project-model/ops";
import { isSceneScreen, tileColorAt, tilemapPaletteValues } from "@/lib/project-model/scene";
import { SceneEditor, type SceneTool } from "./scene-canvas";
import { Viewport3D } from "@/components/runtime/viewport-3d";
import { viewportSize, ViewportFrame, type ViewportDevice, type ViewportOrientation } from "@/components/builder/viewport";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * The canvas: a device-framed, zoomable surface that renders the active
 * screen from the Project Model and accepts palette/new-component drops and
 * node moves anywhere in the tree.
 */

const DEVICES = [
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 834, height: 1112 },
  { id: "desktop", label: "Desktop", width: 1280, height: 800 },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

export function BuilderCanvas() {
  const { model, activeScreenId, selectedId, select, setIndicator, draggingRef, applyDrop, actions } = useBuilder();
  const { t } = useI18n();
  /** Game projects design against a dark SCENE stage, not a white device. */
  const isGame = model.type === "game";
  /** TASK 51: 3D projects design in the real 3D viewport. */
  const is3d = model.type === "3d";
  const [snap, setSnap] = useState(true);
  // Tilemap painting tools (SYSTEM 4): active while a tilemap is selected.
  const [sceneTool, setSceneTool] = useState<SceneTool>("select");
  const [activeTile, setActiveTile] = useState(1);
  // TASK 15: depth debugging — overlay each entity's layer name + order.
  const [showSorting, setShowSorting] = useState(false);
  const saved = model.settings.preview;
  const [device, setDevice] = useState<ViewportDevice>(saved?.device ?? "phone");
  const [orientation, setOrientation] = useState<ViewportOrientation>(saved?.orientation ?? "portrait");
  const viewportSettings = { device, orientation };
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(1);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const frame = viewportSize({ device, orientation });
  const screen = findScreen(model, activeScreenId) ?? model.screens[0];
  const isScene = isSceneScreen(screen);
  const tilemapSelected =
    isScene &&
    typeof selectedId === "string" &&
    screen?.components.some((c) => c.id === selectedId && c.type === "tilemap");
  const tilemapComponent = tilemapSelected
    ? screen?.components.find((c) => c.id === selectedId)
    : undefined;
  const paletteValues = tilemapComponent ? tilemapPaletteValues(tilemapComponent.props) : [];
  // Keep the active tile paintable: clamp to the tilemap's own palette.
  const safeActiveTile = paletteValues.includes(activeTile) ? activeTile : (paletteValues[0] ?? 1);

  // Selecting anything that is not that tilemap returns the stage to Select
  // so a stale paint mode never surprises a drag elsewhere.
  useEffect(() => {
    if (!tilemapSelected) setSceneTool("select");
  }, [tilemapSelected]);

  // Fit-to-width: measure the surface and scale the frame down when needed.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const update = () => {
      const available = surface.clientWidth - 64;
      setFitScale(Math.min(1, available / frame.width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [frame.width]);

  const scale = zoom === "fit" ? fitScale : zoom;

  // Clear the drop indicator whenever any drag gesture ends.
  useEffect(() => {
    const clear = () => setIndicator(null);
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, [setIndicator]);

  // The screen root behaves like a container with parentId = null.
  const onRootDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!draggingRef.current || !screen) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const el = event.currentTarget;
      const kids = Array.from(el.children).filter(
        (child) => child.getAttribute("data-node-id") !== null,
      );
      if (kids.length === 0) {
        setIndicator({
          parentId: null, screenId: screen.id, index: 0,
          x: 8, y: 8, w: 0, h: 0, horizontal: false, mode: "into",
        });
        return;
      }
      let index = kids.length;
      let line: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 0, h: 0 };
      for (let i = 0; i < kids.length; i += 1) {
        const kid = kids[i];
        if (!kid) continue;
        const rect = kid.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          index = i;
          const parentRect = el.getBoundingClientRect();
          line = i === 0
            ? { x: 0, y: Math.max(0, rect.top - parentRect.top - 4), w: parentRect.width, h: 3 }
            : { x: 0, y: rect.top - parentRect.top - 2, w: parentRect.width, h: 3 };
          break;
        }
      }
      if (index === kids.length) {
        const last = kids[kids.length - 1];
        const parentRect = el.getBoundingClientRect();
        if (last) line = { x: 0, y: last.getBoundingClientRect().bottom - parentRect.top + 4, w: parentRect.width, h: 3 };
      }
      setIndicator({
        parentId: null, screenId: screen.id, index,
        ...line, horizontal: false, mode: "line",
      });
    },
    [draggingRef, setIndicator, screen],
  );

  const onRootDrop = (event: React.DragEvent) => {
    event.preventDefault();
    applyDrop();
  };

  const onRootClick = () => select(null);

  // A model always carries at least one screen, but stay strict anyway.
  if (!screen) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      {/* Canvas toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-line px-4">
        <div className="flex items-center gap-1" role="group" aria-label="Device preset">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setDevice(d.id);
                actions.updatePreviewSettings({ device: d.id as ViewportDevice });
              }}
              aria-pressed={device === d.id}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                device === d.id ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          {isScene ? (
            <>
              <button
                type="button"
                onClick={() => setSnap((value) => !value)}
                aria-pressed={snap}
                title="Snap entity positions to a 10px grid"
                className={`mr-2 h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                  snap ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
                }`}
              >
                ⌗ {snap ? t("builder.snapOn") : t("builder.snapOff")}
              </button>
              <button
                type="button"
                onClick={() => setShowSorting((value) => !value)}
                aria-pressed={showSorting}
                title="Show each entity's rendering layer and order (back-to-front)"
                className={`mr-2 h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                  showSorting ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
                }`}
              >
                ⇅ {t("builder.sortingOrder")}
              </button>
              {tilemapSelected ? (
                <div
                  className="mr-2 flex h-7 items-center gap-0.5 rounded-md border border-line p-0.5"
                  role="group"
                  aria-label="Tilemap tools"
                >
                  {(
                    [
                      { id: "select", label: "Select", glyph: "⬉" },
                      { id: "paint", label: "Paint", glyph: "▦" },
                      { id: "erase", label: "Erase", glyph: "⌫" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSceneTool(item.id)}
                      aria-pressed={sceneTool === item.id}
                      title={`${item.label} tiles — click or drag across the tilemap`}
                      className={`h-6 rounded px-2 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                        sceneTool === item.id
                          ? item.id === "erase"
                            ? "bg-rose/20 text-rose"
                            : "bg-surface-strong text-ink"
                          : "text-mist hover:text-fog"
                      }`}
                    >
                      {item.glyph} {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {tilemapSelected && tilemapComponent ? (
                <div
                  className="mr-2 flex h-7 items-center gap-1 rounded-md border border-line px-1.5"
                  role="group"
                  aria-label="Tile palette"
                >
                  {paletteValues.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setActiveTile(value)}
                      aria-pressed={safeActiveTile === value}
                      aria-label={`Tile ${value}`}
                      title={`Paint with tile ${value}`}
                      style={{ background: tileColorAt(tilemapComponent.props, value) }}
                      className={`h-4 w-4 rounded-sm border transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                        safeActiveTile === value
                          ? "border-white/90 shadow-[0_0_0_2px_rgb(143_123_255/0.9)]"
                          : "border-white/25"
                      }`}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {device !== "desktop" ? (
            <button
              type="button"
              onClick={() => {
                const next: ViewportOrientation = orientation === "portrait" ? "landscape" : "portrait";
                setOrientation(next);
                actions.updatePreviewSettings({ orientation: next });
              }}
              aria-pressed={orientation === "landscape"}
              title={t("viewport.orientation")}
              className="mr-2 h-7 rounded-md border border-line px-2 text-[12px] font-medium text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {orientation === "portrait" ? `▯ ${t("viewport.portrait")}` : `▭ ${t("viewport.landscape")}`}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom === "fit" && fitScale <= 0.25}
            onClick={() => setZoom((z) => clampScale((z === "fit" ? fitScale : z) - 0.1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-[11px] text-mist">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom !== "fit" && zoom >= 1.5}
            onClick={() => setZoom((z) => clampScale((z === "fit" ? fitScale : z) + 0.1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            aria-pressed={zoom === "fit"}
            className={`ml-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
              zoom === "fit" ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
            }`}
          >
            Fit
          </button>
        </div>
      </div>

      {/* Surface */}
      <div
        ref={surfaceRef}
        className="relative flex-1 overflow-auto p-8"
        onClick={onRootClick}
        onDragOver={(event) => {
          // Allow drops that land on empty surface space outside the frame.
          if (draggingRef.current) event.preventDefault();
        }}
      >
        <div
          className="mx-auto"
          style={{
            width: frame.width * scale,
            height: frame.height * scale,
          }}
        >
          {/* The screen root: shared by both branches. */}
          {(() => {
          const screenRoot = (
            <div
              data-node-id={screen.id}
              data-container="1"
              onClick={(event) => {
                event.stopPropagation();
                select(null);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: "100%",
                width: "100%",
                height: "100%",
                position: "relative",
                overflowY: screen.styles?.scrollable === true ? "auto" : undefined,
                background:
                  typeof screen.styles?.background === "string"
                    ? screen.styles.background
                    : isGame
                      ? "#0c0f17"
                      : "#ffffff",
                gap: 0,
              }}
            >
              {screen.components.length === 0 ? (
                <div
                  aria-hidden="true"
                  className="flex flex-1 select-none items-center justify-center p-8 text-center text-[13px] leading-6"
                  style={{ color: "#9aa1b2" }}
                >
                  {t("builder.dragComponents")}
                </div>
              ) : isScene ? (
                <SceneEditor screen={screen} scale={scale} snap={snap} tool={sceneTool} activeTile={safeActiveTile} showSorting={showSorting} />
              ) : (
                screen.components.map((child) => (
                  <ComponentNode
                    key={child.id}
                    node={child}
                    screenId={screen.id}
                    parentId={null}
                    parentAxis="v"
                  />
                ))
              )}
              <DropLine containerId={null} screenId={screen.id} />
            </div>
          );

          if (is3d) {
            // TASK 51/53: 3D projects design in the real 3D viewport (canvas
            // renderer, orbit navigation, click-select, hierarchy panel). The
            // palette stays the insertion path; the inspector edits canonical
            // transforms; hierarchy ops go through the canonical ops.
            return (
              <div data-viewport-3d-shell="true" className="relative h-full w-full" onDragOver={onRootDragOver} onDrop={onRootDrop}>
                <Viewport3D
                  model={model}
                  screen={screen}
                  mode="editor"
                  selectedId={selectedId ?? null}
                  onSelect={(id) => select(id)}
                  onDelete={(id) => actions.removeComponent3D(activeScreenId, id)}
                  onDuplicate={(id) => actions.duplicateHierarchy3D(activeScreenId, id)}
                  onTransform={(id, patch) => actions.updateProps(id, patch)}
                />
              </div>
            );
          }

          if (isGame) {
            // The universal game viewport (TASK 11): dark shell + corner
            // ticks, inside the hardware frame on phone/tablet targets.
            return (
              <ViewportFrame
                kind="game"
                settings={viewportSettings}
                className="data-[screen-frame]"
              >
              <div
                data-screen-frame="1"
                className="relative overflow-hidden text-[#0b0e16] [background-image:radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.06)_1px,transparent_0)] [background-size:22px_22px]"
                style={{
                  width: frame.width,
                  height: frame.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
                onDragOver={onRootDragOver}
                onDrop={onRootDrop}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-2 z-10 rounded-md border border-violet/40 bg-[#12151f]/90 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-violet"
                >
                  scene · {screen.name}
                </span>
                {screenRoot}
              </div>
              </ViewportFrame>
            );
          }

          // App projects design inside a real device shell — never a plain
          // white rectangle. The frame is presentation-only; drops land on
          // the screen root inside it.
          return (
            <div
              data-screen-frame="1"
              style={{
                width: frame.width,
                height: frame.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
              onDragOver={onRootDragOver}
              onDrop={onRootDrop}
            >
              <DeviceFrame kind={device === "custom" ? "desktop" : device}>
                <div className="overflow-hidden rounded-[26px] bg-white text-[#0b0e16]" style={{ width: frame.width, height: frame.height }}>
                  {screenRoot}
                </div>
              </DeviceFrame>
            </div>
          );
          })()}
        </div>
      </div>
    </div>
  );
}

function clampScale(value: number): number {
  return Math.min(1.5, Math.max(0.25, Math.round(value * 10) / 10));
}

// Re-exported for tests/tooling that reason about drop spots.
export type { DropSpot };
