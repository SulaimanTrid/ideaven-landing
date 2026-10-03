"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/theme/theme-toggle";
import { useI18n } from "@/lib/i18n/i18n";
import { aiApi, type AICredits } from "@/lib/api";
import { CREDITS_UPDATED_EVENT } from "@/components/credits/credit-purchase-modal";
import { Logo } from "@ideaven/ui";
import { useBuilder } from "./builder-context";
import { PublishButton } from "./publish-button";
import { ExportButton } from "./export-button";
import { IconHistory, IconImage, IconSparkle } from "@/components/visuals/icons";
import { projectTypeLabel } from "@/lib/project-meta";

/**
 * Builder top bar: identity (back, logo, project, type), the Design/Blocks/
 * Code mode switcher (all three operate on the same Project Model), and
 * history + save controls. The Ask AI control carries the user's current
 * credit balance subtly; when the balance is empty it stays clickable and
 * opens the contextual purchase modal instead of the panel.
 */
export function BuilderTopBar({
  aiOpen,
  onToggleAI,
  onOpenPurchase,
  assetsOpen,
  onToggleAssets,
  historyOpen,
  onToggleHistory,
}: {
  aiOpen: boolean;
  onToggleAI: () => void;
  onOpenPurchase: () => void;
  assetsOpen: boolean;
  onToggleAssets: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  const { project, saveState, lastSavedError, actions, saveNow, mode, setMode } = useBuilder();
  const { t: tTop } = useI18n();
  const [credits, setCredits] = useState<AICredits | null>(null);

  // Subtle balance (TASK 12): the AI control shows the live derived balance,
  // refreshed whenever a verified purchase lands.
  useEffect(() => {
    let alive = true;
    const load = () => {
      aiApi
        .credits()
        .then((res) => {
          if (alive) setCredits(res.credits);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(CREDITS_UPDATED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(CREDITS_UPDATED_EVENT, load);
    };
  }, []);

  const creditsEmpty = credits !== null && credits.remaining === 0;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
      {/* Left: identity — reserved space, never overlapped */}
      <div className="flex shrink-0 items-center gap-3">
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
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <span className="max-w-40 truncate text-sm font-semibold">{project.name}</span>
          <span className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-mist">
            {projectTypeLabel(project.type)}
          </span>
        </div>
      </div>

      {/* Center: modes — horizontally scrollable at narrow widths, never
          rendered under the brand (TASK 58: the nav owns its own overflow
          instead of the whole header sliding over the logo). */}
      <nav
        aria-label="Editor modes"
        className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto rounded-lg border border-line bg-canvas p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex items-center">
        {(["design", "blocks", "code", "preview", "insights"] as const).map((m) => {
          const label = tTop(`builder.${m}` as Parameters<typeof tTop>[0]);
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                active ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {label}
            </button>
          );
        })}
        </div>
      </nav>

      {/* Right: theme + Ask AI + history + save — internally scrollable and
          shrinkable at narrow widths so the brand and nav are never overlapped
          and the page never overflows */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ThemeToggle compact />
        <PublishButton />
        <ExportButton />
        <button
          type="button"
          onClick={onToggleAssets}
          aria-pressed={assetsOpen}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-mint/40 bg-mint/10 px-3 text-[13px] font-medium text-mint transition-colors hover:bg-mint/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconImage size={14} />
          <span className="hidden sm:inline">{tTop("builder.assets")}</span>
        </button>
        <button
          type="button"
          onClick={onToggleHistory}
          aria-pressed={historyOpen}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fog transition-colors hover:bg-surface-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconHistory size={14} />
          <span className="hidden sm:inline">{tTop("builder.history")}</span>
        </button>
        <button
          type="button"
          onClick={creditsEmpty ? onOpenPurchase : onToggleAI}
          aria-pressed={creditsEmpty ? undefined : aiOpen}
          aria-label={
            creditsEmpty ? tTop("credits.emptyAriaLabel") : undefined
          }
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
            creditsEmpty
              ? "border-rose/40 bg-rose/10 text-rose hover:bg-rose/20"
              : "border-violet/40 bg-violet/10 text-violet hover:bg-violet/20"
          }`}
        >
          <IconSparkle size={14} />
          <span className="hidden sm:inline">
            {creditsEmpty
              ? tTop("credits.emptyShort")
              : credits
                ? `${credits.remaining} ${tTop("credits.creditsUnit")}`
                : tTop("builder.askAI")}
          </span>
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
  const { t } = useI18n();
  if (state === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-[12px] text-rose md:inline" role="status">
          {error ?? t("common.saveFailed")}
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
      ? t("common.saving")
      : state === "dirty"
        ? t("common.unsaved")
        : t("builder.saved");

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
        {t("builder.save")}
      </button>
    </div>
  );
}
