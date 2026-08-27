import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailContent } from "@/components/auth/verify-email-content";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Confirm your email address to finish setting up Ideaven.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <AuthShell
      kicker="One last step"
      title="Verify your email"
      description="Confirming your address keeps your account recoverable."
    >
      {/* useSearchParams requires a Suspense boundary during prerender. */}
      <Suspense fallback={<p className="text-center text-sm text-fog">Verifying…</p>}>
        <VerifyEmailContent />
      </Suspense>
    </AuthShell>
  );
}
