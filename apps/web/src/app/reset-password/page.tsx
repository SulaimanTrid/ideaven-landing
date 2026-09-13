import type { Metadata } from "next";
import { Suspense } from "react";
import { LocalizedAuthShell } from "@/components/auth/localized-auth-shell";
import { ResetPasswordTokenReader } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your Ideaven account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <LocalizedAuthShell
      kickerKey="auth.resetTitle"
      titleKey="auth.resetTitle"
      descriptionKey="auth.newPassword"
    >
      {/* useSearchParams requires a Suspense boundary during prerender. */}
      <Suspense fallback={<p className="text-center text-sm text-fog">Loading…</p>}>
        <ResetPasswordTokenReader />
      </Suspense>
    </LocalizedAuthShell>
  );
}
