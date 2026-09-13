"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { assetApi, imageUrl, type ProjectAsset } from "@/lib/api";
import { ApiError } from "@/types/auth";
import { insertComponent, locateComponent, newComponent } from "@/lib/project-model/ops";
import { useBuilder } from "./builder-context";
import { useI18n } from "@/lib/i18n/i18n";
import { IconClose, IconImage, IconPlus, IconTrash } from "@/components/visuals/icons";

/**
 * The Assets panel (spec: asset manager): uploads, lists, and manages a
 * project's stored media. Uploaded files become rows on the server (bytes
 * never enter the model document) plus a reference in model.assets — one
 * undoable commit. "asset:<id>" srcs on image components render through the
 * authenticated raw endpoint in Design and Preview alike.
 */

const ASSET_LIMIT = 50;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function AssetsPanel({ onClose }: { onClose: () => void }) {
  const { project, model, commitModel, activeScreenId, selectedId, actions } = useBuilder();
  const { t } = useI18n();
  const [assets, setAssets] = useState<ProjectAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const { assets: list } = await assetApi.list(project.id);
      setAssets(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load assets.");
    }
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const registerInModel = useCallback(
    (asset: ProjectAsset) => {
      if (model.assets.some((a) => a.id === asset.id)) return;
      const next = structuredClone(model);
      next.assets.push({ id: asset.id, kind: asset.kind, name: asset.name });
      commitModel(next);
    },
    [model, commitModel],
  );

  const removeFromModel = useCallback(
    (assetId: string) => {
      if (!model.assets.some((a) => a.id === assetId)) return;
      const next = structuredClone(model);
      next.assets = next.assets.filter((a) => a.id !== assetId);
      commitModel(next);
    },
    [model, commitModel],
  );

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || busy) return;
      setBusy(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const { asset } = await assetApi.upload(project.id, file);
          registerInModel(asset);
        }
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "The upload failed. Try again.");
      } finally {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    },
    [project.id, busy, registerInModel, reload],
  );

  const insertImage = useCallback(
    (asset: ProjectAsset) => {
      const node = newComponent("image");
      if (!node) return;
      node.props = { ...node.props, src: `asset:${asset.id}`, alt: asset.name };
      const screen = model.screens.find((s) => s.id === activeScreenId) ?? model.screens[0];
      if (!screen) return;
      commitModel(insertComponent(model, screen.id, null, screen.components.length, node));
    },
    [model, activeScreenId, commitModel],
  );

  const useInSelected = useCallback(
    (asset: ProjectAsset) => {
      if (!selectedId || !locateComponent(model, selectedId)) return;
      actions.updateProps(selectedId, { src: `asset:${asset.id}`, alt: asset.name });
    },
    [model, selectedId, actions],
  );

  const deleteAsset = useCallback(
    async (asset: ProjectAsset) => {
      try {
        await assetApi.remove(asset.id);
        removeFromModel(asset.id);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not delete the asset.");
      }
    },
    [removeFromModel, reload],
  );

  const selectedIsImage = (() => {
    if (!selectedId) return false;
    return locateComponent(model, selectedId)?.node.type === "image";
  })();

  return (
    <aside
      aria-label="Assets"
      className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-2xl"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2">
          <IconImage size={15} className="text-mint" />
          <h2 className="text-[14px] font-semibold">{t("builder.assetsTitle")}</h2>
          {assets ? (
            <span className="font-mono text-[11px] text-mist">
              {assets.length}/{ASSET_LIMIT}
            </span>
          ) : null}
        </div>
        <Link
          href={`/builder/${project.id}/asset-studio`}
          className="rounded-md border border-violet/40 bg-violet/10 px-2 py-1 text-[11.5px] font-medium text-violet transition-colors hover:bg-violet/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          🎨 {t("builder.assetStudio")}
        </Link>
        <button
          type="button"
          aria-label="Close Assets"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconClose size={15} />
        </button>
      </div>

      <div className="shrink-0 border-b border-line p-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => void onFiles(event.target.files)}
        />
        <button
          type="button"
          disabled={busy || (assets?.length ?? 0) >= ASSET_LIMIT}
          onClick={() => fileInput.current?.click()}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-mint/40 bg-mint/10 px-3 text-[13px] font-medium text-mint transition-colors hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconPlus size={14} />
          {busy ? "Uploading…" : "Upload images"}
        </button>
        <p className="mt-2 text-[11px] leading-4 text-mist">
          PNG, JPEG, WebP, or GIF up to 2 MB. Stored per project, referenced as{" "}
          <span className="font-mono">asset:…</span> — never embedded in the model.
        </p>
        {error ? <p className="mt-2 text-[12px] leading-4 text-rose">{error}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {assets === null && error === null ? (
          <p className="pt-2 text-[13px] text-fog">Loading assets…</p>
        ) : assets !== null && assets.length === 0 ? (
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-[13px] leading-6 text-fog">
              No assets yet. Upload an image, then insert it onto any screen or apply it to the
              selected image component.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {assets?.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-card p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated project asset bytes */}
                <img
                  src={imageUrl(`asset:${asset.id}`)}
                  alt={asset.name}
                  className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="font-mono text-[10px] text-mist">
                    {formatSize(asset.size)} · {asset.mime}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => insertImage(asset)}
                      className="rounded-md border border-line px-2 py-0.5 text-[11px] text-fog transition-colors hover:border-mint/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      + Image
                    </button>
                    <button
                      type="button"
                      disabled={!selectedIsImage}
                      onClick={() => useInSelected(asset)}
                      title={
                        selectedIsImage
                          ? "Set as the selected image component's source"
                          : "Select an image component first"
                      }
                      className="rounded-md border border-line px-2 py-0.5 text-[11px] text-fog transition-colors hover:border-mint/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      Use in selected
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${asset.name}`}
                      onClick={() => void deleteAsset(asset)}
                      className="rounded-md border border-line p-1 text-mist transition-colors hover:border-rose/50 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
