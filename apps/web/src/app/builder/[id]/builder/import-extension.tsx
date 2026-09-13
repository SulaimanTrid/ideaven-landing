"use client";

import { useEffect, useRef, useState } from "react";
import { extensionApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import type { ExtensionManifest } from "@/types/extension";
import { IconClose } from "@/components/visuals/icons";

/**
 * Import Extension (Task 04): bring an extension package into the project
 * from inside the builder. The flow is honest end to end:
 *   select file → validate the manifest client-side → inspect metadata →
 *   install (creates the extension + registers it for this account) → the
 *   extension's blocks appear in Blocks mode. "Imported" is only shown after
 *   both server calls succeed; validation failures show exactly what broke.
 */

interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest: ExtensionManifest | null;
}

function validateManifest(raw: string): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, errors: [`Not valid JSON: ${String(err).slice(0, 120)}`], warnings, manifest: null };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, errors: ["The manifest must be a JSON object."], warnings, manifest: null };
  }
  const m = parsed as Record<string, unknown>;
  if (m.format !== 1) {
    errors.push(`"format" must be 1 (found ${JSON.stringify(m.format)}).`);
  }
  const name = typeof m.name === "string" ? m.name.trim() : "";
  if (!name) errors.push(`"name" is required (a short display name for the extension).`);
  if (name.length > 120) errors.push(`"name" is longer than 120 characters.`);

  const blocks = Array.isArray(m.blocks) ? m.blocks : [];
  const methods = Array.isArray(m.methods) ? m.methods : [];
  const events = Array.isArray(m.events) ? m.events : [];
  const components = Array.isArray(m.components) ? m.components : [];
  if (blocks.length === 0 && methods.length === 0 && components.length === 0) {
    errors.push(`The manifest declares nothing to import — add "blocks", "methods", or "components".`);
  }
  const seenTypes = new Set<string>();
  for (const block of blocks) {
    const b = block as Record<string, unknown>;
    if (typeof b.type !== "string" || b.type.trim() === "") {
      errors.push(`A block entry is missing its "type".`);
      continue;
    }
    if (seenTypes.has(b.type)) errors.push(`Duplicate block type "${b.type}".`);
    seenTypes.add(b.type);
    if (b.kind !== "statement" && b.kind !== "expression") {
      errors.push(`Block "${b.type}": "kind" must be "statement" or "expression".`);
    }
  }
  for (const method of methods) {
    const mm = method as Record<string, unknown>;
    if (typeof mm.id !== "string" || mm.id.trim() === "") {
      errors.push(`A method entry is missing its "id".`);
    }
  }
  const deps = Array.isArray(m.dependencies) ? m.dependencies : [];
  if (deps.length > 0) {
    warnings.push(
      `${deps.length} declared${deps.length === 1 ? " dependency" : " dependencies"} are informational — the runtime does not resolve packages yet, so make sure the pieces it needs are installed.`,
    );
  }
  if (components.length > 0) {
    warnings.push(
      `${components.length} declared${components.length === 1 ? " component" : " components"}: component runtimes are not available in the canvas yet — the extension's blocks work in Blocks mode today.`,
    );
  }

  const manifest: ExtensionManifest = {
    format: 1,
    name,
    blocks: blocks as ExtensionManifest["blocks"],
    methods: methods as ExtensionManifest["methods"],
    events: events as ExtensionManifest["events"],
    components: components as ExtensionManifest["components"],
    dependencies: deps as ExtensionManifest["dependencies"],
  };
  return { ok: errors.length === 0, errors, warnings, manifest };
}

