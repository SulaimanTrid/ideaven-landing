"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import QRCode from "qrcode";
import { projectApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import { useBuilder } from "./builder-context";
import { validateModel } from "./export-button";

/**
 * Publish (roadmap 19): snapshots the current model server-side and opens
 * /p/<slug>. The snapshot is what visitors see — edits stay private until a
 * republish, and unpublishing removes the public page immediately.
 */
export function PublishButton() {
  const { t } = useI18n();
  const { project, model, saveNow } = useBuilder();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(project.status === "published");
  const [publicPath, setPublicPath] = useState<string | null>(
    project.status === "published" ? `/p/${project.slug}` : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Live test on a phone (the honest companion): the published page IS the
  // app — scan the QR to open it on any device immediately.
  useEffect(() => {
    if (!publicPath) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(`${window.location.origin}${publicPath}`, {
      margin: 1,
      width: 220,
      color: { dark: "#0b0e16", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [publicPath]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      // The snapshot must be the model the user is looking at: save first.
      await saveNow();
      const result = await projectApi.publish(project.id);
      setPublished(true);
      setPublicPath(result.publicPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish. Try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await projectApi.unpublish(project.id);
      setPublished(false);
      setPublicPath(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not unpublish. Try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
          published
            ? "border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
            : "border-sky/40 bg-sky/10 text-sky hover:bg-sky/20"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
        <span className="hidden sm:inline">{published ? t("builder.saved") : t("builder.publish")}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[92vw] rounded-xl border border-line bg-card p-4 shadow-2xl">
          <h3 className="text-[13px] font-semibold">Publish</h3>
          {published ? (
            <>
              <p className="mt-1 text-[12px] leading-5 text-fog">
                Your project is live. Visitors see the published snapshot —
                edits stay private until you republish.
              </p>
              {publicPath ? (
                <>
                  <a
                    href={publicPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex h-8 items-center justify-center rounded-lg bg-violet-deep text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                  >
                    Open public page ↗
                  </a>
                  {qr ? (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- locally generated QR data URL */}
                      <img src={qr} alt="QR code to open this project on a phone" className="h-24 w-24 rounded-md" />
                      <p className="text-[11.5px] leading-4 text-fog">
                        <span className="font-medium text-ink">Test on your phone.</span>{" "}
                        Scan this — it opens the live app right now, no install
                        needed.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={busy}
                  className="h-8 flex-1 rounded-lg border border-line px-3 text-[12px] text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
                >
                  {busy ? "…" : "Republish latest"}
                </button>
                <button
                  type="button"
                  onClick={() => void unpublish()}
                  disabled={busy}
                  className="h-8 rounded-lg border border-rose/40 px-3 text-[12px] text-rose transition-colors hover:bg-rose/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
                >
                  Unpublish
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-[12px] leading-5 text-fog">
                Publishing snapshots your project and opens a public page at{" "}
                <span className="font-mono text-[11px]">/p/{project.slug}</span>. Draft →
                validate → confirm — nothing goes public until you do.
              </p>
              {(() => {
                const issues = validateModel(model);
                const errors = issues.filter((i) => i.severity === "error");
                return (
                  <div
                    className={`mt-2 rounded-lg border p-2.5 text-[11.5px] leading-4 ${
                      errors.length > 0 ? "border-rose/50 bg-rose/10" : "border-mint/50 bg-mint/10"
                    }`}
                  >
                    <p className="font-medium text-ink">
                      {errors.length > 0 ? "Validation found problems" : "✓ Validation passed"}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {errors.map((i) => (
                        <li key={i.message} className="text-rose">• {i.message}</li>
                      ))}
                      {issues
                        .filter((i) => i.severity === "warning")
                        .map((i) => (
                          <li key={i.message} className="text-amber">• {i.message}</li>
                        ))}
                      {errors.length === 0 ? (
                        <li className="text-fog">• {model.screens.length} screen{model.screens.length === 1 ? "" : "s"} · start screen ok · model is exportable</li>
                      ) : null}
                    </ul>
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy || validateModel(model).some((i) => i.severity === "error")}
                className="mt-3 h-8 w-full rounded-lg bg-violet-deep text-[12px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
              >
                {busy ? "Publishing…" : "Publish to the web"}
              </button>
            </>
          )}
          {error ? <p className="mt-2 text-[11.5px] text-rose">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
