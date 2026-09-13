import type { Metadata } from "next";
import { LocalizedAuthShell } from "@/components/auth/localized-auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a password reset link for your Ideaven account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <LocalizedAuthShell
      kickerKey="auth.forgotTitle"
      titleKey="auth.forgotTitle"
      descriptionKey="auth.forgotSub"
      footer="forgot"
    >
      <ForgotPasswordForm />
    </LocalizedAuthShell>
  );
}
