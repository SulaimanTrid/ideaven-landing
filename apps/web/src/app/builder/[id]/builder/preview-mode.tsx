"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { imageUrl } from "@/lib/api";
import { createRuntime, screenOf, type ScreenRuntime } from "@/lib/project-model/runtime";
import { RuntimeNode } from "@/components/runtime/runtime-node";
import { SceneStage } from "@/components/runtime/scene-stage";
import { viewportSize, ViewportFrame, type ViewportDevice, type ViewportOrientation } from "@/components/builder/viewport";
import { isSceneScreen } from "@/lib/project-model/scene";
import { useI18n } from "@/lib/i18n/i18n";
import { useBuilder } from "./builder-context";
import type { PropsMap } from "@/types/project";

/**
 * Preview mode: executes the canonical block IR against a live rendering of
 * the screen. Buttons click, inputs type, logic runs, navigation navigates —
 * the same model Design and Blocks edit, interpreted directly (never the
 * generated code, never a simulation). Component values live in the runtime
 * instance for the current run; a Restart re-seeds them from the model.
 */

const DEVICES: { id: ViewportDevice; labelKey: string }[] = [
  { id: "phone", labelKey: "viewport.phone" },
  { id: "tablet", labelKey: "viewport.tablet" },
  { id: "desktop", labelKey: "viewport.desktop" },
  { id: "custom", labelKey: "viewport.custom" },
];
const ZOOMS = ["fit", 0.25, 0.5, 0.75, 1] as const;

