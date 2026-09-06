"use client";

import { useCallback, useEffect, useState } from "react";
import { versionApi, type ProjectVersion } from "@/lib/api";
import { IconSparkle } from "@/components/visuals/icons";
import { ApiError } from "@/types/auth";
import { useBuilder } from "./builder-context";
import { IconClose, IconHistory } from "@/components/visuals/icons";

/**
 * The History panel (spec: save/versioning): every changed save the server
 * has snapshotted, newest first. Restoring fetches the stored model and
 * commits it as one undoable step — the normal autosave path then persists
 * it, and the restore itself becomes the newest snapshot. Nothing is ever
 * overwritten in place.
 */

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { project, commitModel } = useBuilder();
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { versions: list } = await versionApi.list(project.id);
      setVersions(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load history.");
    }
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = useCallback(
    async (versionId: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const { version } = await versionApi.get(project.id, versionId);
        commitModel(version.model);
        setConfirming(null);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not restore that version.");
      } finally {
        setBusy(false);
      }
    },
    [project.id, busy, commitModel, reload],
  );

  return (
    <aside
      aria-label="Version history"
      className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-2xl"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2">
          <IconHistory size={15} className="text-violet" />
          <h2 className="text-[14px] font-semibold">History</h2>
          {versions ? (
            <span className="font-mono text-[11px] text-mist">{versions.length}</span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close History"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconClose size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? <p className="mb-2 text-[12px] leading-4 text-rose">{error}</p> : null}
        {versions === null && error === null ? (
          <p className="pt-2 text-[13px] text-fog">Loading history…</p>
        ) : versions !== null && versions.length === 0 ? (
          <p className="pt-2 text-[13px] leading-6 text-fog">
            No versions yet. Every changed save from here on is snapshotted automatically —
            restore any of them as one undoable step.
          </p>
        ) : (
          <ol className="flex flex-col">
            {versions?.map((version, index) => {
              const isConfirming = confirming === version.id;
              return (
                <li key={version.id} className="relative border-l border-line pl-4 pb-3 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full border border-line"
                    style={{ background: index === 0 ? "#8f7bff" : "#2a2f42" }}
                  />
                  <p className="flex items-center gap-1.5 text-[13px] text-ink">
                    <span>
                      {version.origin === "ai"
                        ? "AI change applied"
                        : index === 0
                          ? "Latest save"
                          : `Save ${versions.length - index}`}
                    </span>
                    <span className="font-mono text-[11px] text-mist">{timeAgo(version.createdAt)}</span>
                    {version.origin === "ai" ? (
                      <IconSparkle size={12} className="text-violet" aria-label="Applied AI changeset" />
                    ) : null}
                  </p>
                  {version.origin === "ai" && index + 1 < versions.length ? (
                    <p className="mt-0.5 text-[11px] text-mist">
                      The entry below is the state right before this AI change.
                    </p>
                  ) : null}
                  <p className="font-mono text-[10px] text-mist">{version.size} bytes</p>
                  {isConfirming ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void restore(version.id)}
                        className="rounded-md border border-violet/50 bg-violet/10 px-2 py-0.5 text-[11px] text-violet transition-colors hover:bg-violet/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                      >
                        {busy ? "Restoring…" : "Confirm restore"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-md border border-line px-2 py-0.5 text-[11px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(version.id)}
                      className="mt-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-fog transition-colors hover:border-violet/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      Restore
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 border-t border-line pt-3 text-[11px] leading-4 text-mist">
          Restoring applies the stored model as one undoable commit — Undo brings your newer
          work straight back, and the restore itself is snapshotted.
        </p>
      </div>
    </aside>
  );
}
