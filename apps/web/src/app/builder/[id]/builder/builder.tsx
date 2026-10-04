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
import { BlocksWorkspace } from "./blocks-mode";
import { BlocksSidePanel } from "./blocks-side";
import { CodeMode } from "./code-mode";
import { PreviewMode } from "./preview-mode";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { InsightsMode } from "./insights-mode";
import { AskAIPanel } from "./ask-ai-panel";
import { AssetsPanel } from "./assets-panel";
import { HistoryPanel } from "./history-panel";
import {
  CreditPurchaseModal,
} from "@/components/credits/credit-purchase-modal";
import type { InsufficientCreditsData } from "@/lib/api";
import type { SyncDiagnostic } from "@/lib/project-model/code-sync";
import {
  BuilderContext,
  useBuilder,
  type BuilderContextValue,
  type BuilderMode,
  type DragPayload,
  type DropIndicator,
  type DropSpot,
  type SaveState,
} from "./builder-context";
import { useHistory } from "@/lib/project-model/use-history";
import { entityVisible, sortedRenderOrder } from "@/lib/project-model/scene";
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
  updateInputActions,
  updatePreviewSettings,
  updateScreenStyles,
  updateSortingLayers,
  setParent3D,
  duplicateHierarchy3D,
  removeComponent3D,
  duplicateHierarchy3DMany,
  removeComponent3DMany,
  duplicateScreen,
  moveScreen,
  updateComponentsPropsMany,
  removeComponentsMany,
  duplicateComponentsMany,
} from "@/lib/project-model/ops";
import {
  addHandler,
  addStatement,
  addVariable,
  attachParked,
  duplicateAttached,
  duplicateParked,
  moveParked,
  moveRun,
  moveStatement,
  parkRun,
  removeBlock,
  removeHandler,
  removeParked,
  removeVariable,
  setBlockInput,
  setScriptPosition,
  setSlot,
} from "@/lib/project-model/blocks";
import type { StackTarget } from "@/lib/project-model/blocks";
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
  // TASK 62 §32: game projects get the flat GameObject list in the left rail.
  const isGameProject = model.type === "game";
  // TASK 63 §24/§26/§27: editor UI state (never the project model) — mode
  // shortcuts, desktop panel collapse, and small-width panel drawers.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [paletteDrawer, setPaletteDrawer] = useState(false);
  const [inspectorDrawer, setInspectorDrawer] = useState(false);

  // Alt+1..5 switches modes (Design/Blocks/Code/Preview/Insights). Guarded:
  // never fires while typing in a field, and plain W/A/S/D/E/R/Space stay
  // untouched for gameplay/tools.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable === true;
      if (inField) return;
      const order: BuilderMode[] = ["design", "blocks", "code", "preview", "insights"];
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < order.length) {
        event.preventDefault();
        setMode(order[index]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // §27: only ONE major drawer occupies the screen at a time.
  const openPaletteDrawer = () => {
    setPaletteDrawer(true);
    setInspectorDrawer(false);
    setAssetsOpen(false);
    setHistoryOpen(false);
  };
  const openInspectorDrawer = () => {
    setInspectorDrawer(true);
    setPaletteDrawer(false);
    setAssetsOpen(false);
    setHistoryOpen(false);
  };
  // §36: Escape closes whichever drawer is open (focus may live on the FAB,
  // outside the drawer node — so the listener is global while one is open).
  useEffect(() => {
    if (!paletteDrawer && !inspectorDrawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPaletteDrawer(false);
      setInspectorDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteDrawer, inspectorDrawer]);

  // M5 universal search: the platform-chrome command palette dispatches
  // context jumps (screen/component/handler) through this window event.
  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<{ screenId: string; componentId?: string; handlerId?: string }>).detail;
      if (!detail) return;
      setActiveScreenId(detail.screenId);
      if (detail.handlerId) {
        setMode("blocks");
        setSelectedHandlerId(detail.handlerId);
        setSelectedId(null);
      } else if (detail.componentId) {
        setMode("design");
        setSelectedId(detail.componentId);
        setSelectedHandlerId(null);
      } else {
        setMode("design");
      }
    };
    window.addEventListener("ideaven:palette-jump", onJump);
    return () => window.removeEventListener("ideaven:palette-jump", onJump);
  }, []);
  const [selectedHandlerId, setSelectedHandlerId] = useState<string | null>(null);
  const [codeDiagnostics, setCodeDiagnostics] = useState<SyncDiagnostic[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  // A prompt seeded from elsewhere in the builder (Auto-Fix): Ask AI runs it
  // once on open, then the seed is released.
  const [aiSeed, setAiSeed] = useState<string | null>(null);
  // Task 12: the contextual credit purchase modal. It opens automatically
  // when the server blocks an AI action with a structured 402, or directly
  // from the top bar when the balance is empty, or after a hosted-checkout
  // return (?purchase=…) to resume the verified result.
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseInfo, setPurchaseInfo] = useState<InsufficientCreditsData | null>(null);
  const [purchaseResumeId, setPurchaseResumeId] = useState<string | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Hosted-checkout return: the provider sends the user back with the
  // purchase id; the modal polls the server-verified status from there. The
  // query is stripped so a refresh never replays the resume.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseId = params.get("purchase");
    if (!purchaseId) return;
    params.delete("purchase");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}`,
    );
    setPurchaseResumeId(purchaseId);
    setPurchaseOpen(true);
  }, []);

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
      // TASK 62 §27: z-order shortcuts through the SAME moveComponent op —
      // no parallel z-index system. moveComponent removes first, so "back"
      // targets siblings.length (the removal shifts the final slot by one).
      reorderTo: (componentId, position) => {
        const location = locateComponent(modelRef.current, componentId);
        if (!location) return;
        const siblings = location.parent ? location.parent.children! : location.screen.components;
        const index =
          position === "front" ? 0 : position === "back" ? siblings.length : location.index + (position === "forward" ? -1 : 1);
        if (index < 0 || index === location.index) return;
        commit(moveComponent(modelRef.current, componentId, location.screen.id, location.parent?.id ?? null, index));
      },
      // TASK 62 §25/§26: multi-select group ops — ONE commit each.
      updateComponentsPropsMany: (patches) => commit(updateComponentsPropsMany(modelRef.current, patches)),
      removeComponentsMany: (ids) => {
        const next = removeComponentsMany(modelRef.current, ids);
        if (next === modelRef.current) return;
        commit(next);
        setSelectedId(null);
      },
      duplicateComponentsMany: (ids) => {
        const next = duplicateComponentsMany(modelRef.current, ids);
        if (next === modelRef.current) return;
        commit(next);
      },
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
      // TASK 62 §5: scene duplicate + reorder (the copy becomes active).
      duplicateScreen: (screenId) => {
        const before = modelRef.current.screens.findIndex((s) => s.id === screenId);
        const next = duplicateScreen(modelRef.current, screenId);
        if (next === modelRef.current) return;
        commit(next);
        setActiveScreenId(next.screens[before + 1]?.id ?? "");
      },
      moveScreen: (screenId, direction) => commit(moveScreen(modelRef.current, screenId, direction)),
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
      updatePreviewSettings: (patch) =>
        commit(updatePreviewSettings(modelRef.current, patch)),
      updateSortingLayers: (screenId, layers, previousLayers) =>
        commit(updateSortingLayers(modelRef.current, screenId, layers, previousLayers)),
      updateInputActions: (screenId, actions) =>
        commit(updateInputActions(modelRef.current, screenId, actions)),
      setParent3D: (screenId, id, parentId) =>
        commit(setParent3D(modelRef.current, screenId, id, parentId)),
      duplicateHierarchy3D: (screenId, id) =>
        commit(duplicateHierarchy3D(modelRef.current, screenId, id)),
      removeComponent3D: (screenId, id) =>
        commit(removeComponent3D(modelRef.current, screenId, id)),
      // TASK 60 §20: the whole multi-selection is ONE pure op — one commit,
      // one undo step; rapid per-entity commits would overwrite each other
      // because each reads the same pre-render model snapshot.
      duplicateHierarchy3DMany: (screenId, ids) =>
        commit(duplicateHierarchy3DMany(modelRef.current, screenId, ids)),
      removeComponent3DMany: (screenId, ids) =>
        commit(removeComponent3DMany(modelRef.current, screenId, ids)),
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
      // Blocks canvas — free movement, one undoable commit per call.
      moveRunTo: (sourceHandlerId, blockId, target: StackTarget) => {
        commit(moveRun(modelRef.current, activeScreenIdRef.current, sourceHandlerId, blockId, target));
      },
      parkStatement: (sourceHandlerId, blockId, x, y) => {
        commit(parkRun(modelRef.current, activeScreenIdRef.current, sourceHandlerId, blockId, x, y));
      },
      attachParkedRun: (leadBlockId, target: StackTarget) => {
        commit(attachParked(modelRef.current, activeScreenIdRef.current, leadBlockId, target));
      },
      moveParkedRun: (leadBlockId, x, y) => {
        commit(moveParked(modelRef.current, activeScreenIdRef.current, leadBlockId, x, y));
      },
      removeParkedRun: (leadBlockId) => {
        commit(removeParked(modelRef.current, activeScreenIdRef.current, leadBlockId));
      },
      duplicateStatementBlock: (handlerId, blockId) => {
        commit(duplicateAttached(modelRef.current, activeScreenIdRef.current, handlerId, blockId));
      },
      duplicateParkedRun: (leadBlockId) => {
        commit(duplicateParked(modelRef.current, activeScreenIdRef.current, leadBlockId));
      },
      moveScript: (handlerId, x, y) => {
        commit(setScriptPosition(modelRef.current, activeScreenIdRef.current, handlerId, x, y));
      },
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
        if (options?.origin === "ai") {
          pendingOriginRef.current = "ai";
          // An AI changeset can rewrite whole screens — stale selections go.
          setSelectedId(null);
          setSelectedHandlerId(null);
          return;
        }
        setSelectedId(null);
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
          onOpenPurchase={() => {
            setPurchaseInfo(null);
            setPurchaseResumeId(null);
            setPurchaseOpen(true);
          }}
          assetsOpen={assetsOpen}
          onToggleAssets={() => setAssetsOpen((v) => !v)}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
          {/* Left rail: screens + mode-specific panel. TASK 63 §26: desktop
              collapse keeps a compact rail with a recovery button; §27 the
              rail content is also openable as a drawer below md. */}
          {mode !== "preview" ? (
            leftCollapsed ? (
              <div className="hidden shrink-0 flex-col items-center gap-2 border-r border-line bg-panel py-2 md:flex">
                <button
                  type="button"
                  data-toggle-left-panel="true"
                  aria-expanded={false}
                  aria-controls="workspace-left-panel"
                  aria-label="Expand left panel"
                  title="Expand left panel"
                  onClick={() => setLeftCollapsed(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
                >
                  »
                </button>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-mist [writing-mode:vertical-rl]">
                  Panels
                </span>
              </div>
            ) : (
            <aside id="workspace-left-panel" className="relative hidden w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
              <button
                type="button"
                data-toggle-left-panel="true"
                aria-expanded={true}
                aria-controls="workspace-left-panel"
                aria-label="Collapse left panel"
                title="Collapse left panel"
                onClick={() => setLeftCollapsed(true)}
                className="absolute right-1 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
              >
                «
              </button>
              <div className="max-h-[40%] overflow-y-auto">
                <ScreensPanel />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                {mode === "design" ? (
                  isGameProject ? (
                    <>
                      {/* TASK 62 §32: the object list AND the canonical
                          palette (insertion) share the rail. */}
                      <GameObjectsPanel />
                      <Palette />
                    </>
                  ) : (
                    <Palette />
                  )
                ) : (
                  <BlocksSidePanel />
                )}
              </div>
            </aside>
            )
          ) : null}

          {/* Center: mode surface */}
          {mode === "design" ? (
            <BuilderCanvas />
          ) : mode === "blocks" ? (
            <BlocksWorkspace />
          ) : mode === "preview" ? (
            <PreviewMode />
          ) : mode === "insights" ? (
            <InsightsMode />
          ) : (
            <CodeMode />
          )}

          {/* Right rail: design tools (Blocks mode renders its own palette rail).
              TASK 63 §26: desktop collapse with a recovery rail. */}
          {mode === "design" ? (
            rightCollapsed ? (
              <div className="hidden shrink-0 flex-col items-center gap-2 border-l border-line bg-panel py-2 lg:flex">
                <button
                  type="button"
                  data-toggle-right-panel="true"
                  aria-expanded={false}
                  aria-controls="workspace-right-panel"
                  aria-label="Expand inspector panel"
                  title="Expand inspector panel"
                  onClick={() => setRightCollapsed(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
                >
                  «
                </button>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-mist [writing-mode:vertical-rl]">
                  Inspector
                </span>
              </div>
            ) : (
            <aside id="workspace-right-panel" className="relative hidden w-72 shrink-0 flex-col border-l border-line bg-panel lg:flex">
              <button
                type="button"
                data-toggle-right-panel="true"
                aria-expanded={true}
                aria-controls="workspace-right-panel"
                aria-label="Collapse inspector panel"
                title="Collapse inspector panel"
                onClick={() => setRightCollapsed(true)}
                className="absolute right-1 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
              >
                »
              </button>
              <div className="flex max-h-[45%] flex-col border-b border-line">
                <div className="p-3 pb-1">
                  <h3 className="px-1 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">Layers</h3>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                  <ComponentTree />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                <div className="p-3 pb-1">
                  <h3 className="px-1 font-mono text-[10px] tracking-[0.16em] text-mist uppercase">
                    Inspector
                  </h3>
                </div>
                <Inspector />
                <div className="h-6" />
              </div>
            </aside>
            )
          ) : null}
          </div>

          {/* TASK 63 §27: mobile/tablet drawer FABs — the side panels stay
              reachable below md/lg as sheets; one drawer at a time. */}
          {mode !== "preview" ? (
            <div className="fixed bottom-16 right-3 z-40 flex flex-col gap-2 md:hidden">
              <button
                type="button"
                data-open-palette-drawer="true"
                aria-expanded={paletteDrawer}
                aria-label="Open palette panel"
                title="Open palette panel"
                onClick={openPaletteDrawer}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-panel text-ink shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                ▦
              </button>
            </div>
          ) : null}
          {mode === "design" ? (
            <div className="fixed bottom-28 right-3 z-40 flex flex-col gap-2 lg:hidden">
              <button
                type="button"
                data-open-inspector-drawer="true"
                aria-expanded={inspectorDrawer}
                aria-label="Open inspector panel"
                title="Open inspector panel"
                onClick={openInspectorDrawer}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-panel text-ink shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                ⚙
              </button>
            </div>
          ) : null}

          {/* TASK 63 §27: the palette drawer (below md). */}
          {paletteDrawer ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Palette panel"
              data-drawer="palette"
              className="fixed inset-0 z-[80] flex justify-end bg-black/60 md:hidden"
              onClick={(event) => {
                if (event.target === event.currentTarget) setPaletteDrawer(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setPaletteDrawer(false);
              }}
            >
              <div className="flex h-full w-72 max-w-[85vw] flex-col border-l border-line bg-panel shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]">
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Panels</h2>
                  <button
                    type="button"
                    aria-label="Close palette drawer"
                    title="Close"
                    onClick={() => setPaletteDrawer(false)}
                    className="flex h-7 w-7 items-center justify-center rounded text-mist hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
                  >
                    ✕
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                  <ScreensPanel />
                  {isGameProject ? <GameObjectsPanel /> : null}
                  <Palette />
                </div>
              </div>
            </div>
          ) : null}

          {/* TASK 63 §27: the inspector drawer (below lg, design mode). */}
          {inspectorDrawer ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Inspector panel"
              data-drawer="inspector"
              className="fixed inset-0 z-[80] flex justify-end bg-black/60 lg:hidden"
              onClick={(event) => {
                if (event.target === event.currentTarget) setInspectorDrawer(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setInspectorDrawer(false);
              }}
            >
              <div className="flex h-full w-80 max-w-[88vw] flex-col border-l border-line bg-panel shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]">
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Inspector</h2>
                  <button
                    type="button"
                    aria-label="Close inspector drawer"
                    title="Close"
                    onClick={() => setInspectorDrawer(false)}
                    className="flex h-7 w-7 items-center justify-center rounded text-mist hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint"
                  >
                    ✕
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                  <Inspector />
                </div>
              </div>
            </div>
          ) : null}

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
            onInsufficientCredits={(info) => {
              setPurchaseInfo(info);
              setPurchaseResumeId(null);
              setPurchaseOpen(true);
            }}
          />
        ) : null}
        {assetsOpen ? <AssetsPanel onClose={() => setAssetsOpen(false)} /> : null}
        {historyOpen ? <HistoryPanel onClose={() => setHistoryOpen(false)} /> : null}

        {/* Contextual credit purchase modal (TASK 12) */}
        <CreditPurchaseModal
          open={purchaseOpen}
          onClose={() => setPurchaseOpen(false)}
          info={purchaseInfo}
          initialPurchaseId={purchaseResumeId}
        />
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

/**
 * TASK 62 §32: the flat GameObject list for game scenes — the canonical
 * scene model has no entity parenting, so the tree is an honest FLAT list in
 * back-to-front draw order (the same deterministic order the runtime uses).
 * Click selects (and switches scene when needed); each row duplicates or
 * deletes through the canonical ops.
 */
function GameObjectsPanel() {
  const { model, activeScreenId, selectedId, select, setActiveScreen, actions } = useBuilder();
  const screen = model.screens.find((s) => s.id === activeScreenId) ?? model.screens[0];
  const entities = useMemo(() => (screen ? [...sortedRenderOrder(screen)].reverse() : []), [screen]);
  if (!screen) return null;
  return (
    <div className="border-b border-line p-3">
      <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
        Game objects
      </h3>
      {entities.length === 0 ? (
        <p className="px-1 pb-1 text-[11.5px] leading-4 text-mist">
          Nothing in this scene yet — add a Player, Platform or Sprite.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5" data-game-objects="true">
          {entities.map((entity) => {
            const active = entity.id === selectedId;
            const label =
              typeof entity.props?.name === "string" && entity.props.name.trim() !== ""
                ? entity.props.name
                : `${entity.type}`;
            return (
              <li key={entity.id} className="group flex h-7 items-center gap-1 rounded-md px-1">
                <button
                  type="button"
                  onClick={() => {
                    if (screen.id !== activeScreenId) setActiveScreen(screen.id);
                    select(entity.id);
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint ${
                    active ? "bg-surface-strong text-ink" : "text-fog hover:bg-surface"
                  }`}
                >
                  <span className="font-mono text-[9.5px] uppercase text-mist">{entity.type}</span>{" "}
                  {label}
                  {entityVisible(entity.props) ? null : <span className="ml-1 text-mist">(hidden)</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Duplicate ${label}`}
                  title="Duplicate"
                  onClick={() => actions.duplicateComponent(entity.id)}
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint group-hover:flex"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${label}`}
                  title="Delete"
                  onClick={() => actions.removeComponent(entity.id)}
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mint group-hover:flex"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
