import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { SecurityIdentity } from "@/components/settings/security-identity";

export const metadata: Metadata = {
  title: "Settings — Security",
  robots: { index: false, follow: false },
};

export default function SettingsSecurityPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Email & sign-in identity</h2>
        <p className="mt-1 mb-6 text-sm text-fog">
          Your email is how you sign in and recover the account — it can only
          change through a future email-change flow.
        </p>
        <SecurityIdentity />
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Password</h2>
        <p className="mt-1 mb-6 text-sm text-fog">
          Changing your password signs out every other device. Sessions expire
          after 7 days of inactivity.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
