"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRuntime, screenOf, type ScreenRuntime } from "@/lib/project-model/runtime";
import { RuntimeNode } from "@/components/runtime/runtime-node";
import type { ProjectModel, PropsMap } from "@/types/project";

/**
 * The published app (roadmap 19): executes a project's snapshotted model
 * with the same runtime Preview mode uses — a visitor interacts with the
 * real app, not a screenshot. One undo of scope versus the editor: the
 * visitor sees the phone frame and a restart, nothing else.
 */
export function LiveApp({ model }: { model: ProjectModel }) {
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

  const start = useCallback(() => {
    const startScreen = model.navigation.startScreenId || model.screens[0]?.id || "";
    runtimeRef.current = createRuntime(model, startScreen, {
      onMessage: showToast,
      onNavigate: (id) => setScreenId(id),
    });
    setScreenId(startScreen);
    setTick((t) => t + 1);
  }, [model, showToast]);

  useEffect(() => {
    start();
  }, [start]);

  const emit = useCallback((componentId: string | null, event: string) => {
    runtimeRef.current?.emit(componentId, event);
    setTick((t) => t + 1);
  }, []);

  const setProps = useCallback((componentId: string, patch: PropsMap) => {
    const props = runtimeRef.current?.getComponentProps(componentId);
    if (props) Object.assign(props, patch);
    setTick((t) => t + 1);
  }, []);

  const screen = screenOf(model, screenId) ?? model.screens[0];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-[390px] max-w-full items-center justify-between">
        <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-mist">
          {screen?.name ?? "—"}
        </span>
        <button
          type="button"
          onClick={start}
          title="Restart the run with fresh state"
          className="h-7 rounded-md bg-violet-deep px-3 text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          ⟳ Restart
        </button>
      </div>

      <div
        className="relative max-w-full overflow-hidden rounded-[24px] border border-line bg-white text-[#0b0e16] shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)]"
        style={{ width: 390, height: 844 }}
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
            <RuntimeNode key={child.id} node={child} runtime={runtimeRef.current} emit={emit} setProps={setProps} />
          ))}
        </div>

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
  );
}
