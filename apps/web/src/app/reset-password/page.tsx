import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordTokenReader } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your Ideaven account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      kicker="Account recovery"
      title="Choose a new password"
      description="Pick something strong — all other sessions will be signed out."
    >
      {/* useSearchParams requires a Suspense boundary during prerender. */}
      <Suspense fallback={<p className="text-center text-sm text-fog">Loading…</p>}>
        <ResetPasswordTokenReader />
      </Suspense>
    </AuthShell>
  );
}