export function ImportExtensionDialog({ onClose, onImported }: { onClose: () => void; onImported: (name: string) => void }) {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inspect = (text: string, name: string | null) => {
    setRaw(text);
    setFileName(name);
    setError(null);
    setValidation(text.trim() === "" ? null : validateManifest(text));
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => inspect(text, file.name));
  };

  const install = async () => {
    if (!validation?.ok || !validation.manifest) return;
    setBusy(true);
    setError(null);
    try {
      const manifest = validation.manifest;
      const name = manifest.name ?? "Imported extension";
      setPhase("Registering extension…");
      let extension: Awaited<ReturnType<typeof extensionApi.create>>["extension"] | null = null;
      let lastError: unknown = null;
      for (const suffix of ["", " (imported)", " (imported 2)"]) {
        try {
          const result = await extensionApi.create({
            name: suffix ? `${name}${suffix}` : name,
            summary: `Imported ${fileName ?? "manifest"} — ${manifest.blocks?.length ?? 0} block${manifest.blocks?.length === 1 ? "" : "s"}`,
            kind: (manifest.blocks?.length ?? 0) > 0 ? "blocks" : "component",
            manifest,
          });
          extension = result.extension;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!extension) throw lastError;
      setPhase("Building .AIX package…");
      const build = await extensionApi.build(extension.id, { version: "1.0.0" });
      if (!build.build.ok) {
        const failLog = [...(build.build.logs ?? [])].reverse().find((l) => l.level === "error");
        setError(`Package build failed: ${failLog?.message ?? build.build.error ?? "unknown error"}`);
        return;
      }
      setPhase("Publishing…");
      await extensionApi.publish(extension.id);
      setPhase("Installing…");
      await extensionApi.install(extension.id);
      onImported(name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Installation failed — the extension was not imported.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import Extension"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-[620px] max-w-full overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Import Extension</h2>
            <p className="mt-0.5 text-[12px] leading-5 text-fog">
              Pick an extension manifest (JSON, format 1). It is validated
              before anything is installed — nothing is registered on failure.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close import dialog"
            onClick={onClose}
            className="rounded-md p-1 text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-mint"
          >
            <IconClose size={14} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-line bg-panel px-4 py-5 text-center transition-colors hover:border-violet/50 focus-visible:outline-2 focus-visible:outline-mint">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <span className="text-[13px] font-medium text-ink">
              {fileName ?? "Choose a manifest .json file"}
            </span>
            <span className="text-[11px] text-mist">
              {fileName ? "Loaded — inspect below" : "or paste the manifest contents below"}
            </span>
          </label>

          <textarea
            value={raw}
            onChange={(event) => inspect(event.target.value, fileName)}
            placeholder='{ "format": 1, "name": "My extension", "blocks": [ … ] }'
            aria-label="Manifest JSON"
            spellCheck={false}
            className="h-40 w-full resize-y rounded-xl border border-line bg-panel p-3 font-mono text-[11.5px] leading-5 text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-mint"
          />

          {validation ? (
            <div
              className={`rounded-xl border p-3 text-[12px] leading-5 ${
                validation.ok ? "border-mint/50 bg-mint/10" : "border-rose/50 bg-rose/10"
              }`}
            >
              {validation.ok ? (
                <p className="font-medium text-ink">✓ Manifest is valid — ready to install</p>
              ) : (
                <p className="font-medium text-rose">Manifest validation failed</p>
              )}
              <ul className="mt-1.5 flex flex-col gap-1">
                {validation.errors.map((e) => (
                  <li key={e} className="text-rose">• {e}</li>
                ))}
              </ul>
              {validation.ok ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-fog">
                  <dt>Name</dt><dd className="text-ink">{validation.manifest?.name ?? "—"}</dd>
                  <dt>Blocks</dt><dd className="text-ink">{validation.manifest?.blocks?.length ?? 0}</dd>
                  <dt>Methods</dt><dd className="text-ink">{validation.manifest?.methods?.length ?? 0}</dd>
                  <dt>Events</dt><dd className="text-ink">{validation.manifest?.events?.length ?? 0}</dd>
                  <dt>Components</dt><dd className="text-ink">{validation.manifest?.components?.length ?? 0}</dd>
                  <dt>Dependencies</dt><dd className="text-ink">{validation.manifest?.dependencies?.length ?? 0}</dd>
                </dl>
              ) : null}
              <ul className="mt-1.5 flex flex-col gap-1">
                {validation.warnings.map((w) => (
                  <li key={w} className="text-amber">• {w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose/50 bg-rose/10 p-3 text-[12px] text-rose">{error}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-line px-3 text-[13px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-mint"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!validation?.ok || busy}
              onClick={() => void install()}
              className="h-9 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-mint disabled:opacity-50"
            >
              {busy ? phase ?? "Installing…" : "Install extension"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
