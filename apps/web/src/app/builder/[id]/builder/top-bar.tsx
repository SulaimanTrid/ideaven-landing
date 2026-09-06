"use client";

import Link from "next/link";
import { Logo } from "@ideaven/ui";
import { useBuilder } from "./builder-context";
import { PublishButton } from "./publish-button";
import { ExportButton } from "./export-button";
import { IconHistory, IconImage, IconSparkle } from "@/components/visuals/icons";
import { projectTypeLabel } from "@/lib/project-meta";

/**
 * Builder top bar: identity (back, logo, project, type), the Design/Blocks/
 * Code mode switcher (all three operate on the same Project Model), and
 * history + save controls.
 */
export function BuilderTopBar({
  aiOpen,
  onToggleAI,
  assetsOpen,
  onToggleAssets,
  historyOpen,
  onToggleHistory,
}: {
  aiOpen: boolean;
  onToggleAI: () => void;
  assetsOpen: boolean;
  onToggleAssets: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  const { project, saveState, lastSavedError, actions, saveNow, mode, setMode } = useBuilder();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-line bg-panel px-3 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
      {/* Left: identity */}
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard/projects"
          aria-label="Back to projects"
          title="Back to projects"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 5.5 8 12l6.5 6.5" />
          </svg>
        </Link>
        <Logo />
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="truncate text-sm font-semibold">{project.name}</span>
          <span className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-mist">
            {projectTypeLabel(project.type)}
          </span>
        </div>
      </div>

      {/* Center: modes */}
      <nav aria-label="Editor modes" className="flex items-center rounded-lg border border-line bg-canvas p-1">
        {(["design", "blocks", "code", "preview", "insights"] as const).map((m) => {
          const label =
            m === "design"
              ? "Design"
              : m === "blocks"
                ? "Blocks"
                : m === "code"
                  ? "Code"
                  : m === "preview"
                    ? "Preview"
                    : "Insights";
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                active ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Right: Ask AI + history + save */}
      <div className="flex shrink-0 items-center gap-1.5">
        <PublishButton />
        <ExportButton />
        <button
          type="button"
          onClick={onToggleAssets}
          aria-pressed={assetsOpen}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-mint/40 bg-mint/10 px-3 text-[13px] font-medium text-mint transition-colors hover:bg-mint/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconImage size={14} />
          <span className="hidden sm:inline">Assets</span>
        </button>
        <button
          type="button"
          onClick={onToggleHistory}
          aria-pressed={historyOpen}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fog transition-colors hover:bg-surface-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconHistory size={14} />
          <span className="hidden sm:inline">History</span>
        </button>
        <button
          type="button"
          onClick={onToggleAI}
          aria-pressed={aiOpen}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-violet/40 bg-violet/10 px-3 text-[13px] font-medium text-violet transition-colors hover:bg-violet/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconSparkle size={14} />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
        <IconButton
          label="Undo"
          disabled={!actions.canUndo}
          onClick={actions.undo}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14.5 4.5 10 9 5.5" />
            <path d="M4.5 10H15a4.5 4.5 0 0 1 0 9h-4" />
          </svg>
        </IconButton>
        <IconButton
          label="Redo"
          disabled={!actions.canRedo}
          onClick={actions.redo}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 14.5 4.5-4.5L15 5.5" />
            <path d="M19.5 10H9a4.5 4.5 0 0 0 0 9h4" />
          </svg>
        </IconButton>

        <SaveStatus
          state={saveState}
          error={lastSavedError}
          onSave={() => void saveNow()}
        />
      </div>
    </header>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SaveStatus({
  state,
  error,
  onSave,
}: {
  state: "saved" | "dirty" | "saving" | "error";
  error: string | null;
  onSave: () => void;
}) {
  if (state === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-[12px] text-rose md:inline" role="status">
          {error ?? "Save failed"}
        </span>
        <button
          type="button"
          onClick={onSave}
          className="h-9 rounded-lg border border-rose/40 px-3 text-[13px] font-medium text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          Retry save
        </button>
      </div>
    );
  }

  const label =
    state === "saving"
      ? "Saving…"
      : state === "dirty"
        ? "Unsaved changes"
        : "Saved";

  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        className={`hidden text-[12px] md:inline ${
          state === "dirty" ? "text-amber" : "text-mist"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={state !== "dirty"}
        className="h-9 rounded-lg bg-violet-deep px-3.5 text-[13px] font-medium text-white shadow-[0_10px_30px_-10px] shadow-violet/50 transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:pointer-events-none disabled:opacity-40 md:disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}
