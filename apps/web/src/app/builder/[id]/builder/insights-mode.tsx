"use client";

import { useEffect, useMemo, useState } from "react";
import { projectApi } from "@/lib/api";
import { useBuilder } from "./builder-context";
import { ProjectMap } from "./project-map";
import { MemoryPanel } from "./memory-panel";
import { BrainPanel } from "./brain-panel";
import type { IntelHealth, IntelIssue, IntelSeverity } from "@/types/intelligence";
import type { DNAReport } from "@/types/dna";
import { ApiError } from "@/types/auth";
import { cn } from "@ideaven/ui";

/**
 * Insights mode (roadmap 3.0 M1 + 4.0 M2): the project intelligence surface —
 * health cards over seven dimensions with click-through issues, the
 * navigation graph, and the Project Map (graph view). Purely derived: none
 * of it mutates the model.
 */

const DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: "build", label: "Build" },
  { key: "runtime", label: "Runtime" },
  { key: "architecture", label: "Architecture" },
  { key: "performance", label: "Performance" },
  { key: "accessibility", label: "Accessibility" },
  { key: "security", label: "Security" },
  { key: "dependency", label: "Dependencies" },
];

export function InsightsMode() {
  const { project, model, setActiveScreen, selectHandler, setMode } = useBuilder();
  const [report, setReport] = useState<Awaited<ReturnType<typeof projectApi.intelligence>>["intelligence"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<IntelSeverity | "all">("all");
  const [tab, setTab] = useState<"health" | "map" | "dna" | "memory" | "brain">("health");
  const [dna, setDna] = useState<DNAReport | null>(null);

  useEffect(() => {
    let alive = true;
    projectApi
      .intelligence(project.id)
      .then((res) => {
        if (alive) setReport(res.intelligence);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : "Could not load project intelligence.");
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  // DNA is fetched lazily — only when its tab is first opened.
  useEffect(() => {
    if (tab !== "dna" || dna) return;
    let alive = true;
    projectApi
      .dna(project.id)
      .then((res) => {
        if (alive) setDna(res.dna);
      })
      .catch(() => {
        // Health tab already surfaces API errors; DNA stays unavailable.
      });
    return () => {
      alive = false;
    };
  }, [tab, dna, project.id]);

  const screenName = useMemo(() => {
    const map = new Map<string, string>();
    for (const screen of model.screens) map.set(screen.id, screen.name);
    return map;
  }, [model.screens]);

  const issueCounts = useMemo(() => {
    const counts = { critical: 0, attention: 0, info: 0 };
    for (const issue of report?.issues ?? []) counts[issue.severity] += 1;
    return counts;
  }, [report]);

  const visibleIssues = useMemo(() => {
    const issues = report?.issues ?? [];
    return severityFilter === "all" ? issues : issues.filter((issue) => issue.severity === severityFilter);
  }, [report, severityFilter]);

  const goTo = (issue: IntelIssue) => {
    if (issue.screenId) setActiveScreen(issue.screenId);
    if (issue.handlerId) {
      selectHandler(issue.handlerId);
      setMode("blocks");
    } else {
      setMode("design");
    }
  };

  const health = report?.health;
  const wired = report?.counts.handlersWired ?? 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      {/* Tab switcher: Health | Project map */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-0.5" role="group" aria-label="Insights views">
          {(["health", "map", "dna", "memory", "brain"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint",
                tab === value ? "bg-surface-strong text-ink" : "text-mist hover:text-fog",
              )}
            >
              {value === "health" ? "Health" : value === "map" ? "Project map" : value === "dna" ? "DNA" : value === "memory" ? "Memory" : "Brain"}
            </button>
          ))}
        </div>
        <p className="hidden text-[12px] text-mist sm:block">
          Derived from your model — nothing here edits the project.
        </p>
      </div>

      {tab === "map" ? (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <ProjectMap />
        </div>
      ) : tab === "dna" ? (
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-4xl">
            {!dna ? (
              <p className="text-[13px] text-fog">Reading your project…</p>
            ) : (
              <DnaView dna={dna} />
            )}
          </div>
        </div>
      ) : tab === "memory" ? (
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <MemoryPanel />
        </div>
      ) : tab === "brain" ? (
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <BrainPanel />
        </div>
      ) : error ? (
        <div className="p-6 text-[13px] text-rose">{error}</div>
      ) : !report || !health ? (
        <div className="p-6 text-[13px] text-fog">Analyzing your project…</div>
      ) : (
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-lg font-semibold text-ink">Project intelligence</h2>
        <p className="mt-1 text-[12.5px] text-fog">
          Derived from your actual model — nothing here edits the project.
          Click an issue to jump to its cause.
        </p>

        {/* Counts strip */}
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            ["Screens", report.counts.screens],
            ["Components", report.counts.components],
            ["Handlers", `${report.counts.handlersWired}/${report.counts.handlers} wired`],
            ["Blocks", report.counts.blocks],
            ["Variables", report.counts.variables],
            ["Assets", report.counts.assets],
          ].map(([term, value]) => (
            <div key={term as string} className="bg-panel px-3 py-2.5">
              <dt className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">{term as string}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-ink">{value as string}</dd>
            </div>
          ))}
        </dl>

        {/* Health cards */}
        <h3 className="mt-6 text-[13.5px] font-semibold text-ink">Health</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {DIMENSIONS.map((dimension) => {
            const level = (health[dimension.key as keyof typeof health] ?? "healthy") as IntelHealth;
            return (
              <div
                key={dimension.key}
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  level === "healthy" && "border-mint/30 bg-mint/[0.06]",
                  level === "attention" && "border-amber/40 bg-amber/[0.07]",
                  level === "critical" && "border-rose/40 bg-rose/[0.08]",
                )}
              >
                <p className="text-[11.5px] font-medium text-fog">{dimension.label}</p>
                <p
                  className={cn(
                    "mt-0.5 text-[12.5px] font-semibold",
                    level === "healthy" && "text-mint",
                    level === "attention" && "text-amber",
                    level === "critical" && "text-rose",
                  )}
                >
                  {level === "healthy" ? "Healthy" : level === "attention" ? "Attention" : "Critical"}
                </p>
              </div>
            );
          })}
        </div>

        {/* Navigation graph */}
        <h3 className="mt-6 text-[13.5px] font-semibold text-ink">Screen flow</h3>
        {report.navigation.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-fog">
            No navigation between screens yet — add navigate blocks.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {report.navigation.map((edge, index) => (
              <li
                key={`${edge.from}-${edge.to}-${index}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px]"
              >
                <button
                  type="button"
                  onClick={() => setActiveScreen(edge.from)}
                  className="text-fog transition-colors hover:text-ink"
                >
                  {screenName.get(edge.from) ?? edge.from}
                </button>
                <span aria-hidden="true" className="text-violet">→</span>
                <button
                  type="button"
                  onClick={() => setActiveScreen(edge.to)}
                  className="text-fog transition-colors hover:text-ink"
                >
                  {screenName.get(edge.to) ?? edge.to}
                </button>
                <span className="ml-auto font-mono text-[10px] text-mist uppercase">{edge.kind}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Issues */}
        <div className="mt-6 flex items-center justify-between">
          <h3 className="text-[13.5px] font-semibold text-ink">
            Issues{" "}
            <span className="text-[12px] font-normal text-mist">
              ({issueCounts.critical} critical · {issueCounts.attention} attention · {issueCounts.info} info)
            </span>
          </h3>
          <div className="flex gap-1" role="group" aria-label="Filter issues">
            {(["all", "critical", "attention", "info"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSeverityFilter(value)}
                aria-pressed={severityFilter === value}
                className={`rounded-md px-2 py-1 text-[11.5px] capitalize transition-colors ${
                  severityFilter === value ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {visibleIssues.length === 0 ? (
          <p className="mt-3 rounded-xl border border-mint/30 bg-mint/[0.06] px-4 py-3 text-[13px] text-mint">
            Nothing here — {wired} handler{wired === 1 ? "" : "s"} wired across{" "}
            {report.counts.screens} screen{report.counts.screens === 1 ? "" : "s"}.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {visibleIssues.map((issue, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => goTo(issue)}
                  className="flex w-full items-start gap-2 rounded-lg border border-line bg-card px-3 py-2 text-left transition-colors hover:border-violet/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      issue.severity === "critical" && "bg-rose",
                      issue.severity === "attention" && "bg-amber",
                      issue.severity === "info" && "bg-sky",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-fog">{issue.message}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-mist uppercase">
                      {issue.dimension}
                      {issue.screenName ? ` · ${issue.screenName}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
      )}
    </div>
  );
}

// ---- DNA view (4.0 M3) ---------------------------------------------------------

function DnaView({ dna }: { dna: DNAReport }) {
  const levelColor = (level: string) =>
    level === "critical" ? "text-rose" : level === "attention" ? "text-amber" : "text-mint";

  return (
    <>
      <h2 className="text-lg font-semibold text-ink">Project DNA</h2>
      <p className="mt-1 text-[12.5px] text-fog">
        What this project is — derived entirely from your model. Nothing is
        invented; nothing here edits the project.
      </p>

      <section className="mt-4 rounded-xl border border-line bg-card p-4">
        <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">Purpose</p>
        <p className="mt-1 text-[15px] font-semibold text-ink">{dna.purpose.name}</p>
        {dna.purpose.description ? (
          <p className="mt-0.5 text-[13px] text-fog">{dna.purpose.description}</p>
        ) : (
          <p className="mt-0.5 text-[12.5px] text-mist">No description yet — add one in project settings.</p>
        )}
        <p className="mt-1 text-[12px] text-mist capitalize">
          {dna.purpose.type} · {dna.purpose.visibility}
        </p>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Screens", dna.architecture.screens],
          ["Components", dna.architecture.components],
          ["Handlers", dna.architecture.handlers],
          ["Blocks", dna.architecture.blocks],
        ].map(([term, value]) => (
          <div key={term as string} className="rounded-xl border border-line bg-card px-3 py-2.5">
            <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">{term as string}</p>
            <p className="mt-0.5 text-[15px] font-semibold text-ink">{value as number}</p>
          </div>
        ))}
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">Architecture</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-fog">
            <li>Start screen: <span className="text-ink">{dna.architecture.startScreen || "—"}</span></li>
            <li>Component types: {Object.entries(dna.architecture.byType).map(([type, count]) => `${type}×${count}`).join(", ") || "none"}</li>
            <li>Screen flow: {Object.entries(dna.architecture.navigation).map(([from, to]) => `${from} → ${to}`).join(", ") || "no navigation yet"}</li>
            {dna.architecture.emptyScreens.length > 0 ? (
              <li className="text-amber">Empty screens: {dna.architecture.emptyScreens.join(", ")}</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">State · variables</p>
          {dna.state.variables.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-mist">No variables yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-[12.5px] text-fog">
              {dna.state.variables.map((variable) => (
                <li key={variable.name}>
                  <span className="text-ink">{variable.name}</span>{" "}
                  <span className="text-mist">({variable.type})</span> — {variable.writes} writes · {variable.reads} reads
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">Assets</p>
          {dna.assets.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-mist">No assets yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-[12.5px] text-fog">
              {dna.assets.map((asset) => (
                <li key={asset.name} className={asset.orphan ? "text-amber" : undefined}>
                  {asset.name} <span className="text-mist">({asset.kind})</span> — {asset.orphan ? "unused" : `used on ${asset.usedBy} component${asset.usedBy === 1 ? "" : "s"}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">Logic & extensions</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-fog">
            <li>Events: {Object.entries(dna.logic.eventsUsed).map(([event, count]) => `${event}×${count}`).join(", ") || "none wired"}</li>
            <li>Extensions: {dna.extensions.length > 0 ? dna.extensions.join(", ") : "none used in logic"}</li>
          </ul>
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-line bg-card p-4">
        <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">Health</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(dna.health.dimensions).map(([dimension, level]) => (
            <span key={dimension} className={`rounded-full border border-line px-2.5 py-1 text-[11.5px] capitalize ${levelColor(level)}`}>
              {dimension}: {level}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-mist">
          {dna.health.critical} critical · {dna.health.attention} attention · {dna.health.info} info —
          see the Health tab for the full list.
        </p>
      </section>
    </>
  );
}
