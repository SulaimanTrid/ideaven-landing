import type { Metadata } from "next";
import { AccountInfo } from "@/components/settings/account-info";
import { CreditHistory } from "@/components/settings/credit-history";

export const metadata: Metadata = {
  title: "Settings — Account",
  robots: { index: false, follow: false },
};

export default function SettingsAccountPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-1 mb-6 text-sm text-fog">
          The facts of your account. Account deletion arrives once its safe
          cascade (sessions, tokens, future projects) is designed.
        </p>
        <AccountInfo />
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">AI credits</h2>
        <p className="mt-1 mb-6 text-sm text-fog">
          Every AI command draws from a free daily allowance, then from pack
          credits. This history is derived from the usage ledger — what
          happened is what you see.
        </p>
        <CreditHistory />
      </section>
    </div>
  );
}
