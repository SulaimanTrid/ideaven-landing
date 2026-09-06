"use client";

import { useEffect, useRef, useState } from "react";
import { projectApi } from "@/lib/api";
import { useBuilder } from "./builder-context";

/**
 * Export & compile (launch feedback): the menu now offers every target —
 * Web HTML, Android APK, Android AAB (Play bundle), and a Windows .exe
 * project. Honesty rule: the server produces ready-to-build projects plus
 * CI workflows; the actual APK/AAB/EXE compilation happens in Android
 * Studio/gradle, the included GitHub Actions workflow, or electron-builder
 * on a desktop machine. Nothing here pretends to emit signed binaries.
 */

type Target = {
  id: string;
  title: string;
  output: string;
  where: string;
  href: string;
  primary?: boolean;
};

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
  const pid = project.id;

  const targets: Target[] = [
    {
      id: "web",
      title: "Web app",
      output: ".html — runs anywhere",
      where: "Downloaded file opens directly in a browser.",
      href: projectApi.exportHTMLUrl(pid),
      primary: true,
    },
    {
      id: "apk",
      title: "Android · APK",
      output: ".apk via gradle assembleDebug",
      where: "Project zip → Android Studio, SDK CLI, or the included GitHub Actions workflow (builds the .apk for you).",
      href: projectApi.exportAndroidUrl(pid, "apk"),
    },
    {
      id: "aab",
      title: "Android · AAB (Play Store)",
      output: ".aab via gradle bundleDebug",
      where: "Same project, preconfigured for the Play bundle; CI uploads the .aab artifact.",
      href: projectApi.exportAndroidUrl(pid, "aab"),
    },
    {
      id: "exe",
      title: "Windows · .exe",
      output: "portable .exe via electron-builder",
      where: "Electron project zip → run npm install && npm run dist on a desktop machine with Node.",
      href: projectApi.exportWindowsUrl(pid),
    },
  ];

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
        <span className="hidden lg:inline">Export</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-96 max-w-[94vw] rounded-xl border border-line bg-card p-4 shadow-2xl">
          <h3 className="text-[13.5px] font-semibold">Export &amp; compile</h3>
          <p className="mt-1 text-[12px] leading-5 text-fog">
            Every target runs your saved model through the standalone runtime.
          </p>
          {dirty ? (
            <p className="mt-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
              You have unsaved changes — save first so the export matches what
              you see.
            </p>
          ) : null}

          <ul className="mt-3 flex flex-col gap-2">
            {targets.map((target) => (
              <li key={target.id}>
                <a
                  href={target.href}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block rounded-xl border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                    target.primary
                      ? "border-violet/50 bg-violet/[0.08] hover:border-violet"
                      : "border-line bg-panel hover:border-violet/40"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{target.title}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mist">
                      download ↓
                    </span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-fog">{target.output}</span>
                  <span className="mt-1 block text-[11.5px] leading-4 text-mist">{target.where}</span>
                </a>
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
    </div>
  );
}
