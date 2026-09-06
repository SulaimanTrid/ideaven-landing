import type { Metadata } from "next";
import Link from "next/link";

/**
 * Pricing (roadmap 23): the free tier is real and derived from the usage
 * ledger (every successful AI command counts, outages never drain it).
 * Credit packs are described honestly: the ledger and operator-grant CLI
 * exist; the payment provider integration does not, and this page says so.
 */

export const metadata: Metadata = {
  title: "Pricing — Ideaven",
  description: "A real free tier. Credit packs arrive with the payment integration — nothing is sold that cannot be delivered yet.",
};

const FREE_PER_DAY = 20;

const PACKS = [
  {
    name: "Starter pack",
    credits: 100,
    price: "$2",
    note: "Small top-up when a build day runs long.",
  },
  {
    name: "Builder pack",
    credits: 600,
    price: "$10",
    note: "The everyday pack for active projects.",
  },
  {
    name: "Studio pack",
    credits: 2000,
    price: "$30",
    note: "For heavy sessions and long AI-assisted builds.",
  },
];

export default function PricingPage() {
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
        <h2 className="text-lg font-semibold text-ink">Credit packs — designed, not yet sold</h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-6 text-fog">
          These are the planned packs. The credit ledger behind them already
          works end to end (awards, expiry, per-day draw tracking), but the
          payment provider is not integrated yet — so nothing is for sale on
          this page. When the integration ships, these cards become live
          checkouts and this note disappears.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PACKS.map((pack) => (
            <li key={pack.name} className="flex h-full flex-col rounded-2xl border border-line bg-card p-5">
              <h3 className="text-[15px] font-semibold text-ink">{pack.name}</h3>
              <p className="mt-2 text-2xl font-semibold text-violet">{pack.credits} credits</p>
              <p className="mt-1 text-[13px] text-fog">{pack.price} — {pack.note}</p>
              <span className="mt-auto pt-4 text-[11.5px] text-mist">Unavailable — payment integration pending</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-card p-8">
        <h2 className="text-lg font-semibold text-ink">How credits are accounted</h2>
        <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {[
            ["Only success counts", "A command is drawn from the ledger only when the AI provider answered completely."],
            ["Derived balance", "Your balance is computed from the ledger, never stored — it cannot drift from what happened."],
            ["Snapshots for AI changes", "Every applied AI change snapshots your project first and is labelled in History."],
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
      </section>
    </main>
  );
}
