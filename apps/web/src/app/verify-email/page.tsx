import type { Metadata } from "next";
import { Suspense } from "react";
import { LocalizedAuthShell } from "@/components/auth/localized-auth-shell";
import { VerifyEmailContent } from "@/components/auth/verify-email-content";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Confirm your email address to finish setting up Ideaven.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <LocalizedAuthShell
      kickerKey="auth.verifyTitle"
      titleKey="auth.verifyTitle"
      descriptionKey="auth.verifyTitle"
    >
      {/* useSearchParams requires a Suspense boundary during prerender. */}
      <Suspense fallback={<p className="text-center text-sm text-fog">Verifying…</p>}>
        <VerifyEmailContent />
      </Suspense>
    </LocalizedAuthShell>
  );
}
