import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Join Ideaven and start building games and apps — visually or with real code.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthShell
      kicker="Start building"
      title="Create your account"
      description="Every idea deserves a way to exist. Yours starts here."
      footer={
        <>
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
