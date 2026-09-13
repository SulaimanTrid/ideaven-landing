"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extensionApi } from "@/lib/api";
import type {
  BuildEvent,
  BuildLogLine,
  BuildRecord,
  BuildState,
  FixProposal,
  VersionConflict,
} from "@/types/extension";
import { ApiError } from "@/types/auth";

/**
 * The Build tab (Task 06): the real pipeline over SSE — every state and log
 * line below arrived from the build worker the moment it happened. Version
 * collisions offer only actions the backend supports; failures get an
 * actionable explanation and a diff-based AI fix with explicit apply/undo;
 * successes surface the artifact (size + checksum) with an always-findable
 * download. History lists every real run.
 */

// The pipeline phases in execution order; each maps the worker's state to
// its UI slot. A phase is done/active/pending purely from received events —
// nothing is pre-marked.
const PHASES: Array<{ state: BuildState; label: string }> = [
  { state: "validating", label: "Validate" },
  { state: "source-validation", label: "Source" },
  { state: "resolving-dependencies", label: "Dependencies" },
  { state: "compiling", label: "Compile" },
  { state: "packaging", label: "Package" },
  { state: "verifying", label: "Verify" },
];

const stateIndex = (state?: BuildState) =>
  PHASES.findIndex((phase) => phase.state === state);

// Human explanations for each failure point — the raw worker error is
// always shown alongside.
const EXPLAIN: Record<string, { title: string; body: string; tab?: "manifest" | "source" }> = {
  validating: {
    title: "Manifest validation failed.",
    body: "The manifest is the JSON contract (format, components, blocks). Open the Manifest tab — the JSON must parse and every id must be unique. Source code never belongs here.",
    tab: "manifest",
  },
  "source-validation": {
    title: "Source validation failed.",
    body: "The manifest's component/block metadata did not check out (a component without an id or label, or a block with an unknown kind). Fix it in the Manifest tab.",
    tab: "manifest",
  },
  "resolving-dependencies": {
    title: "Dependency resolution failed.",
    body: "The manifest references another extension that is not published (or not at the requested version). Only published extensions exist in the registry — publish the dependency first or remove it from the manifest.",
    tab: "manifest",
  },
  compiling: {
    title: "Source compilation failed.",
    body: "The authored source did not pass the structural compile: unbalanced braces/brackets/quotes, or Java-like source without a package or type declaration. Open the Source tab — the error line tells you where.",
    tab: "source",
  },
  packaging: {
    title: "Packaging failed.",
    body: "The AIX archive could not be assembled from the validated inputs. This is rare — retry, and if it persists check the docs size (max 64 KB).",
  },
  verifying: {
    title: "Package verification failed.",
    body: "The finished package failed its reopen-and-reparse check (identity, manifest, embedded source). Retry the build; if it persists the stored manifest may be inconsistent.",
  },
  version: {
    title: "Version conflict.",
    body: "That version was recorded while the build ran. Pick a different version and build again.",
  },
  spawn: {
    title: "The build worker could not start.",
    body: "The isolated worker process failed to launch on the server. Retry shortly; if it persists, the server's build toolchain is misconfigured.",
  },
};

