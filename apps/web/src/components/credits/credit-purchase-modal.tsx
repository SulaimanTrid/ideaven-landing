"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { aiApi, creditApi, type CreditPackage, type InsufficientCreditsData } from "@/lib/api";
import { useI18n } from "@/lib/i18n/i18n";
import { IconCheck, IconClose, IconSparkle } from "@/components/visuals/icons";

/**
 * The contextual credit purchase modal (TASK 12): it opens when the server
 * blocks an AI action with a structured 402 and explains the situation in
 * place — what the next action needs, what the balance is, and which pack
 * continues the work. It is a checkout helper, NOT a pricing page: packs
 * come from the server's single package definition, prices are never client
 * data, and when payment is not integrated yet the modal says so honestly —
 * no fake success, no fake credits, ever.
 */

export type PurchaseModalPhase =
  | "idle" // packs listed, none bought yet
  | "checkout" // redirecting to the provider's hosted checkout
  | "processing" // waiting for the verified payment result
  | "success" // verified — credits granted
  | "failed" // payment failed — nothing granted
  | "cancelled" // user aborted at the provider — nothing granted
  | "unavailable"; // no payment provider configured (honest)

interface CreditPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  /** Safe numbers from the server's 402 (fetched live when absent). */
  info?: InsufficientCreditsData | null;
  /** Purchase id from a hosted-checkout return (?purchase=…) to resume polling. */
  initialPurchaseId?: string | null;
  /** Runs the interrupted AI action after a verified purchase — the user's
   * explicit "Continue with AI" confirmation. Defaults to the
   * ideaven:ai-retry event the Ask AI panel listens for. */
  onContinue?: () => void;
}

/** Fired after a VERIFIED purchase grants credits, so balance displays
 * (Ask AI panel, top bar) re-read the ledger. */
export const CREDITS_UPDATED_EVENT = "ideaven:credits-updated";

function announceCreditsUpdated() {
  window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT));
}

