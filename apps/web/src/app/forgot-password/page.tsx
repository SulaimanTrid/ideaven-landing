import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a password reset link for your Ideaven account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      kicker="Account recovery"
      title="Forgot your password?"
      description="Enter your email and we will send you a reset link."
      footer={
        <>
          Remembered it after all?{" "}
          <Link href="/login" className="font-medium text-violet underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
