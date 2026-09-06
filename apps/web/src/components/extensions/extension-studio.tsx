"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { extensionApi } from "@/lib/api";
import type { Extension } from "@/types/extension";
import { ApiError } from "@/types/auth";

type Tab = "manifest" | "docs" | "versions" | "build";

interface BuildResult {
  ok: boolean;
  version: string;
  logs: Array<{ step: string; level: string; message: string }>;
  checksum?: string;
  size?: number;
  error?: string;
}

/**
 * The Extension Studio (roadmap 2.0 Phase 1): manifest/docs/versions/build
 * over the real registry API. Build runs the isolated worker pipeline —
 * manifest validation → source validation → dependency resolution →
 * packaging → verification — with every step's logs surfaced here.
 */
export function ExtensionStudio({ id }: { id: string }) {
  const [extension, setExtension] = useState<Extension | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("manifest");

  // Edit state per tab.
  const [manifestText, setManifestText] = useState("");
  const [docsText, setDocsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Build state.
  const [buildVersion, setBuildVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [building, setBuilding] = useState(false);
  const [build, setBuild] = useState<BuildResult | null>(null);

  const load = useCallback(() => {
    extensionApi.get(id).then((res) => {
      setExtension(res.extension);
      setManifestText(JSON.stringify(res.extension.manifest, null, 2));
      setDocsText(res.extension.docs);
      setBuildVersion(res.extension.currentVersion);
    }).catch((err) =>
      setError(err instanceof ApiError ? err.message : "Could not load the extension."),
    );
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose/30 bg-rose/10 p-6 text-sm text-rose">
        {error}
        <Link href="/dashboard/extensions" className="ml-2 underline">Back to extensions</Link>
      </div>
    );
  }
  if (!extension) {
    return <p className="text-sm text-fog">Loading extension…</p>;
  }

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const manifest = tab === "manifest" ? JSON.parse(manifestText) : undefined;
      const res = await extensionApi.update(id, {
        name: tab === "manifest" ? undefined : undefined,
        manifest,
        docs: tab === "docs" ? docsText : undefined,
      });
      setExtension(res.extension);
      setNotice("Saved.");
    } catch (err) {
      if (err instanceof ApiError) setNotice(err.message);
      else if (err instanceof SyntaxError) setNotice(`Manifest is not valid JSON: ${err.message}`);
      else setNotice("Could not save. Try again shortly.");
    } finally {
      setSaving(false);
    }
  };

  const runBuild = async () => {
    setBuilding(true);
    setBuild(null);
    try {
      const res = await extensionApi.build(id, {
        version: buildVersion.trim() || undefined,
        changelog: changelog.trim(),
      });
      setBuild(res.build);
      if (res.build.ok) {
        const refreshed = await extensionApi.get(id);
        setExtension(refreshed.extension);
      }
    } catch (err) {
      setBuild({
        ok: false,
        version: buildVersion,
        logs: [],
        error: err instanceof ApiError ? err.message : "Could not run the build. Try again shortly.",
      });
    } finally {
      setBuilding(false);
    }
  };

  const tabs: Array<[Tab, string]> = [
    ["manifest", "Manifest"],
    ["docs", "Documentation"],
    ["versions", "Versions"],
    ["build", "Build"],
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-ink">{extension.name}</h2>
          <p className="font-mono text-[11.5px] text-mist">
            {extension.slug} · v{extension.currentVersion} · {extension.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {extension.status === "draft" ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await extensionApi.publish(id);
                  setExtension(res.extension);
                  setNotice("Published — the extension is now installable.");
                } catch (err) {
                  setNotice(err instanceof ApiError ? err.message : "Could not publish.");
                }
              }}
              className="h-9 rounded-lg border border-mint/40 bg-mint/10 px-3 text-[12.5px] font-medium text-mint transition-colors hover:bg-mint/20"
            >
              Publish
            </button>
          ) : (
            <span className="rounded-lg border border-mint/40 bg-mint/10 px-3 py-1.5 text-[12.5px] font-medium text-mint">
              Published
            </span>
          )}
          <Link
            href="/dashboard/extensions"
            className="h-9 rounded-lg border border-line px-3 text-[12.5px] leading-9 text-fog transition-colors hover:text-ink"
          >
            ← Registry
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-line bg-canvas p-1" role="tablist" aria-label="Studio sections">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              tab === value ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? <p className="text-[12.5px] text-fog" role="status">{notice}</p> : null}

      {/* Manifest */}
      {tab === "manifest" ? (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="text-[14px] font-semibold text-ink">Manifest</h3>
          <p className="mt-1 text-[12.5px] text-fog">
            Components, methods, events, blocks, and dependencies — format 1.
            The server validates every save.
          </p>
          <textarea
            value={manifestText}
            onChange={(event) => setManifestText(event.target.value)}
            spellCheck={false}
            rows={18}
            aria-label="Extension manifest JSON"
            className="mt-3 w-full rounded-xl border border-line bg-code p-4 font-mono text-[12.5px] leading-6 text-fog focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="h-9 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save manifest"}
            </button>
            {notice ? <span className="text-[12px]">{notice}</span> : null}
          </div>
        </section>
      ) : null}

      {/* Docs */}
      {tab === "docs" ? (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="text-[14px] font-semibold text-ink">Documentation</h3>
          <p className="mt-1 text-[12.5px] text-fog">
            Markdown documentation shipped inside the .AIX package.
          </p>
          <textarea
            value={docsText}
            onChange={(event) => setDocsText(event.target.value)}
            spellCheck={false}
            rows={14}
            aria-label="Extension documentation markdown"
            className="mt-3 w-full rounded-xl border border-line bg-code p-4 font-mono text-[12.5px] leading-6 text-fog focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="h-9 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save documentation"}
            </button>
            {notice ? <span className="text-[12px]">{notice}</span> : null}
          </div>
        </section>
      ) : null}

      {/* Versions */}
      {tab === "versions" ? <VersionsPanel id={id} onChanged={load} /> : null}

      {/* Build */}
      {tab === "build" ? (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="text-[14px] font-semibold text-ink">Build</h3>
          <p className="mt-1 text-[12.5px] leading-5 text-fog">
            Runs the isolated build worker: manifest validation → source
            validation → dependency resolution → AIX packaging → verification.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={buildVersion}
              onChange={(event) => setBuildVersion(event.target.value)}
              placeholder={`Version (current v${extension.currentVersion})`}
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
            <button
              type="button"
              onClick={() => void runBuild()}
              disabled={building}
              className="h-9 shrink-0 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
            >
              {building ? "Building…" : "Build AIX"}
            </button>
          </div>

          {build ? (
            <div className="mt-4 rounded-xl border border-line bg-panel p-4">
              <p className={`text-[13px] font-medium ${build.ok ? "text-mint" : "text-rose"}`}>
                {build.ok
                  ? `Build OK — v${build.version} (${build.size} bytes)`
                  : `Build failed — ${build.error ?? "unknown error"}`}
              </p>
              {build.logs && build.logs.length > 0 ? (
                <ol className="mt-3 space-y-1 font-mono text-[11.5px] leading-5">
                  {build.logs.map((entry, index) => (
                    <li
                      key={index}
                      className={entry.level === "error" ? "text-rose" : "text-fog"}
                    >
                      <span className="text-mist">[{entry.step}]</span> {entry.message}
                    </li>
                  ))}
                </ol>
              ) : null}
              {build.ok ? (
                <a
                  href={extensionApi.aixUrl(id, build.version)}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex h-9 items-center rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet"
                >
                  Download .AIX
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function VersionsPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [versions, setVersions] = useState<Array<{
    version: string;
    changelog: string;
    createdAt: string;
    source?: { checksum?: string };
  }> | null>(null);
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    extensionApi.versions(id).then((res) => setVersions(res.versions)).catch(() => setVersions([]));
  }, [id]);
  useEffect(() => {
    reload();
  }, [reload]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await extensionApi.saveVersion(id, { version: version.trim(), changelog: changelog.trim() });
      setVersion("");
      setChangelog("");
      reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the version.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h3 className="text-[14px] font-semibold text-ink">Versions</h3>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          placeholder="0.2.0"
          aria-label="New version"
          className="h-9 flex-1 rounded-lg border border-line bg-panel px-3 font-mono text-[12.5px] text-ink placeholder:text-mist"
        />
        <input
          value={changelog}
          onChange={(event) => setChangelog(event.target.value)}
          placeholder="What changed?"
          aria-label="Version changelog"
          className="h-9 flex-[2] rounded-lg border border-line bg-panel px-3 text-[12.5px] text-ink placeholder:text-mist"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || version.trim() === ""}
          className="h-9 shrink-0 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save version"}
        </button>
      </div>
      {error ? <p className="mt-2 text-[12px] text-rose">{error}</p> : null}

      {versions === null ? (
        <p className="mt-4 text-[12.5px] text-fog">Loading versions…</p>
      ) : versions.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-fog">No versions yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {versions.map((entry) => (
            <li key={entry.version} className="flex items-center justify-between gap-3 bg-panel px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[12.5px] text-ink">v{entry.version}</p>
                <p className="truncate text-[12px] text-fog">{entry.changelog || "No changelog note."}</p>
              </div>
              <span className="shrink-0 text-[11px] text-mist">
                {new Date(entry.createdAt).toLocaleDateString(undefined, {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
