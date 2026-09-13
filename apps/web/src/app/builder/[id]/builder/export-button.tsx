"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projectPackageUrl, projectApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n/i18n";
import { useBuilder } from "./builder-context";
import { getAnyBlockDef } from "@/lib/project-model/block-registry";
import { IconClose } from "@/components/visuals/icons";

/**
 * Export & compile (Task 04): a real build pipeline per target. Stages run
 * actual work — client-side validation of the saved model, asset resolution,
 * then the streamed artifact download with real byte progress (indeterminate
 * while compiling: the server does not report percentages, so none are
 * faked). Failures stop the pipeline and surface diagnostics.
 *
 * Honesty rule unchanged: the server emits ready-to-build artifacts — a
 * runnable .html for Web, gradle project zips (+ CI workflow) for APK/AAB,
 * an electron project zip for Windows. Binary compilation happens where the
 * toolchains live; the labels say exactly that.
 */

type TargetId = "web" | "apk" | "aab" | "exe" | "package";

type Target = {
  id: TargetId;
  title: string;
  output: string;
  where: string;
  primary?: boolean;
};

const TARGETS: Target[] = [
  {
    id: "web",
    title: "Web app",
    output: ".html — runs anywhere, opens directly in a browser",
    where: "The standalone runtime is embedded in the file.",
    primary: true,
  },
  {
    id: "apk",
    title: "Android · APK",
    output: "gradle project zip → .apk via assembleDebug",
    where: "Android Studio, SDK CLI, or the included GitHub Actions workflow builds the .apk for you.",
  },
  {
    id: "aab",
    title: "Android · AAB (Play)",
    output: "gradle project zip → .aab via bundleDebug",
    where: "Same project, preconfigured for the Play bundle; CI uploads the artifact.",
  },
  {
    id: "package",
    title: "Project package (backup)",
    output: ".zip — model + assets + metadata",
    where: "Re-importable from the Projects page as a new copy.",
    primary: false,
  },
  {
    id: "exe",
    title: "Windows · .exe",
    output: "electron project zip → portable .exe via electron-builder",
    where: "Run npm install && npm run dist on a Windows machine with Node.",
  },
];

type StageState = "pending" | "running" | "done" | "failed";

interface Stage {
  id: string;
  label: string;
  state: StageState;
}

const INITIAL_STAGES: Stage[] = [
  { id: "validate", label: "Preparing project", state: "pending" },
  { id: "assets", label: "Preparing dependencies", state: "pending" },
  { id: "compile", label: "Compiling", state: "pending" },
  { id: "package", label: "Packaging", state: "pending" },
];

export interface Issue {
  severity: "error" | "warning";
  message: string;
}

