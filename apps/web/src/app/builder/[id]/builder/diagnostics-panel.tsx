"use client";

import { useMemo, useState } from "react";
import { collectModelDiagnostics } from "@/lib/project-model/diagnostics";
import { useBuilder } from "./builder-context";
import { cn } from "@ideaven/ui";
import { IconSparkle } from "@/components/visuals/icons";

/**
 * The bottom diagnostics panel (spec §30/§54): live model diagnostics plus
 * Code-mode parse diagnostics, severity counts ("No errors 🎉" when
 * healthy), and click-to-source navigation into Blocks or Code.
 *
 * Auto-Fix (§AI-recheck): "Fix with AI" sends the current errors/warnings to
 * the AI as a fix request. The proposal flows through the Ask AI panel's
 * preview/apply pipeline; the re-check is reported after applying.
 */
export function DiagnosticsPanel({ onRequestAIFix }: { onRequestAIFix?: (prompt: string) => void }) {
  const { model, setMode, selectHandler, setActiveScreen, codeDiagnostics } = useBuilder();
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");

  const modelDiags = useMemo(() => collectModelDiagnostics(model), [model]);

  const all = useMemo(() => {
    const merged: {
      severity: "error" | "warning" | "info";
      message: string;
      source: "blocks" | "code";
      line?: number;
      column?: number;
      handlerId?: string;
      screenId?: string;
    }[] = [];

    for (const diag of modelDiags) {
      merged.push({
        severity: diag.severity,
        message: diag.message,
        source: "blocks",
        handlerId: diag.handlerId,
        screenId: diag.screenId,
      });
    }
    for (const diag of codeDiagnostics) {
      merged.push({
        severity: diag.severity,
        message: diag.message,
        source: "code",
        line: diag.line,
        column: diag.column,
      });
    }

    const order = { error: 0, warning: 1, info: 2 } as const;
    return merged.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [modelDiags, codeDiagnostics]);

  const counts = useMemo(
    () => ({
      error: all.filter((d) => d.severity === "error").length,
      warning: all.filter((d) => d.severity === "warning").length,
      info: all.filter((d) => d.severity === "info").length,
    }),
    [all],
  );

  const visible = filter === "all" ? all : all.filter((d) => d.severity === filter);

  const fixable = useMemo(() => all.filter((d) => d.severity !== "info"), [all]);
  const buildFixPrompt = () => {
    const lines = fixable
      .slice(0, 10)
      .map((d) => `- [${d.severity}] ${d.message}`)
      .join("\n");
    return `Fix these project diagnostics:\n${lines}`;
  };

  const goTo = (item: (typeof all)[number]) => {
    if (item.source === "code") {
      setMode("code");
      return;
    }
    if (item.screenId) setActiveScreen(item.screenId);
    if (item.handlerId) {
      selectHandler(item.handlerId);
      setMode("blocks");
    }
  };

  return (
    <section
      aria-label="Diagnostics"
      className="shrink-0 border-t border-line bg-panel"
      style={{ height: open ? 168 : 36 }}
    >
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] font-medium text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
            style={{ transform: open ? "rotate(-90deg)" : "rotate(0deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          Diagnostics
        </button>

        <div className="flex items-center gap-2 text-[11px]">
          {onRequestAIFix ? (
            <button
              type="button"
              onClick={() => onRequestAIFix(buildFixPrompt())}
              disabled={fixable.length === 0}
              title={
                fixable.length === 0
                  ? "Nothing to fix — diagnostics are healthy"
                  : "Ask the AI to propose fixes for these diagnostics"
              }
              className="flex items-center gap-1 rounded-md border border-violet/40 px-2 py-0.5 text-violet transition-colors hover:bg-violet/10 disabled:border-line disabled:text-mist disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              <IconSparkle size={11} />
              Fix with AI
            </button>
          ) : null}
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={all.length} />
          <FilterChip active={filter === "error"} onClick={() => setFilter("error")} label="Errors" count={counts.error} tone="rose" />
          <FilterChip active={filter === "warning"} onClick={() => setFilter("warning")} label="Warnings" count={counts.warning} tone="amber" />
          <FilterChip active={filter === "info"} onClick={() => setFilter("info")} label="Info" count={counts.info} tone="sky" />
        </div>
      </div>

      {open ? (
        <div className="h-[132px] overflow-y-auto px-3 py-2">
          {all.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-mist">No errors 🎉</p>
          ) : visible.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-mist">
              No {filter} diagnostics.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((item, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => goTo(item)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        item.severity === "error" && "bg-rose",
                        item.severity === "warning" && "bg-amber",
                        item.severity === "info" && "bg-sky",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-fog">{item.message}</span>
                    <span className="shrink-0 font-mono text-[10px] text-mist uppercase">
                      {item.source}
                      {item.line !== undefined ? ` ${item.line}:${item.column}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "rose" | "amber" | "sky";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-1.5 py-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
        active ? "bg-surface-strong text-ink" : "text-mist hover:text-fog",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-1 font-mono",
          tone === "rose" && count > 0 && "text-rose",
          tone === "amber" && count > 0 && "text-amber",
          tone === "sky" && count > 0 && "text-sky",
        )}
      >
        {count}
      </span>
    </button>
  );
}