export function CreditPurchaseModal({
  open,
  onClose,
  info,
  initialPurchaseId,
  onContinue,
}: CreditPurchaseModalProps) {
  const { t, locale } = useI18n();
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [packagesFailed, setPackagesFailed] = useState(false);
  const [purchaseAvailable, setPurchaseAvailable] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<PurchaseModalPhase>("idle");
  const [addedCredits, setAddedCredits] = useState(0);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [context, setContext] = useState<InsufficientCreditsData | null>(info ?? null);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Live numbers when the caller had no 402 metadata (e.g. opened from the
  // top bar with an empty balance): the API remains the source of truth.
  useEffect(() => {
    if (!open || context) return;
    let alive = true;
    aiApi
      .credits()
      .then(({ credits }) => {
        if (!alive) return;
        setContext({
          remaining: credits.remaining,
          required: 1,
          packBalance: credits.packBalance,
          freeRemaining: credits.freeRemaining,
          purchaseAvailable: false,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, context]);

  // Package data is server-authoritative: fetched fresh each open, never
  // hardcoded here.
  useEffect(() => {
    if (!open) return;
    setPackages(null);
    setPackagesFailed(false);
    let alive = true;
    creditApi
      .packages()
      .then((res) => {
        if (!alive) return;
        setPackages(res.packages);
        setPurchaseAvailable(res.purchaseAvailable);
        setPhase(res.purchaseAvailable ? "idle" : "unavailable");
        if (!res.purchaseAvailable) {
          setSelected(null);
        }
      })
      .catch(() => {
        if (!alive) return;
        setPackagesFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // A hosted-checkout return resumes polling the purchase record: only the
  // server's verified status ever produces a success state.
  useEffect(() => {
    if (!open || !initialPurchaseId) return;
    setPendingPurchaseId(initialPurchaseId);
    setPhase("processing");
  }, [open, initialPurchaseId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll until the purchase leaves pending. Failed/cancelled land honestly;
  // succeeded requires the server's webhook-verified status.
  useEffect(() => {
    if (!open || phase !== "processing" || !pendingPurchaseId) return;
    let alive = true;
    let elapsed = 0;
    const tick = () => {
      elapsed += 2000;
      creditApi
        .purchase(pendingPurchaseId)
        .then(({ purchase }) => {
          if (!alive) return;
          if (purchase.status === "pending" && elapsed < 120000) return;
          stopPolling();
          if (purchase.status === "succeeded") {
            setAddedCredits(purchase.credits);
            aiApi
              .credits()
              .then(({ credits }) => {
                if (alive) setNewBalance(credits.remaining);
              })
              .catch(() => {});
            setPhase("success");
            announceCreditsUpdated();
          } else if (purchase.status === "failed") {
            setPhase("failed");
          } else if (purchase.status === "cancelled") {
            setPhase("cancelled");
          } else {
            setActionError(t("credits.confirmTimeout"));
            setPhase("failed");
          }
        })
        .catch(() => {
          // Transient network errors during polling are not terminal; the
          // next tick retries until the deadline.
          if (elapsed >= 120000) {
            stopPolling();
            setActionError(t("credits.confirmTimeout"));
            setPhase("failed");
          }
        });
    };
    pollRef.current = window.setInterval(tick, 2000);
    tick();
    return () => {
      alive = false;
      stopPolling();
    };
  }, [open, phase, pendingPurchaseId, stopPolling, t]);

  const startCheckout = useCallback(async () => {
    if (!selected) return;
    setActionError(null);
    setPhase("checkout");
    try {
      const { purchase } = await creditApi.createPurchase(
        selected,
        `${window.location.pathname}${window.location.search}`,
      );
      // Hosted checkout is a full navigation; the provider returns the user
      // to the builder with ?purchase=<id> and the modal resumes polling.
      if (purchase.checkoutUrl) {
        window.location.href = purchase.checkoutUrl;
        return;
      }
      // A checkout without a URL is a provider contract violation — never
      // pretend it started.
      setActionError(t("credits.checkoutError"));
      setPhase("idle");
    } catch {
      setActionError(t("credits.checkoutError"));
      setPhase("idle");
    }
  }, [selected, t]);

  const retryFromPacks = useCallback(() => {
    setActionError(null);
    setPhase(purchaseAvailable ? "idle" : "unavailable");
    setSelected(null);
    setPendingPurchaseId(null);
  }, [purchaseAvailable]);

  // Reset transient state between opens so a re-open is always truthful.
  useEffect(() => {
    if (open) return;
    stopPolling();
    setPhase("idle");
    setSelected(null);
    setActionError(null);
    setAddedCredits(0);
    setNewBalance(null);
    setPendingPurchaseId(null);
    setContext(info ?? null);
  }, [open, info, stopPolling]);

  const formatPrice = useCallback(
    (price: number, currency: string, perCredit = false) => {
      // perCredit receives the value already divided (major units, often a
      // fraction of a cent) — it keeps up to 4 decimals so the effective
      // price per credit never lies by rounding up to a whole cent.
      const value = perCredit ? price : price / 100;
      try {
        return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
          style: "currency",
          currency,
          currencyDisplay: "narrowSymbol",
          maximumFractionDigits: perCredit ? 4 : price % 100 === 0 ? 0 : 2,
          minimumFractionDigits: perCredit ? 0 : price % 100 === 0 ? 0 : 2,
        }).format(value);
      } catch {
        // Unknown currency code: show the amount with the code.
        return `${currency} ${value}`;
      }
    },
    [locale],
  );

  // ---- dialog a11y: focus trap, escape, restore -----------------------------------

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = "";
      window.clearTimeout(focusTimer);
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const remaining = context?.remaining ?? 0;
  const required = context?.required ?? 1;
  const empty = remaining === 0;
  const busy = phase === "checkout" || phase === "processing";
  const titleId = "credit-purchase-title";
  const descId = "credit-purchase-desc";

  const contextual = {
    title: empty ? t("credits.titleEmpty") : t("credits.titleLow"),
    body: empty ? t("credits.subtitleEmpty") : t("credits.subtitleLow"),
  };
  const headings: Record<PurchaseModalPhase, { title: string; body: string }> = {
    idle: contextual,
    unavailable: contextual,
    checkout: { title: t("credits.checkoutTitle"), body: t("credits.redirecting") },
    processing: { title: t("credits.checkoutTitle"), body: t("credits.processing") },
    success: { title: t("credits.successTitle"), body: t("credits.successBody") },
    failed: { title: t("credits.failedTitle"), body: t("credits.failedBody") },
    cancelled: { title: t("credits.cancelledTitle"), body: t("credits.cancelledBody") },
  };
  const heading = headings[phase];

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="anim-rise-in relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint sm:rounded-2xl"
      >
        <button
          type="button"
          aria-label={t("credits.close")}
          onClick={onClose}
          disabled={busy}
          className="absolute top-3.5 right-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
        >
          <IconClose size={16} />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {phase === "success" ? (
            <div aria-live="polite">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint/15 text-mint">
                <IconCheck size={22} />
              </span>
              <h2 id={titleId} className="mt-4 text-lg font-semibold tracking-tight text-ink">
                {heading.title}
              </h2>
              <p id={descId} className="mt-1 text-[13.5px] leading-6 text-fog">
                {addedCredits} {t("credits.successBodyDetail")}
              </p>
              {newBalance !== null ? (
                <p className="mt-3 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-fog">
                  {t("credits.newBalance")}{" "}
                  <span className="font-mono text-base font-semibold text-ink">{newBalance}</span>
                </p>
              ) : null}
            </div>
          ) : phase === "failed" || phase === "cancelled" ? (
            <div aria-live="assertive">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose/15 text-rose">
                <IconClose size={20} />
              </span>
              <h2 id={titleId} className="mt-4 text-lg font-semibold tracking-tight text-ink">
                {heading.title}
              </h2>
              <p id={descId} className="mt-1 text-[13.5px] leading-6 text-fog">
                {heading.body}
              </p>
              {actionError ? <p className="mt-2 text-[12.5px] text-rose">{actionError}</p> : null}
            </div>
          ) : phase === "checkout" || phase === "processing" ? (
            <div aria-live="polite" className="py-8 text-center">
              <span className="anim-pulse-dot mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-violet/15 text-violet">
                <IconSparkle size={20} />
              </span>
              <h2 id={titleId} className="mt-4 text-lg font-semibold tracking-tight text-ink">
                {heading.title}
              </h2>
              <p id={descId} className="mt-1 text-[13.5px] leading-6 text-fog">
                {heading.body}
              </p>
              <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-mist uppercase">
                {t("credits.secureNotice")}
              </p>
            </div>
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet/15 text-violet">
                <IconSparkle size={20} />
              </span>
              <h2 id={titleId} className="mt-4 text-lg font-semibold tracking-tight text-ink">
                {heading.title}
              </h2>
              <p id={descId} className="mt-1 text-[13.5px] leading-6 text-fog">
                {heading.body}
              </p>

              {/* Contextual numbers straight from the server's 402. */}
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
                <div className="bg-card px-4 py-3">
                  <dt className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                    {t("credits.nextNeeds")}
                  </dt>
                  <dd className="mt-1 font-mono text-lg font-semibold text-ink">{required}</dd>
                </div>
                <div className="bg-card px-4 py-3">
                  <dt className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                    {t("credits.currentBalance")}
                  </dt>
                  <dd
                    className={`mt-1 font-mono text-lg font-semibold ${
                      empty ? "text-rose" : "text-amber"
                    }`}
                  >
                    {remaining}
                  </dd>
                </div>
              </dl>

              <h3 className="mt-5 font-mono text-[11px] tracking-[0.14em] text-mist uppercase">
                {t("credits.choosePack")}
              </h3>

              {packagesFailed ? (
                <p className="mt-3 text-[13px] text-fog">{t("credits.packagesError")}</p>
              ) : packages === null ? (
                <p className="mt-3 text-[13px] text-mist" role="status">
                  {t("common.loading")}
                </p>
              ) : packages.length === 0 ? (
                <p className="mt-3 text-[13px] text-fog">{t("credits.noPackages")}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {packages.map((pkg) => {
                    const active = selected === pkg.id;
                    const affordable = pkg.credits >= required;
                    return (
                      <li key={pkg.id}>
                        <button
                          type="button"
                          onClick={() => purchaseAvailable && setSelected(pkg.id)}
                          disabled={!purchaseAvailable}
                          aria-pressed={active}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                            active
                              ? "border-violet bg-violet/10"
                              : "border-line bg-card hover:border-violet/50"
                          } ${purchaseAvailable ? "" : "cursor-not-allowed opacity-60"}`}
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-ink">
                                {pkg.credits.toLocaleString(locale === "id" ? "id-ID" : "en-US")}{" "}
                                {t("credits.creditsUnit")}
                              </span>
                              {pkg.popular ? (
                                <span className="rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 text-[10px] font-medium text-mint">
                                  {t("credits.popular")}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-[12px] text-fog">
                              {pkg.tagline}
                            </span>
                            {!affordable ? (
                              <span className="mt-0.5 block text-[11px] text-amber">
                                {t("credits.belowRequired")}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[14px] font-semibold text-ink">
                              {formatPrice(pkg.price, pkg.currency)}
                            </span>
                            <span className="block text-[10.5px] text-mist">
                              {formatPrice(pkg.price / pkg.credits / 100, pkg.currency, true)}/
                              {t("credits.perCredit")}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {phase === "unavailable" ? (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[12.5px] leading-5 text-amber"
                >
                  {t("credits.unavailable")}
                </p>
              ) : null}
              {actionError ? (
                <p role="alert" className="mt-4 text-[12.5px] text-rose">
                  {actionError}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Focused footer actions per phase — never a pricing page in a modal. */}
        <div className="shrink-0 border-t border-line bg-panel p-4">
          {phase === "success" ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-line px-4 text-[13px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onContinue) onContinue();
                  else window.dispatchEvent(new CustomEvent("ideaven:ai-retry"));
                }}
                className="h-10 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.continueAI")}
              </button>
            </div>
          ) : phase === "failed" ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-line px-4 text-[13px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.close")}
              </button>
              <button
                type="button"
                onClick={retryFromPacks}
                className="h-10 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.tryAgain")}
              </button>
            </div>
          ) : phase === "cancelled" ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-line px-4 text-[13px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.close")}
              </button>
              <button
                type="button"
                onClick={retryFromPacks}
                className="h-10 rounded-lg border border-violet/50 bg-violet/10 px-4 text-[13px] font-medium text-violet transition-colors hover:bg-violet/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.backToPacks")}
              </button>
            </div>
          ) : phase === "checkout" || phase === "processing" ? (
            <p className="text-center text-[12px] text-mist">{t("credits.doNotClose")}</p>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/pricing"
                className="rounded-lg px-2 py-1.5 text-[12.5px] text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("credits.viewPricing")}
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 rounded-lg border border-line px-4 text-[13px] font-medium text-fog transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  {t("credits.close")}
                </button>
                {phase !== "unavailable" ? (
                  <button
                    type="button"
                    onClick={() => void startCheckout()}
                    disabled={!selected}
                    className="h-10 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:pointer-events-none disabled:opacity-40"
                  >
                    {t("credits.buy")}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
