"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { ButtonLink } from "@ideaven/ui";
import { BuilderTopBar } from "./top-bar";
import { BuilderCanvas } from "./canvas";
import { Palette } from "./palette";
import { ScreensPanel } from "./screens-panel";
import { ComponentTree } from "./tree";
import { Inspector } from "./inspector";
import { BlocksMode } from "./blocks-mode";
import { BlocksSidePanel, BlockPalette } from "./blocks-side";
import { CodeMode } from "./code-mode";
import { PreviewMode } from "./preview-mode";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { InsightsMode } from "./insights-mode";
import { AskAIPanel } from "./ask-ai-panel";
import { AssetsPanel } from "./assets-panel";
import { HistoryPanel } from "./history-panel";
import type { SyncDiagnostic } from "@/lib/project-model/code-sync";
import {
  BuilderContext,
  type BuilderContextValue,
  type BuilderMode,
  type DragPayload,
  type DropIndicator,
  type DropSpot,
  type SaveState,
} from "./builder-context";
import { useHistory } from "@/lib/project-model/use-history";
import {
  addScreen,
  applyCodeSync,
  deleteScreen,
  duplicateComponent,
  genId,
  insertComponent,
  locateComponent,
  moveComponent,
  newComponent,
  removeComponent,
  renameScreen,
  setScreenCode,
  setStartScreen,
  updateComponent,
  updateScreenStyles,
} from "@/lib/project-model/ops";
import {
  addHandler,
  addStatement,
  addVariable,
  moveStatement,
  removeBlock,
  removeHandler,
  removeVariable,
  setBlockInput,
  setSlot,
} from "@/lib/project-model/blocks";
import { projectApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import type { ProjectModel, ProjectModelBlock } from "@/types/project";
import type { PropsPatch } from "@/lib/project-model/ops";

/**
 * The Ideaven Builder. Owns the canonical model in memory (with snapshot
 * undo/redo), persists through PUT /api/projects/{id}/model with debounced
 * autosave, and renders the Design-mode workspace. All surfaces — canvas,
 * tree, palette, inspector — mutate the same model through one commit path.
 */
export function Builder({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState<{ model: ProjectModel; meta: Meta } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Opening a project is a real API action: it records last_opened_at and
  // returns the canonical model this session edits.
  useEffect(() => {
    let cancelled = false;
    projectApi
      .open(projectId)
      .then(({ project }) => {
        if (cancelled) return;
        setLoaded({
          model: project.model,
          meta: {
            name: project.name,
            slug: project.slug,
            type: project.type,
            status: project.status,
            visibility: project.visibility,
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("That project does not exist or is not yours.");
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Could not open the project. Check your connection and try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loadError) {
    return (
      <BuilderMessage
        title="The builder could not be opened."
        body={loadError}
      />
    );
  }
  if (!loaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <p className="font-mono text-xs tracking-[0.14em] text-mist uppercase">Opening builder…</p>
      </div>
    );
  }
  return <BuilderSession projectId={projectId} initialModel={loaded.model} initialMeta={loaded.meta} />;
}

interface Meta {
  name: string;
  slug: string;
  type: string;
  status: string;
  visibility: string;
}

function BuilderSession({
  projectId,
  initialModel,
  initialMeta,
}: {
  projectId: string;
  initialModel: ProjectModel;
  initialMeta: Meta;
}) {
  const history = useHistory<ProjectModel>(initialModel);
  const model = history.state;

  const [meta, setMeta] = useState<Meta>(initialMeta);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeScreenId, setActiveScreenId] = useState(
    initialModel.navigation.startScreenId || initialModel.screens[0]?.id || "",
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedError, setLastSavedError] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [mode, setMode] = useState<BuilderMode>("design");
  const [selectedHandlerId, setSelectedHandlerId] = useState<string | null>(null);
  const [codeDiagnostics, setCodeDiagnostics] = useState<SyncDiagnostic[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  // A prompt seeded from elsewhere in the builder (Auto-Fix): Ask AI runs it
  // once on open, then the seed is released.
  const [aiSeed, setAiSeed] = useState<string | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const draggingRef = useRef<DragPayload | null>(null);
  const lastSavedRef = useRef<ProjectModel>(initialModel);
  // Labels the NEXT save's server snapshot as an applied AI changeset, so
  // History can point at the state right before an AI change. Set when an
  // AI changeset is applied, cleared once consumed by a save.
  const pendingOriginRef = useRef<"ai" | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const activeScreenIdRef = useRef(activeScreenId);
  activeScreenIdRef.current = activeScreenId;

  // ---- save path ---------------------------------------------------------------

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (modelRef.current === lastSavedRef.current) {
      setSaveState("saved");
      return;
    }
    setSaveState("saving");
    const origin = pendingOriginRef.current;
    try {
      const { project } = await projectApi.updateModel(projectId, modelRef.current, origin ?? undefined);
      pendingOriginRef.current = null;
      lastSavedRef.current = modelRef.current;
      setSaveState("saved");
      setLastSavedError(null);
      setMeta((current) => ({ ...current, status: project.status, visibility: project.visibility }));
    } catch (err) {
      setSaveState("error");
      setLastSavedError(
        err instanceof ApiError ? err.message : "Could not save. Check your connection and try again.",
      );
    }
  }, [projectId]);

  // Dirty detection: any committed model change different from the last save
  // schedules a debounced autosave.
  useEffect(() => {
    if (model === lastSavedRef.current) return;
    setSaveState("dirty");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow();
    }, 1500);
  }, [model, saveNow]);

  // Warn before leaving with unsaved work; flush when the tab is hidden.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (modelRef.current !== lastSavedRef.current) event.preventDefault();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && modelRef.current !== lastSavedRef.current) {
        void saveNow();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [saveNow]);

  // ---- commit path ---------------------------------------------------------------

  /** Apply a pure model operation as one undoable change. */
  const commit = useCallback(
    (next: ProjectModel) => {
      if (next !== modelRef.current) history.commit(next);
    },
    [history],
  );

  const applyInsertNew = useCallback(
    (componentType: string, spot: DropSpot) => {
      const node = newComponent(componentType);
      if (!node) return;
      const next = insertComponent(modelRef.current, spot.screenId, spot.parentId, spot.index, node);
      commit(next);
      setSelectedId(node.id);
    },
    [commit],
  );

  const applyMoveTo = useCallback(
    (componentId: string, spot: DropSpot) => {
      commit(moveComponent(modelRef.current, componentId, spot.screenId, spot.parentId, spot.index));
      setSelectedId(componentId);
    },
    [commit],
  );

  const applyRemove = useCallback(
    (componentId: string) => {
      commit(removeComponent(modelRef.current, componentId));
      setSelectedId(null);
    },
    [commit],
  );

  const applyDuplicate = useCallback(
    (componentId: string) => {
      const next = duplicateComponent(modelRef.current, componentId);
      if (next === modelRef.current) return;
      commit(next);
      // Select the fresh copy: the sibling right after the original.
      const location = locateComponent(next, componentId);
      if (location) {
        const siblings = location.parent ? location.parent.children! : location.screen.components;
        const copy = siblings[location.index + 1];
        if (copy) setSelectedId(copy.id);
      }
    },
    [commit],
  );

  const applyReorder = useCallback(
    (componentId: string, direction: -1 | 1) => {
      const location = locateComponent(modelRef.current, componentId);
      if (!location) return;
      const siblings = location.parent ? location.parent.children! : location.screen.components;
      const target = location.index + direction;
      if (target < 0 || target >= siblings.length) return;
      commit(moveComponent(modelRef.current, componentId, location.screen.id, location.parent?.id ?? null, target));
    },
    [commit],
  );

  // ---- keyboard: undo/redo, delete, escape --------------------------------------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === "z" && !event.shiftKey) {
          if (inField) return;
          event.preventDefault();
          history.undo();
          setSelectedId(null);
          return;
        }
        if ((key === "z" && event.shiftKey) || key === "y") {
          if (inField) return;
          event.preventDefault();
          history.redo();
          setSelectedId(null);
          return;
        }
        return;
      }
      if (!inField && (event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        applyRemove(selectedId);
        return;
      }
      if (!inField && event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, selectedId, applyRemove]);

  // ---- actions -------------------------------------------------------------------

  const actions: BuilderContextValue["actions"] = useMemo(
    () => ({
      insertNew: applyInsertNew,
      moveTo: applyMoveTo,
      updateProps: (id, patch) => commit(updateComponent(modelRef.current, id, { props: patch })),
      updateStyles: (id, patch) => commit(updateComponent(modelRef.current, id, { styles: patch })),
      removeComponent: applyRemove,
      duplicateComponent: applyDuplicate,
      reorder: applyReorder,
      selectScreen: (screenId) => {
        setActiveScreenId(screenId);
        setSelectedId(null);
        setSelectedHandlerId(null);
      },
      addScreen: (name) => {
        const next = addScreen(modelRef.current, name);
        commit(next);
        setActiveScreenId(next.screens[next.screens.length - 1]?.id ?? "");
        setSelectedId(null);
      },
      renameScreen: (screenId, name) => commit(renameScreen(modelRef.current, screenId, name)),
      deleteScreen: (screenId) => {
        const next = deleteScreen(modelRef.current, screenId);
        if (next === modelRef.current) return;
        commit(next);
        setActiveScreenId((current) =>
          current === screenId ? next.screens[0]?.id ?? "" : current,
        );
        setSelectedId(null);
      },
      setStartScreen: (screenId) => commit(setStartScreen(modelRef.current, screenId)),
      updateScreenStyles: (screenId, patch: PropsPatch) =>
        commit(updateScreenStyles(modelRef.current, screenId, patch)),
      // Code ↔ model sync.
      applyCodeSync: (screenId, handlers) => {
        const next = applyCodeSync(modelRef.current, screenId, handlers);
        commit(next);
        setSelectedHandlerId(null);
      },
      setScreenCode: (screenId, code) => commit(setScreenCode(modelRef.current, screenId, code)),
      // Blocks engine.
      addHandler: (componentId, event) => {
        const id = genId("h");
        commit(addHandler(modelRef.current, activeScreenIdRef.current, componentId, event, id));
        return id;
      },
      removeHandler: (handlerId) => {
        commit(removeHandler(modelRef.current, activeScreenIdRef.current, handlerId));
        setSelectedHandlerId((current) => (current === handlerId ? null : current));
      },
      addStatement: (handlerId, parentId, index, block: ProjectModelBlock, branch: "then" | "else" = "then") => {
        commit(addStatement(modelRef.current, activeScreenIdRef.current, handlerId, parentId, index, block, branch));
      },
      removeBlock: (handlerId, blockId) => {
        commit(removeBlock(modelRef.current, activeScreenIdRef.current, handlerId, blockId));
      },
      moveStatement: (handlerId, blockId, direction) => {
        commit(moveStatement(modelRef.current, activeScreenIdRef.current, handlerId, blockId, direction));
      },
      setSlot: (handlerId, blockId, slotKey, expr) => {
        commit(setSlot(modelRef.current, activeScreenIdRef.current, handlerId, blockId, slotKey, expr));
      },
      setBlockInput: (handlerId, blockId, key, value) => {
        commit(setBlockInput(modelRef.current, activeScreenIdRef.current, handlerId, blockId, key, value));
      },
      addVariable: (name, type) => commit(addVariable(modelRef.current, name, type)),
      removeVariable: (id) => commit(removeVariable(modelRef.current, id)),
      undo: () => {
        history.undo();
        setSelectedId(null);
      },
      redo: () => {
        history.redo();
        setSelectedId(null);
      },
      get canUndo() {
        return history.canUndo;
      },
      get canRedo() {
        return history.canRedo;
      },
    }),
    [applyInsertNew, applyMoveTo, applyRemove, applyDuplicate, applyReorder, commit, history],
  );

  const contextValue: BuilderContextValue = useMemo(
    () => ({
      project: {
        id: projectId,
        name: meta.name,
        slug: meta.slug,
        type: model.type,
        status: meta.status,
        visibility: meta.visibility,
      },
      model,
      selectedId,
      activeScreenId: model.screens.some((screen) => screen.id === activeScreenId)
        ? activeScreenId
        : model.navigation.startScreenId || model.screens[0]?.id || "",
      saveState,
      lastSavedError,
      mode,
      selectedHandlerId,
      draggingRef,
      indicator,
      select: setSelectedId,
      setActiveScreen: (screenId) => {
        setActiveScreenId(screenId);
        setSelectedId(null);
        setSelectedHandlerId(null);
      },
      setMode,
      selectHandler: (id) => {
        setSelectedHandlerId(id);
      },
      codeDiagnostics,
      setCodeDiagnostics,
      setIndicator,
      commitModel: (next, options) => {
        commit(next);
        if (options?.origin === "ai") pendingOriginRef.current = "ai";
        setSelectedId(null);
        setSelectedHandlerId(null);
      },
      applyDrop: () => {
        const payload = draggingRef.current;
        if (!indicator || !payload) {
          setIndicator(null);
          draggingRef.current = null;
          return;
        }
        const spot: DropSpot = {
          screenId: indicator.screenId,
          parentId: indicator.parentId,
          index: indicator.index,
        };
        if (payload.kind === "new") applyInsertNew(payload.componentType, spot);
        else applyMoveTo(payload.componentId, spot);
        setIndicator(null);
        draggingRef.current = null;
      },
      saveNow,
      actions,
    }),
    [projectId, meta, model, selectedId, activeScreenId, saveState, lastSavedError, mode, selectedHandlerId, codeDiagnostics, indicator, applyInsertNew, applyMoveTo, saveNow, actions],
  );

  return (
    <BuilderContext.Provider value={contextValue}>
      <CommandPalette />
      <div className="flex h-dvh flex-col bg-canvas">
        <BuilderTopBar
          aiOpen={aiOpen}
          onToggleAI={() => setAiOpen((v) => !v)}
          assetsOpen={assetsOpen}
          onToggleAssets={() => setAssetsOpen((v) => !v)}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
          {/* Left rail: screens + mode-specific panel */}
          {mode !== "preview" ? (
            <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
              <div className="max-h-[40%] overflow-y-auto">
                <ScreensPanel />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {mode === "design" ? <Palette /> : <BlocksSidePanel />}
              </div>
            </aside>
          ) : null}

          {/* Center: mode surface */}
          {mode === "design" ? (
            <BuilderCanvas />
          ) : mode === "blocks" ? (
            <BlocksMode />
          ) : mode === "preview" ? (
            <PreviewMode />
          ) : mode === "insights" ? (
            <InsightsMode />
          ) : (
            <CodeMode />
          )}

          {/* Right rail: design tools / blocks palette */}
          {mode === "design" ? (
            <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-panel lg:flex">
              <div className="flex max-h-[45%] flex-col border-b border-line">
                <div className="p-3 pb-1">
                  <h3 className="px-1 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">Layers</h3>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ComponentTree />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="p-3 pb-1">
                  <h3 className="px-1 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
                    Inspector
                  </h3>
                </div>
                <Inspector />
                <div className="h-6" />
              </div>
            </aside>
          ) : mode === "blocks" ? (
            <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-panel lg:flex">
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="p-3 pb-1">
                  <h3 className="px-1 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
                    Blocks
                  </h3>
                </div>
                <BlockPalette />
                <div className="h-6" />
              </div>
            </aside>
          ) : null}
          </div>

          {/* Bottom: diagnostics (errors / warnings / info) */}
          <DiagnosticsPanel
            onRequestAIFix={(prompt) => {
              setAiSeed(prompt);
              setAiOpen(true);
            }}
          />
        </div>

        {/* Ask AI slide-over */}
        {aiOpen ? (
          <AskAIPanel
            onClose={() => setAiOpen(false)}
            seedPrompt={aiSeed}
            onSeedConsumed={() => setAiSeed(null)}
          />
        ) : null}
        {assetsOpen ? <AssetsPanel onClose={() => setAssetsOpen(false)} /> : null}
        {historyOpen ? <HistoryPanel onClose={() => setHistoryOpen(false)} /> : null}
      </div>
    </BuilderContext.Provider>
  );
}

function BuilderMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium">{title}</p>
      <p className="max-w-md text-fog">{body}</p>
      <ButtonLink href="/dashboard/projects" variant="secondary">
        Back to Projects
      </ButtonLink>
    </div>
  );
}