export function PreviewMode() {
  const { model, project, actions } = useBuilder();
  const { t } = useI18n();
  const saved = model.settings.preview;
  const [device, setDevice] = useState<ViewportDevice>(saved?.device ?? "phone");
  const [orientation, setOrientation] = useState<ViewportOrientation>(saved?.orientation ?? "portrait");
  const [safeArea, setSafeArea] = useState<boolean>(saved?.safeArea ?? false);
  const [customW, setCustomW] = useState<number>(saved?.width ?? 1024);
  const [customH, setCustomH] = useState<number>(saved?.height ?? 640);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [screenId, setScreenId] = useState(
    model.navigation.startScreenId || model.screens[0]?.id || "",
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const runtimeRef = useRef<ScreenRuntime | null>(null);
  const canvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const [runId, setRunId] = useState(0);
  const [trace, setTrace] = useState<string[]>([]);
  const [traceOpen, setTraceOpen] = useState(false);

  const persistViewport = (patch: {
    device?: ViewportDevice;
    orientation?: ViewportOrientation;
    safeArea?: boolean;
    width?: number;
    height?: number;
  }) => {
    actions.updatePreviewSettings(patch);
  };

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const pushTrace = useCallback((line: string) => {
    setTrace((lines) => [...lines.slice(-40), line]);
  }, []);

  /** (Re)start the run: fresh variable + component state from the model. */
  const start = useCallback(() => {
    runtimeRef.current?.dispose();
    const startScreen = model.navigation.startScreenId || model.screens[0]?.id || "";
    runtimeRef.current = createRuntime(model, startScreen, {
      onMessage: showToast,
      onNavigate: (id) => setScreenId(id),
      projectId: project.id,
      onUpdate: () => setTick((t) => t + 1),
      canvases: canvasesRef.current,
      onTrace: pushTrace,
    });
    setTrace([]);
    setScreenId(startScreen);
    setRunId((r) => r + 1);
    setTick((t) => t + 1);
  }, [model, showToast, project.id, pushTrace]);

  // Start on entry and restart whenever the model changes — the preview
  // always reflects what Design and Blocks just saved to the model.
  useEffect(() => {
    start();
  }, [start]);

  // Leaving preview stops timers and sensor listeners.
  useEffect(() => {
    return () => runtimeRef.current?.dispose();
  }, []);

  const runtime = runtimeRef.current;

  const emit = useCallback((componentId: string | null, event: string) => {
    runtimeRef.current?.emit(componentId, event);
    setTick((t) => t + 1);
  }, []);

  const setProps = useCallback((componentId: string, patch: PropsMap) => {
    const props = runtimeRef.current?.getComponentProps(componentId);
    if (props) Object.assign(props, patch);
    setTick((t) => t + 1);
  }, []);

  const jumpToScreen = useCallback((id: string) => {
    if (runtimeRef.current) runtimeRef.current.currentScreenId = id;
    setScreenId(id);
    setTick((t) => t + 1);
  }, []);

  const screen = screenOf(model, screenId) ?? model.screens[0];
  const viewportSettings = {
    device,
    orientation,
    safeArea,
    width: customW,
    height: customH,
  };
  const frame = viewportSize(viewportSettings);
  const isScene = isSceneScreen(screen);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const update = () => setFitScale(Math.min(1, (surface.clientWidth - 64) / frame.width, (surface.clientHeight - 64) / frame.height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [frame.width, frame.height]);
  const scale = zoom === "fit" ? fitScale : zoom;


  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-line px-4">
        <div className="flex items-center gap-1" role="group" aria-label="Device preset">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setDevice(d.id);
                persistViewport({ device: d.id });
              }}
              aria-pressed={device === d.id}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                device === d.id ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {t(d.labelKey as never)}
            </button>
          ))}
          {device !== "desktop" ? (
            <button
              type="button"
              onClick={() => {
                const next: ViewportOrientation = orientation === "portrait" ? "landscape" : "portrait";
                setOrientation(next);
                persistViewport({ orientation: next });
              }}
              aria-pressed={orientation === "landscape"}
              title={t("viewport.orientation")}
              className="rounded-md border border-line px-2 py-1 text-[12px] font-medium text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {orientation === "portrait" ? `▯ ${t("viewport.portrait")}` : `▭ ${t("viewport.landscape")}`}
            </button>
          ) : null}
          {!isScene ? (
            <button
              type="button"
              onClick={() => {
                const next = !safeArea;
                setSafeArea(next);
                persistViewport({ safeArea: next });
              }}
              aria-pressed={safeArea}
              title={t("viewport.safeAreaTitle")}
              className={`rounded-md border px-2 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                safeArea ? "border-violet/60 bg-violet/10 text-violet" : "border-line text-mist hover:text-fog"
              }`}
            >
              ⌗ {t("viewport.safeArea")}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Go to screen"
            title="Navigate (simulates navigate blocks)"
            value={screenId}
            onChange={(event) => jumpToScreen(event.target.value)}
            className="h-7 rounded-md border border-line bg-panel px-1.5 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {model.screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-mist">
            {screen?.name ?? "—"}
          </span>
          {device === "custom" ? (
            <span className="flex items-center gap-1 text-[11px] text-mist">
              <input
                type="number"
                min={200}
                max={2000}
                value={customW}
                aria-label={t("viewport.width")}
                onChange={(e) => {
                  const width = Math.max(200, Math.min(2000, Number(e.target.value) || 200));
                  setCustomW(width);
                  persistViewport({ width });
                }}
                className="h-7 w-16 rounded-md border border-line bg-panel px-1 text-center text-ink"
              />
              ×
              <input
                type="number"
                min={200}
                max={2000}
                value={customH}
                aria-label={t("viewport.height")}
                onChange={(e) => {
                  const height = Math.max(200, Math.min(2000, Number(e.target.value) || 200));
                  setCustomH(height);
                  persistViewport({ height });
                }}
                className="h-7 w-16 rounded-md border border-line bg-panel px-1 text-center text-ink"
              />
            </span>
          ) : null}
          <button
            type="button"
            onClick={start}
            title="Restart the run with fresh state"
            className="h-7 rounded-md bg-violet-deep px-3 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            ⟳ {t("builder.restartRun")}
          </button>
        </div>
      </div>

      {/* Viewport scale: Fit / 25 / 50 / 75 / 100 — one quiet row. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-4 py-1.5" role="group" aria-label="Viewport scale">
        {ZOOMS.map((z) => (
          <button
            key={String(z)}
            type="button"
            aria-pressed={zoom === z}
            onClick={() => setZoom(z)}
            className={`h-6 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
              zoom === z ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
            }`}
          >
            {z === "fit" ? t("viewport.fit") : `${Math.round(z * 100)}%`}
          </button>
        ))}
      </div>

      {/* Surface */}
      <div ref={surfaceRef} className="relative min-h-0 flex-1 overflow-auto p-8">
        <div
          className="mx-auto w-fit"
          style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
        >
          <ViewportFrame kind={isScene ? "game" : "app"} settings={viewportSettings}>
          <div
            className="relative overflow-hidden text-[#0b0e16]"
            style={{
              width: frame.width,
              height: frame.height,
              background:
                typeof screen?.styles?.background === "string"
                  ? screen.styles.background
                  : isScene
                    ? "#0c0f17"
                    : "#ffffff",
            }}
          >
            {isScene && screen ? (
              <SceneStage
                key={runId}
                screen={screen}
                runtime={runtime}
                emit={emit}
                onRestart={start}
                onTrace={pushTrace}
                width={frame.width}
                height={frame.height}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "100%",
                  width: "100%",
                  maxHeight: "100%",
                  overflowY: screen?.styles?.scrollable === true ? "auto" : undefined,
                }}
              >
                {(screen?.components ?? []).map((child) => (
                  <RuntimeNode key={child.id} node={child} runtime={runtime} emit={emit} setProps={setProps} canvases={canvasesRef.current} />
                ))}
              </div>
            )}

            {/* Message toast from show-message blocks */}
            {toast ? (
              <div
                role="status"
                className="absolute inset-x-4 bottom-5 rounded-xl px-4 py-3 text-[13px] font-medium text-white shadow-lg"
                style={{ background: "rgb(14 17 25 / 0.92)" }}
              >
                {toast}
              </div>
            ) : null}
          </div>
          </ViewportFrame>
        </div>
      </div>

      {/* Runtime trace: collision detected → event fired → handlers executed. */}
      <div className="shrink-0 border-t border-line bg-panel">
        <button
          type="button"
          onClick={() => setTraceOpen((open) => !open)}
          aria-expanded={traceOpen}
          className="flex h-8 w-full items-center gap-2 px-4 text-left font-mono text-[10.5px] uppercase tracking-[0.14em] text-mist transition-colors hover:text-fog focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <span aria-hidden>{traceOpen ? "▾" : "▸"}</span> {t("builder.runtimeTrace")}
          <span className="rounded-full border border-line px-1.5 text-[10px] text-mist">{trace.length}</span>
          <span className="ml-auto font-sans text-[10.5px] normal-case tracking-normal text-mist">
            collisions & handler dispatch, live
          </span>
        </button>
        {traceOpen ? (
          <div className="max-h-32 overflow-y-auto border-t border-line bg-canvas px-4 py-2 font-mono text-[11px] leading-5 text-fog">
            {trace.length === 0 ? (
              <p className="text-mist">{t("builder.noEvents")}</p>
            ) : (
              trace.map((line, index) => (
                <p key={`${index}-${line}`} className={line.startsWith("collision") ? "text-mint" : undefined}>
                  {line}
                </p>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
