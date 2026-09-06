"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { imageUrl } from "@/lib/api";
import { createRuntime, screenOf, type ScreenRuntime } from "@/lib/project-model/runtime";
import { RuntimeNode } from "@/components/runtime/runtime-node";
import { useBuilder } from "./builder-context";
import type { PropsMap } from "@/types/project";

/**
 * Preview mode: executes the canonical block IR against a live rendering of
 * the screen. Buttons click, inputs type, logic runs, navigation navigates —
 * the same model Design and Blocks edit, interpreted directly (never the
 * generated code, never a simulation). Component values live in the runtime
 * instance for the current run; a Restart re-seeds them from the model.
 */

const DEVICES = [
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 834, height: 1112 },
  { id: "desktop", label: "Desktop", width: 1280, height: 800 },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

export function PreviewMode() {
  const { model } = useBuilder();
  const [device, setDevice] = useState<DeviceId>("phone");
  const [screenId, setScreenId] = useState(
    model.navigation.startScreenId || model.screens[0]?.id || "",
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [, setTick] = useState(0);
  const runtimeRef = useRef<ScreenRuntime | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  /** (Re)start the run: fresh variable + component state from the model. */
  const start = useCallback(() => {
    const startScreen = model.navigation.startScreenId || model.screens[0]?.id || "";
    runtimeRef.current = createRuntime(model, startScreen, {
      onMessage: showToast,
      onNavigate: (id) => setScreenId(id),
    });
    setScreenId(startScreen);
    setTick((t) => t + 1);
  }, [model, showToast]);

  // Start on entry and restart whenever the model changes — the preview
  // always reflects what Design and Blocks just saved to the model.
  useEffect(() => {
    start();
  }, [start]);

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
  const frame = DEVICES.find((d) => d.id === device) ?? DEVICES[0];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-1" role="group" aria-label="Device preset">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDevice(d.id)}
              aria-pressed={device === d.id}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                device === d.id ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {d.label}
            </button>
          ))}
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
          <button
            type="button"
            onClick={start}
            title="Restart the run with fresh state"
            className="h-7 rounded-md bg-violet-deep px-3 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            ⟳ Restart run
          </button>
        </div>
      </div>

      {/* Surface */}
      <div className="relative min-h-0 flex-1 overflow-auto p-8">
        <div className="mx-auto" style={{ width: frame.width }}>
          <div
            className="relative overflow-hidden rounded-[24px] border border-line bg-white text-[#0b0e16] shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)]"
            style={{ width: frame.width, height: frame.height }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: "100%",
                width: "100%",
                background:
                  typeof screen?.styles?.background === "string" ? screen.styles.background : "#ffffff",
              }}
            >
              {(screen?.components ?? []).map((child) => (
                <RuntimeNode key={child.id} node={child} runtime={runtime} emit={emit} setProps={setProps} />
              ))}
            </div>

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
        </div>
      </div>
    </div>
  );
}
