"use client";

import { createContext, useContext, type RefObject } from "react";
import type {
  ProjectModel,
  ProjectModelBlock,
  ProjectModelComponent,
  ProjectModelHandler,
} from "@/types/project";
import type { PropsPatch } from "@/lib/project-model/ops";
import type { StackTarget } from "@/lib/project-model/blocks";
import type { SyncDiagnostic } from "@/lib/project-model/code-sync";

/**
 * Shared builder state. One context keeps the canvas, tree, palette, and
 * inspector in sync without prop drilling, and every mutation flows through
 * the same commit path into model history and autosave.
 */

/** Editor modes. All four operate on the same Project Model. */
export type BuilderMode = "design" | "blocks" | "code" | "preview" | "insights";

/** Where a drag would insert: under parentId (null = screen root) at index. */
export interface DropSpot {
  screenId: string;
  parentId: string | null;
  index: number;
}

/** Visual affordance for the current drop target. */
export interface DropIndicator {
  parentId: string | null;
  screenId: string;
  index: number;
  /** Line geometry relative to the parent element (px). */
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
  /** "into" renders an inset ring on empty containers. */
  mode: "line" | "into";
}

export type DragPayload =
  | { kind: "new"; componentType: string }
  | { kind: "move"; componentId: string; screenId: string };

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface BuilderContextValue {
  project: {
    id: string;
    name: string;
    slug: string;
    type: string;
    status: string;
    visibility: string;
  };
  model: ProjectModel;
  selectedId: string | null;
  activeScreenId: string;
  saveState: SaveState;
  lastSavedError: string | null;
  mode: BuilderMode;
  selectedHandlerId: string | null;
  /** Live parse diagnostics from the Code-mode editor (empty elsewhere). */
  codeDiagnostics: SyncDiagnostic[];
  draggingRef: RefObject<DragPayload | null>;
  indicator: DropIndicator | null;
  select: (id: string | null) => void;
  setActiveScreen: (screenId: string) => void;
  setMode: (mode: BuilderMode) => void;
  selectHandler: (handlerId: string | null) => void;
  setCodeDiagnostics: (diagnostics: SyncDiagnostic[]) => void;
  setIndicator: (indicator: DropIndicator | null) => void;
  /** Applies the currently hovered drop spot (palette-new or move). */
  applyDrop: () => void;
  /**
   * Commit a whole model snapshot as one undoable step (AI changesets,
   * asset registration, restores, canvas gestures). origin:"ai" labels the
   * resulting server snapshot as an applied AI changeset.
   */
  commitModel: (next: ProjectModel, options?: { origin?: "ai" }) => void;
  saveNow: () => Promise<void>;
  actions: {
    insertNew: (componentType: string, spot: DropSpot) => void;
    moveTo: (componentId: string, spot: DropSpot) => void;
    updateProps: (componentId: string, patch: PropsPatch) => void;
    updateStyles: (componentId: string, patch: PropsPatch) => void;
    removeComponent: (componentId: string) => void;
    duplicateComponent: (componentId: string) => void;
    reorder: (componentId: string, direction: -1 | 1) => void;
    selectScreen: (screenId: string) => void;
    addScreen: (name: string) => void;
    renameScreen: (screenId: string, name: string) => void;
    deleteScreen: (screenId: string) => void;
    setStartScreen: (screenId: string) => void;
    updateScreenStyles: (screenId: string, patch: PropsPatch) => void;
    updatePreviewSettings: (patch: NonNullable<ProjectModel["settings"]["preview"]>) => void;
    // Code ↔ model sync.
    applyCodeSync: (screenId: string, handlers: ProjectModelHandler[]) => void;
    setScreenCode: (screenId: string, code: string | null) => void;
    // Blocks engine — all block mutations go through the same commit path.
    addHandler: (componentId: string | null, event: string) => string;
    removeHandler: (handlerId: string) => void;
    addStatement: (handlerId: string, parentId: string | null, index: number, block: ProjectModelBlock, branch?: "then" | "else") => void;
    removeBlock: (handlerId: string, blockId: string) => void;
    moveStatement: (handlerId: string, blockId: string, direction: -1 | 1) => void;
    setSlot: (handlerId: string, blockId: string, slotKey: string, expr: ProjectModelBlock | null) => void;
    setBlockInput: (handlerId: string, blockId: string, key: string, value: string | number | boolean) => void;
    addVariable: (name: string, type: string) => void;
    removeVariable: (id: string) => void;
    // Blocks canvas — free movement (every call is one undoable commit).
    moveRunTo: (sourceHandlerId: string, blockId: string, target: StackTarget) => void;
    parkStatement: (sourceHandlerId: string, blockId: string, x: number, y: number) => void;
    attachParkedRun: (leadBlockId: string, target: StackTarget) => void;
    moveParkedRun: (leadBlockId: string, x: number, y: number) => void;
    removeParkedRun: (leadBlockId: string) => void;
    duplicateStatementBlock: (handlerId: string, blockId: string) => void;
    duplicateParkedRun: (leadBlockId: string) => void;
    moveScript: (handlerId: string, x: number, y: number) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  };
}

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
  const context = useContext(BuilderContext);
  if (!context) throw new Error("useBuilder must be used inside the Ideaven Builder");
  return context;
}

/** Tree display label: the component's text content when it has one. */
export function componentLabel(node: ProjectModelComponent): string {
  const named = node.props?.name; // scene entities carry an explicit name
  if (typeof named === "string" && named.trim() !== "") return named.trim();
  const text = node.props?.text ?? node.props?.label;
  return typeof text === "string" && text.trim() !== "" ? text.trim() : node.type;
}
