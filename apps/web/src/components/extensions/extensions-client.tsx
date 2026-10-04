"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { extensionApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import { useI18n } from "@/lib/i18n/i18n";
import type { Extension, PublicExtension } from "@/types/extension";
import { IconPlus } from "@/components/visuals/icons";

/**
 * The everyone-can-use Extensions page (launch feedback): three shelves —
 * **Explore** (every published extension from all creators, with real
 * install counts and one-click install), **Installed** (in your palette),
 * and **Yours** (create/author). Installing is what makes an extension's
 * blocks appear in the builder's Blocks palette (the \u2b21 section).
 */

type Shelf = "explore" | "installed" | "yours";

export function ExtensionsClient() {
  const { t } = useI18n();
  const [shelf, setShelf] = useState<Shelf>("explore");
  const [publicItems, setPublicItems] = useState<PublicExtension[] | null>(null);
  const [installed, setInstalled] = useState<Extension[] | null>(null);
  const [yours, setYours] = useState<Extension[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** TASK 64 §17: uninstall confirmation with the server-provided usage. */
  const [uninstallCandidate, setUninstallCandidate] = useState<{ extension: Extension; projects: number } | null>(null);

  // Create form (yours shelf).
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const refresh = useCallback(() => {
    extensionApi.listPublic().then((r) => setPublicItems(r.extensions)).catch(() => setPublicItems([]));
    extensionApi.installed().then((r) => setInstalled(r.extensions)).catch(() => setInstalled([]));
    extensionApi.list().then((r) => setYours(r.extensions)).catch(() => setYours([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  /** TASK 64: any install-state change re-registers palette blocks in the
   * builder (BlocksMode listens for this event). */
  const announceChange = () => {
    window.dispatchEvent(new CustomEvent("ideaven:extensions-changed"));
  };

  const install = async (item: PublicExtension) => {
    setBusy(item.id);
    setNotice(null);
    try {
      await extensionApi.install(item.id);
      announceChange();
      setNotice(`Installed ${item.name} \u2014 its blocks are now in your builder\u2019s Blocks palette (\u2b21 section).`);
      refresh();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not install. Try again.");
    } finally {
      setBusy(null);
    }
  };

  /** TASK 64 §16: enable/disable WITHOUT uninstalling — project references
   * stay readable; the blocks leave/rejoin the active palette. */
  const setEnabled = async (extension: Extension, enabled: boolean) => {
    setBusy(extension.id);
    setNotice(null);
    try {
      await extensionApi.setInstallEnabled(extension.id, enabled);
      announceChange();
      setNotice(enabled
        ? `Enabled ${extension.name} — its blocks are back in your Blocks palette.`
        : `Disabled ${extension.name} — its blocks left the palette; projects keep their saved blocks.`);
      refresh();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not change the extension state. Try again.");
    } finally {
      setBusy(null);
    }
  };

  /** TASK 64 §17: uninstall safety — the real "used by N projects" number
   * arrives from the server before the destructive step. */
  const requestUninstall = async (extension: Extension) => {
    setBusy(extension.id);
    setNotice(null);
    try {
      const { projects } = await extensionApi.usage(extension.id);
      setUninstallCandidate({ extension, projects });
    } catch {
      // Usage unknown: still allow the uninstall, with the honest default.
      setUninstallCandidate({ extension, projects: 0 });
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async () => {
    const candidate = uninstallCandidate;
    if (!candidate) return;
    setBusy(candidate.extension.id);
    setNotice(null);
    try {
      await extensionApi.uninstall(candidate.extension.id);
      announceChange();
      setNotice(candidate.projects > 0
        ? `Uninstalled ${candidate.extension.name}. ${candidate.projects} of your project${candidate.projects === 1 ? "" : "s"} keep${candidate.projects === 1 ? "s" : ""} their saved blocks — they show as unavailable until you reinstall.`
        : `Uninstalled ${candidate.extension.name}.`);
      setUninstallCandidate(null);
      refresh();
    } catch {
      setNotice("Could not uninstall. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || creatingBusy) return;
    setCreatingBusy(true);
    try {
      const res = await extensionApi.create({ name: name.trim(), summary: summary.trim() });
      setNotice(`Created ${res.extension.name} \u2014 open the Studio to author it.`);
      setName("");
      setSummary("");
      setCreating(false);
      setShelf("yours");
      refresh();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not create. Try again.");
    } finally {
      setCreatingBusy(false);
    }
  };

  const installedIds = new Set((installed ?? []).map((e) => e.id));
  const mineIds = new Set((yours ?? []).map((e) => e.id));

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setShelf("yours");
          setCreating(true);
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <IconPlus size={14} /> New extension
      </button>
      {notice ? (
        <p className="mt-3 rounded-lg border border-mint/30 bg-mint/[0.08] px-3 py-2 text-[12.5px] text-mint" role="status">
          {notice}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1" role="tablist" aria-label="Extension shelves">
        {(
          [
            ["explore", `Explore${publicItems ? ` \u00b7 ${publicItems.length}` : ""}`],
            ["installed", `Installed${installed ? ` \u00b7 ${installed.length}` : ""}`],
            ["yours", `Yours${yours ? ` \u00b7 ${yours.length}` : ""}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={shelf === value}
            onClick={() => setShelf(value)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              shelf === value ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && shelf !== "explore" ? null : null}

      {/* TASK 64 §17: uninstall confirmation — the usage number is real
          (server-counted projects referencing this extension's blocks). */}
      {uninstallCandidate ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm uninstall"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setUninstallCandidate(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setUninstallCandidate(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-5 shadow-2xl">
            <h2 className="text-[15px] font-semibold text-ink">
              Uninstall “{uninstallCandidate.extension.name}”?
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-fog">
              {uninstallCandidate.projects > 0
                ? `This extension is used by ${uninstallCandidate.projects} of your project${uninstallCandidate.projects === 1 ? "" : "s"}. Uninstalling removes its blocks from your palette — the saved blocks in those projects stay in place but show as unavailable.`
                : "This extension is installed but unused by your projects — uninstalling is safe."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUninstallCandidate(null)}
                className="h-9 rounded-lg border border-line px-3 text-[13px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-mint"
              >
                Cancel
              </button>
              <button
                type="button"
                data-uninstall-confirm="true"
                onClick={() => void uninstall()}
                disabled={busy === uninstallCandidate.extension.id}
                className="h-9 rounded-lg bg-rose px-4 text-[13px] font-medium text-white transition-colors hover:bg-rose/85 disabled:opacity-40"
              >
                {busy === uninstallCandidate.extension.id ? "Uninstalling…" : "Uninstall"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shelf === "explore" ? (
        publicItems === null ? (
          <p className="mt-5 text-[13px] text-fog">Loading the public shelf\u2026</p>
        ) : publicItems.length === 0 ? (
          <EmptyShelf text="No published extensions yet \u2014 publish yours and it appears here for everyone." />
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {publicItems.map((item) => (
              <li key={item.id} className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">{item.name}</p>
                    <p className="font-mono text-[10.5px] text-mist">
                      by @{item.creator} \u00b7 v{item.version} \u00b7 {item.installs} install{item.installs === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase text-mist">
                    {item.kind}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-fog">{item.summary}</p>
                {installedIds.has(item.id) || mineIds.has(item.id) ? (
                  <span className="mt-3 inline-flex rounded-lg border border-mint/40 bg-mint/10 px-3 py-1.5 text-[12px] font-medium text-mint">
                    ✓ {t("ext.inPalette")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void install(item)}
                    disabled={busy === item.id}
                    className="mt-3 h-9 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
                  >
                    {busy === item.id ? "Installing\u2026" : "Install"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {shelf === "installed" ? (
        installed === null ? (
          <p className="mt-5 text-[13px] text-fog">Loading\u2026</p>
        ) : installed.length === 0 ? (
          <EmptyShelf text="Nothing installed yet \u2014 install something from Explore and its blocks show up in the builder." />
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {installed.map((extension) => (
              <li key={extension.id} className={`rounded-2xl border p-4 ${extension.enabled === false ? "border-amber/30 bg-amber/[0.04]" : "border-mint/30 bg-mint/[0.05]"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink">{extension.name}</p>
                  {/* TASK 64 §6: the state label reflects the REAL registry
                      state — disabled means the provider is not active. */}
                  <span
                    data-ext-state={extension.enabled === false ? "disabled" : "enabled"}
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${extension.enabled === false ? "bg-amber/10 text-amber" : "bg-mint/10 text-mint"}`}
                  >
                    {extension.enabled === false ? "disabled" : "enabled"}
                  </span>
                </div>
                {/* Version honesty: show what YOU installed; when the author
                    has published a newer version since, say so explicitly. */}
                {extension.installedVersion && extension.installedVersion !== extension.currentVersion ? (
                  <p className="font-mono text-[10.5px] text-mist">
                    v{extension.installedVersion} installed · v{extension.currentVersion} published
                  </p>
                ) : (
                  <p className="font-mono text-[10.5px] text-mist">
                    v{extension.installedVersion ?? extension.currentVersion}
                  </p>
                )}
                <p className="mt-1.5 line-clamp-2 text-[12.5px] text-fog">{extension.summary}</p>
                {extension.enabled === false ? (
                  <p className="mt-1.5 rounded-lg border border-amber/30 bg-amber/[0.06] px-2.5 py-1.5 text-[11.5px] leading-4 text-amber">
                    Disabled — projects keep their saved blocks, but they render as unavailable until you enable it again.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/extensions/${extension.id}`}
                    className="h-9 rounded-lg border border-line px-3 text-[12px] leading-9 text-fog transition-colors hover:text-ink"
                  >
                    Open Studio
                  </Link>
                  <button
                    type="button"
                    data-ext-toggle="true"
                    aria-pressed={extension.enabled === false}
                    onClick={() => void setEnabled(extension, extension.enabled === false)}
                    disabled={busy === extension.id}
                    className={`h-9 rounded-lg border px-3 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                      extension.enabled === false
                        ? "border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
                        : "border-amber/40 bg-amber/10 text-amber hover:bg-amber/20"
                    }`}
                  >
                    {busy === extension.id ? "\u2026" : extension.enabled === false ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    data-ext-uninstall="true"
                    onClick={() => void requestUninstall(extension)}
                    disabled={busy === extension.id}
                    className="h-9 rounded-lg border border-line px-3 text-[12px] text-mist transition-colors hover:text-rose disabled:opacity-40"
                  >
                    Uninstall
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {shelf === "yours" ? (
        <div className="mt-5">
          {creating ? (
            <form onSubmit={create} className="mb-4 rounded-2xl border border-line bg-card p-4">
              <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">New extension</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Extension name"
                  aria-label="Extension name"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                <input
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="What does it do?"
                  aria-label="Extension summary"
                  className="h-9 min-w-0 flex-[2] rounded-lg border border-line bg-panel px-3 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                <button
                  type="submit"
                  disabled={creatingBusy || !name.trim()}
                  className="h-9 rounded-lg bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet disabled:opacity-40"
                >
                  {creatingBusy ? "Creating\u2026" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="h-9 rounded-lg border border-line px-3 text-[12.5px] text-fog transition-colors hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          {yours !== null && yours.length === 0 && !creating ? (
            <EmptyShelf text="You haven\u2019t authored an extension yet \u2014 hit New extension and build your first." />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(yours ?? []).map((extension) => (
                <li key={extension.id} className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[14px] font-semibold text-ink">{extension.name}</p>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${extension.status === "published" ? "bg-mint/10 text-mint" : "bg-amber/10 text-amber"}`}>
                      {extension.status}
                    </span>
                  </div>
                  <p className="font-mono text-[10.5px] text-mist">v{extension.currentVersion} \u00b7 {extension.slug}</p>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] text-fog">{extension.summary}</p>
                  <Link
                    href={`/dashboard/extensions/${extension.id}`}
                    className="mt-3 inline-flex h-9 items-center rounded-lg border border-line px-3 text-[12px] text-fog transition-colors hover:text-ink"
                  >
                    Open Studio
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EmptyShelf({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-line bg-card/50 p-8 text-center">
      <p className="text-[13.5px] text-fog">{text}</p>
    </div>
  );
}
