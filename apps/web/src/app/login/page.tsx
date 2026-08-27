import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to Ideaven with your email or username to keep building.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      kicker="Welcome back"
      title="Log in"
      description="Sign in to pick up right where you left off."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-violet underline-offset-4 hover:underline">
            Create an account
          </Link>{" "}
          — it takes a minute.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
