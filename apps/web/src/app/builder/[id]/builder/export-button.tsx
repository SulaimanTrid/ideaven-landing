"use client";

import { useEffect, useRef, useState } from "react";
import { projectApi } from "@/lib/api";
import { useBuilder } from "./builder-context";

/**
 * Export (roadmap 26/30–31): two owner-only downloads from the live model —
 * a standalone single-file HTML export and a ready-to-build Android WebView
 * project. The server snapshots nothing here: the export always reflects the
 * saved model, so save first.
 */
export function ExportButton() {
  const { project, saveState } = useBuilder();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const dirty = saveState === "dirty" || saveState === "error";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Export the saved model"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-fog transition-colors hover:bg-surface-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </svg>
        <span className="hidden lg:inline">Export</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[92vw] rounded-xl border border-line bg-card p-4 shadow-2xl">
          <h3 className="text-[13px] font-semibold">Export</h3>
          <p className="mt-1 text-[12px] leading-5 text-fog">
            Both exports run your saved model through the standalone runtime.
          </p>
          {dirty ? (
            <p className="mt-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
              You have unsaved changes — save first so the export matches what
              you see.
            </p>
          ) : null}
          <a
            href={projectApi.exportHTMLUrl(project.id)}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-9 items-center justify-center rounded-lg bg-violet-deep text-[12.5px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            Web export (.html)
          </a>
          <a
            href={projectApi.exportAndroidUrl(project.id)}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex h-9 items-center justify-center rounded-lg border border-line text-[12.5px] font-medium text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            Android project (.zip)
          </a>
          <p className="mt-2 text-[11px] leading-4 text-mist">
            The Android zip builds a debug APK in Android Studio, on the
            command line, or via its included GitHub Actions workflow.
          </p>
        </div>
      ) : null}
    </div>
  );
}
