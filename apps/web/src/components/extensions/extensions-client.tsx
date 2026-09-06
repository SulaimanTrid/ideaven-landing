"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { extensionApi } from "@/lib/api";
import type { Extension } from "@/types/extension";
import { ApiError } from "@/types/auth";

/**
 * The extension registry surface (roadmap 2.0-B, Phase A): real CRUD over
 * authored extensions and their versions. The Studio editors (manifest /
 * source / docs / build) land in Phase B on this same API — this page is the
 * registry they will open, not a placeholder.
 */
export function ExtensionsClient() {
  const [extensions, setExtensions] = useState<Extension[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    extensionApi.list().then((res) => setExtensions(res.extensions)).catch((err) =>
      setError(err instanceof ApiError ? err.message : "Could not load your extensions."),
    );
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      await extensionApi.create({
        name: trimmed,
        summary: summary.trim() || undefined,
        kind: "mixed",
      });
      setName("");
      setSummary("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the extension.");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (extension: Extension) => {
    if (!window.confirm(`Delete “${extension.name}” and its version history?`)) return;
    setBusyId(extension.id);
    try {
      await extensionApi.remove(extension.id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the extension.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-[15px] font-semibold">New extension</h2>
        <p className="mt-1 text-[12.5px] leading-5 text-fog">
          Register an extension: it gets a public slug and a versioned
          manifest. The Studio editors and .AIX build arrive in the next
          phase — the registry below is live.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Extension name (e.g. Remote Control)"
            aria-label="Extension name"
            maxLength={60}
            className="h-10 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="One-line summary (optional)"
            aria-label="Extension summary"
            maxLength={200}
            className="h-10 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating || name.trim() === ""}
            className="h-10 shrink-0 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
        {error ? <p className="mt-3 text-[12.5px] text-rose">{error}</p> : null}
      </section>

      {extensions === null ? (
        <p className="text-sm text-fog">Loading your extensions…</p>
      ) : extensions.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-10 text-center">
          <h3 className="text-lg font-semibold text-ink">No extensions yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fog">
            Extensions add your own components, methods, events, and blocks to
            Ideaven — packaged as .AIX and installable into any project.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {extensions.map((extension) => (
            <li key={extension.id} className="flex h-full flex-col rounded-2xl border border-line bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-mist">
                  {extension.kind}
                </span>
                <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-mist">
                  v{extension.currentVersion}
                </span>
              </div>
              <Link
                href={`/dashboard/extensions/${extension.id}`}
                className="mt-3 block truncate text-[15px] font-semibold text-ink hover:text-violet"
              >
                {extension.name}
              </Link>
              <p className="mt-0.5 truncate font-mono text-[11px] text-mist">{extension.slug}</p>
              <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-fog">
                {extension.summary || "No summary."}
              </p>
              <dl className="mt-3 flex gap-4 text-[12px] text-fog">
                <div>
                  <dt className="inline text-mist">Components: </dt>
                  <dd className="inline">{extension.manifest.components?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="inline text-mist">Blocks: </dt>
                  <dd className="inline">{extension.manifest.blocks?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="inline text-mist">Events: </dt>
                  <dd className="inline">{extension.manifest.events?.length ?? 0}</dd>
                </div>
              </dl>
              <div className="mt-auto flex gap-2 pt-4">
                <Link
                  href={`/dashboard/extensions/${extension.id}`}
                  className="h-8 rounded-lg border border-line px-3 text-[12px] leading-8 text-fog transition-colors hover:text-ink"
                >
                  Open Studio
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(extension)}
                  disabled={busyId === extension.id}
                  className="h-8 rounded-lg border border-rose/40 px-3 text-[12px] text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
                >
                  {busyId === extension.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