function formatBytes(size?: number): string {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export interface BuildPanelProps {
  id: string;
  slug: string;
  currentVersion: string;
  /** Focus another studio tab (Open manifest / Open source assistance). */
  onOpenTab: (tab: "manifest" | "source") => void;
  /** Apply an AI fix into the studio editor + persist via the update API;
   *  resolves with the previous content so undo is exact. */
  onApplyFix: (target: "manifest" | "source", newContent: string) => Promise<string>;
  /** Notifies the studio a build succeeded (sticky bar + refresh). */
  onBuildSuccess: (info: { version: string; checksum: string; size: number }) => void;
  /** Live updates of the build version input default. */
  onVersionBuilt?: (version: string) => void;
}

export function BuildPanel({
  id, slug, currentVersion, onOpenTab, onApplyFix, onBuildSuccess, onVersionBuilt,
}: BuildPanelProps) {
  const [buildVersion, setBuildVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [state, setState] = useState<BuildState>("idle");
  const [starting, setStarting] = useState(false);
  const [logs, setLogs] = useState<BuildLogLine[]>([]);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [conflict, setConflict] = useState<VersionConflict | null>(null);
  const [success, setSuccess] = useState<{ version: string; checksum: string; size: number } | null>(null);
  const [history, setHistory] = useState<BuildRecord[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // AI fix flow.
  const [fixing, setFixing] = useState(false);
  const [proposal, setProposal] = useState<FixProposal | null>(null);
  const [applied, setApplied] = useState<{ target: "manifest" | "source"; previous: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const versionInputRef = useRef<HTMLInputElement | null>(null);
  const lastAttemptRef = useRef<string>("");
  const lastBuildIdRef = useRef<string>("");

  useEffect(() => {
    if (buildVersion === "") setBuildVersion(currentVersion);
  }, [currentVersion, buildVersion]);

  const loadHistory = useCallback(() => {
    extensionApi.builds(id)
      .then((res) => setHistory(res.builds ?? []))
      .catch(() => setHistory([]));
  }, [id]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const resetRun = () => {
    setLogs([]);
    setFailedStep(null);
    setErrorText(null);
    setConflict(null);
    setSuccess(null);
    setNotice(null);
    setProposal(null);
    setApplied(null);
    lastBuildIdRef.current = "";
  };

  const startBuild = useCallback(async (versionOverride?: string) => {
	if (abortRef.current) return;
    const version = (versionOverride ?? buildVersion).trim();
    lastAttemptRef.current = version;
    resetRun();
    // Waiting for the connection is separate from a pipeline state. A phase
    // is never shown active until the worker itself emits it.
    setState("idle");
    setStarting(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await extensionApi.buildStream(
        id,
        { version: version || undefined, changelog: changelog.trim() },
        (event) => {
          if (event.buildId) lastBuildIdRef.current = event.buildId;
          switch (event.type) {
            case "state":
              if (event.state) setState(event.state);
              if (event.message) {
                setLogs((current) => [...current, { step: event.step ?? "", level: "info", message: event.message ?? "" }]);
              }
              break;
            case "log":
              setLogs((current) => [
                ...current,
                { step: event.step ?? "", level: event.level ?? "info", message: event.message ?? "" },
              ]);
              break;
            case "conflict":
              setState("failed");
              setConflict(event.conflict ?? null);
              break;
            case "result": {
              if (event.ok) {
                setState("success");
                setSuccess({
                  version: event.version ?? version,
                  checksum: event.checksum ?? "",
                  size: event.size ?? 0,
                });
                onBuildSuccess({
                  version: event.version ?? version,
                  checksum: event.checksum ?? "",
                  size: event.size ?? 0,
                });
                onVersionBuilt?.(event.version ?? version);
                loadHistory();
              } else if (event.conflict) {
                setState("failed");
                setConflict(event.conflict);
              } else {
                setState("failed");
                setFailedStep(event.failedStep ?? null);
                setErrorText(event.error ?? "The build failed.");
              }
              loadHistory();
              break;
            }
          }
        },
        controller.signal,
      );
      // Stream ended without a terminal event → the run was cancelled.
      setState((current) => (current === "success" || current === "failed" ? current : "cancelled"));
    } catch (err) {
      if (controller.signal.aborted) {
        setState("cancelled");
        loadHistory();
        return;
      }
      setState("failed");
      setErrorText(err instanceof ApiError ? err.message : "Could not run the build. Try again shortly.");
    } finally {
      abortRef.current = null;
	  setStarting(false);
    }
  }, [id, buildVersion, changelog, onBuildSuccess, onVersionBuilt, loadHistory]);

  const cancelBuild = () => {
    abortRef.current?.abort();
  };

  const retry = () => {
    void startBuild(lastAttemptRef.current || undefined);
  };

  const requestFix = async () => {
    if (!lastBuildIdRef.current) return;
    setFixing(true);
    setProposal(null);
    setApplied(null);
    setNotice(null);
    try {
      const res = await extensionApi.fix(id, lastBuildIdRef.current);
      setProposal(res.fix);
      if (!res.fix.valid) {
        setNotice("The AI proposal did not pass validation — it is shown for review only and cannot be applied.");
      }
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not request a fix. Try again shortly.");
    } finally {
      setFixing(false);
    }
  };

  const applyFix = async () => {
    if (!proposal) return;
    let previous = "";
    try {
      // The studio persists through the same validated PATCH path and
      // returns the pre-apply content so undo is exact.
      previous = await onApplyFix(proposal.target, proposal.newContent);
      setApplied({ target: proposal.target, previous });
      setNotice("Fix applied and saved. Undo restores the previous content exactly.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not apply the fix.");
    }
  };

  const undoFix = async () => {
    if (!applied) return;
    try {
      await onApplyFix(applied.target, applied.previous);
      setApplied(null);
      setProposal(null);
      setNotice("Fix undone — the previous content is back.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not undo.");
    }
  };

  const building = starting || ["validating", "source-validation", "resolving-dependencies", "compiling", "packaging", "verifying"].includes(state);

  // Which phase is active/failed, derived only from received events.
  const activeIndex = stateIndex(failedStep && state === "failed" ? (failedStep as BuildState) : state);
  const phaseState = (index: number): "pending" | "active" | "done" | "failed" => {
    if (state === "failed" && index === activeIndex) return "failed";
    if (state === "success") return "done";
    if (state === "cancelled") return index <= (stateIndex("verifying")) ? "pending" : "pending";
    if (index < activeIndex) return "done";
    if (index === activeIndex) return "active";
    return "pending";
  };

  const explain = failedStep ? EXPLAIN[failedStep] : undefined;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-card p-5">
        <h3 className="text-[14px] font-semibold text-ink">Build</h3>
        <p className="mt-1 text-[12.5px] leading-5 text-fog">
          Runs the isolated build worker — manifest validation → source
          validation → dependency resolution → compile → AIX packaging →
          verification. Every line below is real worker output, streamed as
          it happens.
        </p>
		{starting && state === "idle" ? <p className="mt-2 text-[12px] text-mist" role="status">Starting the isolated build worker…</p> : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            ref={versionInputRef}
            value={buildVersion}
            onChange={(event) => setBuildVersion(event.target.value)}
            placeholder={`Version (current v${currentVersion})`}
            aria-label="Build version"
            className="h-9 flex-1 rounded-lg border border-line bg-panel px-3 font-mono text-[12.5px] text-ink placeholder:text-mist"
          />
          <input
            value={changelog}
            onChange={(event) => setChangelog(event.target.value)}
            placeholder="Changelog note (optional)"
            aria-label="Build changelog"
            className="h-9 flex-[2] rounded-lg border border-line bg-panel px-3 text-[12.5px] text-ink placeholder:text-mist"
          />
          {building ? (
            <button
              type="button"
              onClick={cancelBuild}
              className="h-9 shrink-0 rounded-lg border border-rose/40 bg-rose/10 px-4 text-[12.5px] font-medium text-rose transition-colors hover:bg-rose/20"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startBuild()}
              className="h-9 shrink-0 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
            >
              Build AIX
            </button>
          )}
        </div>

        {/* Pipeline state machine */}
        {state !== "idle" ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Build progress">
              {PHASES.map((phase, index) => {
                const phaseStatus = phaseState(index);
                return (
                  <span
                    key={phase.state}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      phaseStatus === "done"
                        ? "border-mint/40 bg-mint/10 text-mint"
                        : phaseStatus === "active"
                          ? "border-violet/50 bg-violet/10 text-ink"
                          : phaseStatus === "failed"
                            ? "border-rose/50 bg-rose/10 text-rose"
                            : "border-line bg-panel text-mist"
                    }`}
                  >
                    {phaseStatus === "done" ? "✓ " : phaseStatus === "failed" ? "✕ " : phaseStatus === "active" ? "• " : ""}
                    {phase.label}
                  </span>
                );
              })}
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  state === "success"
                    ? "border-mint/50 bg-mint/15 text-mint"
                    : state === "failed"
                      ? "border-rose/50 bg-rose/10 text-rose"
                      : state === "cancelled"
                        ? "border-line bg-panel text-fog"
                        : "border-line bg-panel text-mist"
                }`}
              >
                {state.toUpperCase()}
              </span>
            </div>
          </div>
        ) : null}

        {/* Structured log — real worker output only */}
        {logs.length > 0 ? (
          <ol className="mt-3 max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-code p-3 font-mono text-[11.5px] leading-5" aria-label="Build log">
            {logs.map((entry, index) => (
              <li key={index} className={entry.level === "error" ? "text-rose" : "text-fog"}>
                <span className={entry.level === "error" ? "text-rose" : "text-mist"}>[{entry.step}]</span> {entry.message}
              </li>
            ))}
          </ol>
        ) : null}

        {notice ? <p className="mt-2 text-[12px] text-fog" role="status">{notice}</p> : null}

        {/* Version conflict — only actions the backend supports */}
        {conflict ? (
          <div className="mt-4 rounded-xl border border-amber/40 bg-amber/[0.07] p-4">
            <p className="text-[13px] font-semibold text-ink">This version already exists.</p>
            <p className="mt-1 text-[12.5px] text-fog">
              v{conflict.version} was already recorded{conflict.builtAt ? ` on ${formatTime(conflict.builtAt)}` : ""}. Choose how to continue:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {conflict.suggestions.map((suggestion) => {
                if (suggestion.action === "use-existing") {
                  return (
                    <a
                      key={suggestion.action}
                      href={extensionApi.aixUrl(id, conflict.version)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center rounded-lg border border-mint/40 bg-mint/10 px-3 text-[12.5px] font-medium text-mint transition-colors hover:bg-mint/20"
                    >
                      Use existing — download v{conflict.version}
                    </a>
                  );
                }
                if (suggestion.action === "change-version") {
                  return (
                    <button
                      key={suggestion.action}
                      type="button"
                      onClick={() => {
                        setConflict(null);
                        setState("idle");
                        versionInputRef.current?.focus();
                        versionInputRef.current?.select();
                      }}
                      className="inline-flex h-9 items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium text-fog transition-colors hover:text-ink"
                    >
                      Change version
                    </button>
                  );
                }
                return (
                  <button
                    key={suggestion.action}
                    type="button"
                    onClick={() => {
                      if (!suggestion.version) return;
                      setBuildVersion(suggestion.version);
                      void startBuild(suggestion.version);
                    }}
                    className="inline-flex h-9 items-center rounded-lg bg-violet-deep px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-violet"
                  >
                    Create new patch version — build v{suggestion.version}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Failure assistance */}
        {state === "failed" && !conflict ? (
          <div className="mt-4 rounded-xl border border-rose/40 bg-rose/[0.07] p-4">
            <p className="text-[13px] font-semibold text-rose">Build failed</p>
            {explain ? (
              <p className="mt-1 text-[12.5px] font-medium text-ink">Reason: {explain.title}</p>
            ) : null}
            {errorText ? (
              <p className="mt-1 break-words font-mono text-[11.5px] leading-5 text-fog">{errorText}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <details className="min-w-0 flex-1">
                <summary className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium text-fog transition-colors hover:text-ink">
                  Explain
                </summary>
                <p className="mt-2 rounded-lg border border-line bg-panel p-3 text-[12.5px] leading-5 text-fog">
                  {explain?.body ?? "The build stopped before producing a package. The log above shows the last real step."}
                </p>
              </details>
              <button
                type="button"
                onClick={() => onOpenTab("source")}
                className="inline-flex h-9 items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium text-fog transition-colors hover:text-ink"
              >
                Open source
              </button>
              <button
                type="button"
                onClick={() => onOpenTab("manifest")}
                className="inline-flex h-9 items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium text-fog transition-colors hover:text-ink"
              >
                Open manifest
              </button>
              <button
                type="button"
                onClick={() => void requestFix()}
                disabled={fixing || !lastBuildIdRef.current}
                className="inline-flex h-9 items-center rounded-lg bg-violet-deep px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
              >
                {fixing ? "Inspecting…" : "Fix with AI"}
              </button>
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-9 items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium text-fog transition-colors hover:text-ink"
              >
                Retry
              </button>
            </div>

            {/* AI fix: inspect → propose → diff → apply → undo */}
            {proposal ? (
              <div className="mt-3 rounded-xl border border-line bg-panel p-4">
                <p className="text-[12.5px] font-semibold text-ink">
                  Proposed fix ({proposal.target}) — {proposal.valid ? "validated" : "NOT validated"}
                </p>
                <p className="mt-1 text-[12.5px] leading-5 text-fog">{proposal.explanation}</p>
                {proposal.problems && proposal.problems.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-[12px] text-rose">
                    {proposal.problems.map((problem, index) => (
                      <li key={index}>line {problem.line}: {problem.message}</li>
                    ))}
                  </ul>
                ) : null}
                {proposal.diff ? (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-code p-3 font-mono text-[11px] leading-5">
                    {proposal.diff.split("\n").map((line, index) => (
                      <div
                        key={index}
                        className={
                          line.startsWith("+") ? "text-mint" : line.startsWith("-") ? "text-rose" : "text-fog"
                        }
                      >
                        {line || " "}
                      </div>
                    ))}
                  </pre>
                ) : (
                  <p className="mt-2 text-[12px] text-mist">No textual diff (the change replaces the whole file).</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {applied ? (
                    <>
                      <span className="inline-flex h-9 items-center rounded-lg border border-mint/40 bg-mint/10 px-3 text-[12.5px] font-medium text-mint">
                        Applied
                      </span>
                      <button
                        type="button"
                        onClick={() => void undoFix()}
                        className="inline-flex h-9 items-center rounded-lg border border-line bg-panel px-3 text-[12.5px] font-medium text-fog transition-colors hover:text-ink"
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={retry}
                        className="inline-flex h-9 items-center rounded-lg bg-violet-deep px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-violet"
                      >
                        Build again
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void applyFix()}
                      disabled={!proposal.valid}
                      className="inline-flex h-9 items-center rounded-lg bg-violet-deep px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
                    >
                      Apply fix
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Success: the real artifact */}
        {state === "success" && success ? (
          <div className="mt-4 rounded-xl border border-mint/40 bg-mint/[0.06] p-4">
            <p className="text-[13px] font-semibold text-mint">Build successful</p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
              <div>
                <dt className="text-mist">Version</dt>
                <dd className="font-mono text-ink">v{success.version}</dd>
              </div>
              <div>
                <dt className="text-mist">Size</dt>
                <dd className="font-mono text-ink">{formatBytes(success.size)}</dd>
              </div>
              <div>
                <dt className="text-mist">Checksum (SHA-256)</dt>
                <dd className="flex items-center gap-1.5 font-mono text-ink">
                  <span className="truncate" title={success.checksum}>{success.checksum.slice(0, 16)}…</span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(success.checksum)}
                    className="shrink-0 text-[11px] text-mist underline hover:text-ink"
                  >
                    copy
                  </button>
                </dd>
              </div>
            </dl>
            <a
              href={extensionApi.aixUrl(id, success.version)}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex h-10 items-center rounded-lg bg-violet-deep px-5 text-[13px] font-semibold text-white transition-colors hover:bg-violet"
            >
              DOWNLOAD .AIX
            </a>
          </div>
        ) : null}

        {state === "cancelled" ? (
          <p className="mt-4 rounded-xl border border-line bg-panel p-4 text-[12.5px] text-fog">
            Build cancelled — the worker was stopped and the attempt is recorded in history.
          </p>
        ) : null}
      </section>

      {/* Build history — every real run */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-ink">Build history</h3>
          <button type="button" onClick={loadHistory} className="text-[12px] text-mist underline hover:text-ink">
            Refresh
          </button>
        </div>
        {history === null ? (
          <p className="mt-3 text-[12.5px] text-fog">Loading build history…</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-fog">No builds yet — run the first one above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-mist">
                  <th className="py-2 pr-3 font-medium">Version</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 pr-3 font-medium">Checksum</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id} className="border-b border-line/60 align-top">
                    <td className="py-2.5 pr-3 font-mono text-[12.5px] text-ink">v{record.version}</td>
                    <td className="py-2.5 pr-3 text-[12px] text-fog">{formatTime(record.createdAt)}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          record.status === "success"
                            ? "border-mint/40 bg-mint/10 text-mint"
                            : record.status === "failed"
                              ? "border-rose/40 bg-rose/10 text-rose"
                              : "border-line bg-panel text-fog"
                        }`}
                        title={record.error || record.status}
                      >
                        {record.status}
                        {record.failedStep ? ` · ${record.failedStep}` : ""}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[12px] text-fog">{formatBytes(record.size)}</td>
                    <td className="py-2.5 pr-3 font-mono text-[11.5px] text-mist" title={record.checksum || undefined}>
                      {record.checksum ? `${record.checksum.slice(0, 10)}…` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      {record.status === "success" && record.checksum ? (
                        <a
                          href={extensionApi.aixUrl(id, record.version)}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] font-medium text-violet-deep underline hover:text-violet"
                        >
                          Download .AIX
                        </a>
                      ) : record.status === "failed" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBuildVersion(record.version);
                            void startBuild(record.version);
                          }}
                          className="text-[12px] font-medium text-fog underline hover:text-ink"
                        >
                          Retry
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-mist">
          Every row is a real worker run against {slug} — successes, failures, and cancellations alike.
        </p>
      </section>
    </div>
  );
}
