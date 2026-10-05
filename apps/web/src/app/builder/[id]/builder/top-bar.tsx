"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/theme/theme-toggle";
import { useTheme } from "@/theme/theme-provider";
import { useI18n } from "@/lib/i18n/i18n";
import { aiApi, projectApi, type AICredits } from "@/lib/api";
import { CREDITS_UPDATED_EVENT } from "@/components/credits/credit-purchase-modal";
import { Logo } from "@ideaven/ui";
import { useBuilder } from "./builder-context";
import { PublishButton } from "./publish-button";
import { ExportButton } from "./export-button";
import { IconAppWindow, IconArrowRight, IconCube3D, IconGamepad, IconHistory, IconImage, IconSparkle } from "@/components/visuals/icons";
import { engineIdentityLabel } from "@/lib/project-meta";

/**
 * Builder top bar: identity (back, logo, engine identity + environment
 * navigator, project), the Design/Blocks/Code mode switcher (all three
 * operate on the same Project Model), and history + save controls. The
 * environment menu is a CREATION NAVIGATOR: choosing another environment
 * creates a NEW project of that type — it never mutates the current project
 * (TASK 59 §15/§16).
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
  const router = useRouter();
  const [credits, setCredits] = useState<AICredits | null>(null);
  const [envMenuOpen, setEnvMenuOpen] = useState(false);
  const [pendingEnv, setPendingEnv] = useState<"app" | "game" | "3d" | null>(null);
  const [creatingEnv, setCreatingEnv] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const envCreatingRef = useRef(false);
  // TASK 60 §24: overflow menu for secondary toolbar tools below xl.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRootRef = useRef<HTMLDivElement>(null);

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

  // TASK 59: close the environment menu / confirm dialog on Escape or
  // outside activation.
  useEffect(() => {
    if (!envMenuOpen && !pendingEnv) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingEnv && !envCreatingRef.current) setPendingEnv(null);
      else if (envMenuOpen) setEnvMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!pendingEnv) {
        const target = event.target as HTMLElement | null;
        if (target && !target.closest("[data-env-menu-root]")) setEnvMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [envMenuOpen, pendingEnv]);

  // TASK 60 §24: the overflow "more" menu closes on Escape or outside click.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && moreRootRef.current && !moreRootRef.current.contains(target)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [moreOpen]);

  // Cross-environment navigation: create a NEW project of the chosen type —
  // the current project is never mutated (TASK 59 §31). One intent = one
  // project (guarded); real error on failure.
  const createInEnvironment = async (type: "app" | "game" | "3d") => {
    if (envCreatingRef.current) return;
    envCreatingRef.current = true;
    setCreatingEnv(true);
    setEnvError(null);
    try {
      const { project: created } = await projectApi.create({
        type,
        name: `My ${type === "3d" ? "3D Game" : type === "game" ? "2D Game" : "App"}`,
      });
      router.push(`/builder/${created.id}`);
    } catch {
      envCreatingRef.current = false;
      setCreatingEnv(false);
      setEnvError("Could not create the project. Please try again.");
    }
  };

  return (
    <header data-env-menu-root className="relative flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
      {/* A11y: the tool surface has no visible page title (the breadcrumb
          carries context), so give screen readers a real page heading. */}
      <h1 className="sr-only">
        {project.name} — {engineIdentityLabel(project.type)} builder
      </h1>
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
        {/* TASK 59: engine identity — visible, subtle, per canonical type. */}
        {/* TASK 61 §18: the identity chip is part of the desktop brand zone;
            below md the 390px header drops it (the environment stays visible
            in the overflow menu and the full creation hub). */}
        <button
          type="button"
          data-engine-identity={project.type}
          onClick={() => setEnvMenuOpen((v) => !v)}
          aria-expanded={envMenuOpen}
          aria-haspopup="menu"
          title="Switch creation environment — creates a NEW project, never changes this one"
          className="hidden shrink-0 items-center gap-1.5 rounded-md border border-violet/40 bg-violet/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-violet transition-colors hover:bg-violet/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint md:flex"
        >
          {engineIdentityLabel(project.type)}
          <span aria-hidden="true" style={{ transform: envMenuOpen ? "rotate(-90deg)" : undefined }}>
            ▾
          </span>
        </button>
        {envMenuOpen ? (
          <div
            role="menu"
            aria-label="Creation environments"
            className="absolute left-3 top-12 z-50 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.7)]"
          >
            <p className="px-2 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-mist">
              Create a new project in
            </p>
            {(["app", "game", "3d"] as const).map((t) => {
              const current = project.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="menuitem"
                  disabled={current}
                  onClick={() => {
                    setEnvMenuOpen(false);
                    setPendingEnv(t);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                    current ? "text-mist" : "text-fog hover:bg-surface hover:text-ink"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {t === "app" ? <IconAppWindow size={14} /> : t === "game" ? <IconGamepad size={14} /> : <IconCube3D size={14} />}
                    {t === "app" ? "Application" : t === "game" ? "2D Game" : "3D Game"}
                  </span>
                  {current ? (
                    <span className="rounded border border-line px-1 py-px font-mono text-[9px] uppercase text-mist">
                      current
                    </span>
                  ) : (
                    <IconArrowRight size={13} className="text-mist" />
                  )}
                </button>
              );
            })}
            <p className="px-2 pb-1 pt-1.5 text-[10.5px] leading-4 text-mist">
              This never changes the current project — a new one is created.
            </p>
          </div>
        ) : null}
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          {/* TASK 63 §32: ONE compact breadcrumb — project / engine / mode —
              replacing the separate name span so the left zone never grows
              wide enough to collide with the mode strip. Non-interactive
              (pointer-events-none): it can never steal a click even at the
              tightest widths. */}
          <nav
            data-workspace-context="true"
            aria-label={`Workspace context: ${project.name}, ${engineIdentityLabel(project.type)}, ${tTop(`builder.${mode}` as Parameters<typeof tTop>[0])}`}
            className="pointer-events-none hidden min-w-0 items-center gap-1.5 text-[13px] xl:flex"
          >
            <span className="max-w-36 truncate font-semibold text-ink" title={project.name}>
              {project.name}
            </span>
            <span aria-hidden="true" className="text-mist">/</span>
            <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-mist">
              {engineIdentityLabel(project.type)}
            </span>
            <span aria-hidden="true" className="text-mist">/</span>
            <span data-workspace-mode-label="true" className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fog">
              {tTop(`builder.${mode}` as Parameters<typeof tTop>[0])}
            </span>
          </nav>
        </div>
      </div>

      {/* Center: modes — horizontally scrollable at narrow widths, never
          rendered under the brand (TASK 58: the nav owns its own overflow
          instead of the whole header sliding over the logo). TASK 63 §4/§5/§24:
          one controlled strip, consistent sizing, tooltips with the Alt+number
          shortcut, active marked by state AND an underline (never color alone). */}
      <nav
        aria-label="Editor modes"
        className="flex min-w-0 flex-1 items-center justify-start overflow-x-auto rounded-lg border border-line bg-canvas p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex items-center">
        {(["design", "blocks", "code", "preview", "insights"] as const).map((m, index) => {
          const label = tTop(`builder.${m}` as Parameters<typeof tTop>[0]);
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              data-mode-tab={m}
              onClick={() => setMode(m)}
              aria-current={active ? "page" : undefined}
              title={`${label} (Alt+${index + 1})`}
              className={`relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                active ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {label}
              {active ? (
                <span aria-hidden="true" className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-violet" />
              ) : null}
            </button>
          );
        })}
        </div>
      </nav>

      {/* Right: TASK 60 §24/§26 + TASK 61 §17–19 + TASK 63 §18 — a zoned
          toolbar sized BY ITS CONTENT (shrink-0): with justify-end a flex-1
          share smaller than the content would spill LEFTWARD over the mode
          nav (real, measured collision at 1440). The nav (flex-1, min-w-0)
          owns whatever space remains and scrolls when tight. Export, Publish,
          theme, Save and Undo/Redo are ALWAYS visible — Assets/History/
          Ask AI move into an overflow menu below 2xl. */}
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <div ref={moreRootRef} className="relative shrink-0 2xl:hidden">
          <button
            type="button"
            aria-label="More toolbar tools"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {moreOpen ? (
            <div
              role="menu"
              aria-label="More toolbar tools"
              className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.7)]"
            >
              {/* TASK 61 §18: below sm the inline theme toggle moves here —
                  the same useTheme cycle, reachable at 390px. */}
              <ThemeMenuButton onDone={() => setMoreOpen(false)} />
              <div className="my-1 border-t border-line" aria-hidden="true" />
              {(
                [
                  {
                    key: "assets",
                    icon: <IconImage size={14} />,
                    label: tTop("builder.assets"),
                    disabled: false,
                    run: () => onToggleAssets(),
                  },
                  {
                    key: "history",
                    icon: <IconHistory size={14} />,
                    label: tTop("builder.history"),
                    disabled: false,
                    run: () => onToggleHistory(),
                  },
                  {
                    key: "ai",
                    icon: <IconSparkle size={14} />,
                    label: creditsEmpty
                      ? tTop("credits.emptyShort")
                      : credits
                        ? `${credits.remaining} ${tTop("credits.creditsUnit")}`
                        : tTop("builder.askAI"),
                    disabled: false,
                    run: () => (creditsEmpty ? onOpenPurchase() : onToggleAI()),
                  },
                  {
                    key: "undo",
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 14.5 4.5 10 9 5.5" />
                        <path d="M4.5 10H15a4.5 4.5 0 0 1 0 9h-4" />
                      </svg>
                    ),
                    label: "Undo",
                    disabled: !actions.canUndo,
                    run: () => actions.undo(),
                  },
                  {
                    key: "redo",
                    icon: (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m15 14.5 4.5-4.5L15 5.5" />
                        <path d="M19.5 10H9a4.5 4.5 0 0 0 0 9h4" />
                      </svg>
                    ),
                    label: "Redo",
                    disabled: !actions.canRedo,
                    run: () => actions.redo(),
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setMoreOpen(false);
                    item.run();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:pointer-events-none disabled:opacity-40"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* TASK 60 §24/§26 + TASK 63 §18: secondary tools (Assets, History,
            Ask AI, Undo/Redo) live inline from 2xl; below that they compact
            into the overflow menu so the 1280 header never overflows. */}
        <div className="hidden shrink-0 items-center gap-1.5 2xl:flex">
          {/* TASK 61 §19: semantic groups with hairline separators —
              [utility] [credits] [history]. */}
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
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
          <button
            type="button"
            onClick={creditsEmpty ? onOpenPurchase : onToggleAI}
            aria-pressed={creditsEmpty ? undefined : aiOpen}
            aria-label={
              creditsEmpty ? tTop("credits.emptyAriaLabel") : tTop("builder.askAI")
            }
            title={creditsEmpty ? tTop("credits.emptyShort") : tTop("builder.askAI")}
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
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
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
        </div>

        {/* TASK 63 §18: Undo/Redo stay INLINE below 2xl (≥sm — at 390 the
            overflow menu carries them); tiny, critical, expected by muscle
            memory (the 2xl group above carries its own pair). */}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex 2xl:hidden">
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
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden sm:inline-flex">
            <ThemeToggle compact />
          </span>
          <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-line sm:block" />
          <PublishButton />
          <ExportButton />
          <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-line sm:block" />
          <SaveStatus
            state={saveState}
            error={lastSavedError}
            onSave={() => void saveNow()}
          />
        </div>
      </div>

      {/* TASK 59: cross-environment confirmation — creates a NEW project of
          the chosen type; the current project is never mutated. */}
      {pendingEnv ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Create a new ${pendingEnv === "app" ? "Application" : pendingEnv === "game" ? "2D Game" : "3D Game"} project`}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creatingEnv) setPendingEnv(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !creatingEnv) setPendingEnv(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]">
            <h2 className="text-[15px] font-semibold text-ink">
              Create a new {pendingEnv === "app" ? "Application" : pendingEnv === "game" ? "2D Game" : "3D Game"} project?
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-fog">
              “{project.name}” stays exactly as it is — a separate{" "}
              {pendingEnv === "app" ? "Application" : pendingEnv === "game" ? "2D Game" : "3D Game"}{" "}
              project is created and opened.
            </p>
            {envError ? (
              <p role="alert" className="mt-3 text-[13px] text-rose">
                {envError}
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingEnv(null)}
                disabled={creatingEnv}
                className="h-9 rounded-lg border border-line px-3 text-[13px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createInEnvironment(pendingEnv)}
                disabled={creatingEnv}
                className="h-9 rounded-lg bg-violet-deep px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-60"
              >
                {creatingEnv
                  ? "Creating…"
                  : `Create ${pendingEnv === "app" ? "App" : pendingEnv === "game" ? "2D Game" : "3D Game"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
}) {  return (
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
      </span>      <button
        type="button"
        onClick={onSave}
        disabled={state !== "dirty"}
        aria-label={t("builder.save")}
        title="Save — persist the current project"
        className="h-9 rounded-lg bg-violet-deep px-3 text-[13px] font-medium text-white shadow-[0_10px_30px_-10px] shadow-violet/50 transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:pointer-events-none disabled:opacity-40 md:px-3.5 md:disabled:opacity-60"
      >
        {/* TASK 61 §18: icon-only below sm — Save stays visible and distinct
            at 390px without pushing Export out of the header. */}
        <svg className="sm:hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M8 4v5h7V4M8 20v-6h8v6" />
        </svg>
        <span className="hidden sm:inline">{t("builder.save")}</span>
      </button>
    </div>
  );
}

/** TASK 61 §18: the overflow-menu theme entry — the SAME useTheme cycle the
 * inline toggle uses, so small screens keep full theme control. */
function ThemeMenuButton({ onDone }: { onDone: () => void }) {
  const { preference, setTheme } = useTheme();
  const next = preference === "light" ? "dark" : preference === "dark" ? "system" : "light";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setTheme(next);
        onDone();
      }}
      title={`Switch to ${next} theme`}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      Theme — switch to {next}
    </button>
  );
}
