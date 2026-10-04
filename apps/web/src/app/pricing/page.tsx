import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@ideaven/ui";
import { API_BASE_URL, type CreditPackage } from "@/lib/api";

/**
 * Pricing (roadmap 23 + TASK 12): the free tier is real and derived from the
 * usage ledger. Credit packs are the SINGLE server-authoritative package
 * definition (the same rows the contextual purchase modal offers) — this
 * page never hardcodes a second copy. When the payment provider is not
 * integrated yet, the packs are shown as designed-but-not-sold, honestly.
 */

export const metadata: Metadata = {
  title: "Pricing — Ideaven",
  description: "A real free tier. Credit packs arrive with the payment integration — nothing is sold that cannot be delivered yet.",
};

const FREE_PER_DAY = 20;

async function loadPricing(): Promise<{ packages: CreditPackage[]; purchaseAvailable: boolean } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/credits/packages`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as { packages: CreditPackage[]; purchaseAvailable: boolean };
  } catch {
    return null;
  }
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: price % 100 === 0 ? 0 : 2,
    }).format(price / 100);
  } catch {
    return `${currency} ${price / 100}`;
  }
}

/** Effective price per credit in major units — kept honest with up to four
 * decimals instead of rounding a fraction of a cent up to a whole one. */
function formatPerCredit(price: number, credits: number, currency: string): string {
  const value = price / credits / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export default async function PricingPage() {
  const pricing = await loadPricing();
  const packages = pricing?.packages ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Pricing</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Free to build. Honest about the rest.</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
        Creating projects, designing screens, wiring blocks, writing code,
        publishing, and exporting are free. Only AI commands draw from credits,
        and every draw is recorded in a ledger you can inspect in your
        account settings.
      </p>

      <section className="mt-10 rounded-2xl border border-mint/40 bg-mint/[0.06] p-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">Free tier</h2>
          <span className="text-2xl font-semibold text-mint">$0</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-fog">
          <strong className="text-ink">{FREE_PER_DAY} AI commands every day</strong>, per
          account. The allowance resets at local midnight and is computed from
          the usage ledger itself — a failed or interrupted AI request never
          consumes it. Past the daily allowance, pack credits (once available)
          would be drawn instead.
        </p>
        <ul className="mt-4 grid max-w-xl grid-cols-1 gap-2 text-[13px] text-fog sm:grid-cols-2">
          <li>✓ Unlimited projects &amp; screens</li>
          <li>✓ Unlimited Design/Blocks/Code editing</li>
          <li>✓ Unlimited preview &amp; publishing</li>
          <li>✓ HTML + Android export</li>
          <li>✓ Version history (20 snapshots per project)</li>
          <li>✓ Community gallery &amp; remixing</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">
          {pricing?.purchaseAvailable ? "Credit packs" : "Credit packs — designed, not yet sold"}
        </h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-6 text-fog">
          {pricing?.purchaseAvailable
            ? "Buy credits as one-time packs — no subscription. When an AI action runs out of credits, the builder offers these packs in place so you can continue right away."
            : "These are the configured packs, served by the same API that powers the builder's contextual purchase modal. The credit ledger behind them already works end to end (awards, expiry, per-day draw tracking, purchase records), but the payment provider is not integrated yet — so nothing is for sale on this page. When the integration ships, these cards become live checkouts and this note disappears."}
        </p>
        {pricing === null ? (
          <p className="mt-6 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-fog">
            The pack list is temporarily unavailable — it comes live from the
            Ideaven service. Please check back shortly.
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {packages.map((pkg) => (
              <li key={pkg.id} className="flex h-full flex-col rounded-2xl border border-line bg-card p-5">
                <h3 className="text-[15px] font-semibold text-ink">{pkg.name}</h3>
                <p className="mt-2 text-2xl font-semibold text-violet">{pkg.credits.toLocaleString("en-US")} credits</p>
                <p className="mt-1 text-[13px] text-fog">
                  {formatPrice(pkg.price, pkg.currency)} — {pkg.tagline}
                </p>
                <span className="mt-auto pt-4 text-[11.5px] text-mist">
                  {pricing.purchaseAvailable
                    ? `Buy in the builder — ${formatPerCredit(pkg.price, pkg.credits, pkg.currency)} per credit`
                    : "Unavailable — payment integration pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-card p-8">
        <h2 className="text-lg font-semibold text-ink">How credits are accounted</h2>
        <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {[
            ["Only success counts", "A command is drawn from the ledger only when the AI provider answered completely."],
            ["Derived balance", "Your balance is computed from the ledger, never stored — it cannot drift from what happened."],
            ["One-time packs, never subscriptions", "Credits arrive as individually purchased packs; a grant is written only after the payment provider's result is verified server-side."],
            ["Visible history", "Settings → Account shows the merged award/consumption feed with your current balance."],
          ].map(([term, detail]) => (
            <div key={term} className="bg-panel px-4 py-3">
              <dt className="text-[13px] font-semibold text-ink">{term}</dt>
              <dd className="mt-1 text-[12.5px] leading-5 text-fog">{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-fog">
          Check your live balance in{" "}
          <Link href="/settings/account" className="text-violet hover:text-ink">
            account settings
          </Link>
          , or{" "}
          <Link href="/register" className="text-violet hover:text-ink">
            create a free account
          </Link>{" "}
          to start building.
        </p>
        {/* TASK 65 §39: the pricing CTA enters the normal creation journey. */}
        <div className="mt-6">
          <ButtonLink href="/start" size="lg">
            Start Building
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