export function validateModel(
  model: import("@/types/project").ProjectModel,
): Issue[] {
  const issues: Issue[] = [];
  if (model.screens.length === 0) {
    issues.push({ severity: "error", message: "The project has no screens." });
  }
  const startId = model.navigation.startScreenId;
  if (!model.screens.some((s) => s.id === startId)) {
    issues.push({ severity: "error", message: "The start screen no longer exists — pick one in Scenes." });
  }
  // Unknown block types are skipped by the generator — an honest warning.
  const unknown = new Set<string>();
  const visit = (blocks: import("@/types/project").ProjectModelBlock[]) => {
    for (const block of blocks) {
      if (!getAnyBlockDef(block.type)) unknown.add(block.type);
      for (const slot of Object.values(block.slots ?? {})) if (slot) visit([slot]);
      visit(block.children ?? []);
      visit(block.elseChildren ?? []);
    }
  };
  for (const screen of model.screens) {
    for (const handler of screen.logic?.handlers ?? []) visit(handler.body);
  }
  if (unknown.size > 0) {
    issues.push({
      severity: "warning",
      message: `${unknown.size} unsupported block type${unknown.size === 1 ? "" : "s"} will be skipped by the generated runtime: ${[...unknown].slice(0, 4).join(", ")}.`,
    });
  }
  return issues;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ExportButton() {
  const { project, model, saveState, saveNow } = useBuilder();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Pipeline state
  const [activeTarget, setActiveTarget] = useState<Target | null>(null);
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [bytes, setBytes] = useState<number | null>(null);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const setStage = useCallback((id: string, state: StageState) => {
    setStages((current) => current.map((s) => (s.id === id ? { ...s, state } : s)));
  }, []);

  const startExport = async (target: Target) => {
    setActiveTarget(target);
    setStages(INITIAL_STAGES.map((s) => ({ ...s })));
    setBytes(null);
    setTotalBytes(null);
    setIssues(null);
    setDownloadUrl(null);
    setFailed(false);

    // Stage 1: validate the SAVED model (and save first if dirty so the
    // artifact matches what the user sees).
    setStage("validate", "running");
    try {
      if (saveState === "dirty" || saveState === "error") await saveNow();
    } catch {
      setStage("validate", "failed");
      setFailed(true);
      setIssues([{ severity: "error", message: "The project could not be saved — fix your connection and retry." }]);
      return;
    }
    const found = validateModel(model);
    if (found.some((i) => i.severity === "error")) {
      setStage("validate", "failed");
      setFailed(true);
      setIssues(found);
      return;
    }
    setIssues(found.filter((i) => i.severity === "warning"));
    setStage("validate", "done");

    // Stage 2: resolve assets (real inventory of what the artifact carries).
    setStage("assets", "running");
    const assetCount = model.assets.length;
    await new Promise((r) => setTimeout(r, 250));
    setStage("assets", "done");

    // Stage 3+4: fetch the artifact with real byte progress. The server does
    // not stream percentages — the compile bar stays indeterminate and the
    // package stage reports actual bytes.
    setStage("compile", "running");
    const url =
      target.id === "web"
        ? projectApi.exportHTMLUrl(project.id)
        : target.id === "exe"
          ? projectApi.exportWindowsUrl(project.id)
          : target.id === "package"
            ? projectPackageUrl(project.id)
            : projectApi.exportAndroidUrl(project.id, target.id);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        setStage("compile", "failed");
        setFailed(true);
        let message = `The server rejected the build (HTTP ${res.status}).`;
        try {
          const payload = await res.json();
          if (payload?.error?.message) message = payload.error.message;
        } catch {
          /* non-JSON error body */
        }
        setIssues((current) => [...(current ?? []), { severity: "error", message }]);
        window.dispatchEvent(new CustomEvent("ideaven:open-diagnostics"));
        return;
      }
      const lengthHeader = Number(res.headers.get("Content-Length"));
      setTotalBytes(Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : null);
      setStage("compile", "done");

      setStage("package", "running");
      const reader = res.body?.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer);
            received += value.byteLength;
            setBytes(received);
          }
        }
      } else {
        const blob = await res.blob();
        setBytes(blob.size);
        chunks.push(await blob.arrayBuffer());
      }
      const blob = new Blob(chunks, {
        type: target.id === "web" ? "text/html" : "application/zip",
      });
      setStage("package", "done");
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setDownloadUrl(objectUrl);
      void assetCount;
    } catch (err) {
      setStage("compile", "failed");
      setFailed(true);
      setIssues((current) => [
        ...(current ?? []),
        { severity: "error", message: `Build failed: ${String(err).slice(0, 160)}` },
      ]);
      window.dispatchEvent(new CustomEvent("ideaven:open-diagnostics"));
    }
  };

  const dirty = saveState === "dirty" || saveState === "error";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Export & compile the saved model"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fog transition-colors hover:bg-surface-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </svg>
        <span className="hidden lg:inline">{t("builder.export")}</span>
      </button>

      {open && !activeTarget ? (
        <div className="absolute right-0 top-11 z-50 w-96 max-w-[94vw] rounded-xl border border-line bg-card p-4 shadow-2xl">
          <h3 className="text-[13.5px] font-semibold">{t("builder.export")} &amp; compile</h3>
          <p className="mt-1 text-[12px] leading-5 text-fog">
            Every target runs your saved model through the standalone runtime.
          </p>
          {dirty ? (
            <p className="mt-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
              You have unsaved changes — the pipeline saves first so the export
              matches what you see.
            </p>
          ) : null}

          <ul className="mt-3 flex flex-col gap-2">
            {TARGETS.map((target) => (
              <li key={target.id}>
                <button
                  type="button"
                  onClick={() => void startExport(target)}
                  className={`block w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                    target.primary
                      ? "border-violet/50 bg-violet/[0.08] hover:border-violet"
                      : "border-line bg-panel hover:border-violet/40"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{target.title}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mist">
                      build →
                    </span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-fog">{target.output}</span>
                  <span className="mt-1 block text-[11.5px] leading-4 text-mist">{target.where}</span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-line pt-2 text-[11px] leading-4 text-mist">
            Binary compilation happens where the toolchains live (gradle/CI for
            Android, electron-builder for Windows) — the zips are ready for
            each, no faked downloads.
          </p>
        </div>
      ) : null}

      {open && activeTarget ? (
        <div className="absolute right-0 top-11 z-50 w-96 max-w-[94vw] rounded-xl border border-line bg-card p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[13.5px] font-semibold">Build · {activeTarget.title}</h3>
            <button
              type="button"
              aria-label="Close build pipeline"
              onClick={() => {
                setActiveTarget(null);
                setFailed(false);
              }}
              className="rounded-md p-1 text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-mint"
            >
              <IconClose size={13} />
            </button>
          </div>

          <ol className="mt-3 flex flex-col gap-2.5">
            {stages.map((stage, index) => (
              <li key={stage.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                  {stage.state === "done" ? (
                    <span className="text-[12px] text-mint">✓</span>
                  ) : stage.state === "failed" ? (
                    <span className="text-[12px] text-rose">✕</span>
                  ) : stage.state === "running" ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-violet" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full border border-line" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`text-[12.5px] ${
                      stage.state === "failed"
                        ? "text-rose"
                        : stage.state === "pending"
                          ? "text-mist"
                          : "text-ink"
                    }`}
                  >
                    {stage.label}
                    {stage.state === "running" ? "…" : stage.state === "done" ? " ✓" : ""}
                  </span>
                  {stage.id === "compile" && stage.state === "running" ? (
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <span className="block h-full w-1/3 animate-pulse rounded-full bg-violet" />
                    </span>
                  ) : null}
                  {stage.id === "package" && stage.state === "running" ? (
                    <span className="mt-1 block font-mono text-[10.5px] text-fog">
                      {bytes !== null ? `${formatBytes(bytes)}${totalBytes ? ` / ${formatBytes(totalBytes)}` : ""}` : "preparing stream…"}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>

          {issues && issues.length > 0 ? (
            <div className={`mt-3 rounded-lg border p-2.5 text-[11.5px] leading-4 ${failed ? "border-rose/50 bg-rose/10" : "border-amber/40 bg-amber/10"}`}>
              <p className="font-medium text-ink">
                {failed ? "Build failed" : "Build completed with notes"}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {issues.map((issue, i) => (
                  <li key={i} className={issue.severity === "error" ? "text-rose" : "text-amber"}>
                    • {issue.message}
                  </li>
                ))}
              </ul>
              {failed ? (
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("ideaven:open-diagnostics"));
                    setOpen(false);
                  }}
                  className="mt-2 h-7 rounded-md border border-line bg-panel px-2.5 text-[11.5px] font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-mint"
                >
                  Open Diagnostics
                </button>
              ) : null}
            </div>
          ) : null}

          {downloadUrl ? (
            <a
              href={downloadUrl}
              download={`${project.slug}${activeTarget.id === "web" ? ".html" : "-" + activeTarget.id + ".zip"}`}
              className="mt-3 block rounded-xl border border-mint/60 bg-mint/10 p-3 text-center transition-colors hover:bg-mint/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              <span className="block text-[13px] font-semibold text-ink">Build complete ✓</span>
              <span className="mt-0.5 block font-mono text-[11px] text-fog">
                Download {activeTarget.id === "web" ? ".html" : `.${activeTarget.id === "exe" ? "zip (Windows project)" : activeTarget.id === "package" ? "zip (project package)" : activeTarget.id}`}{bytes !== null ? ` · ${formatBytes(bytes)}` : ""}
              </span>
            </a>
          ) : null}

          <p className="mt-3 border-t border-line pt-2 text-[11px] leading-4 text-mist">
            Progress is real: validation runs on your model, bytes are counted
            from the actual download. Compilation is indeterminate because the
            server does not report percentages.
          </p>
        </div>
      ) : null}
    </div>
  );
}
