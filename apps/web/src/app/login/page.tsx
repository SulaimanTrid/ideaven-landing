import type { Metadata } from "next";
import { LocalizedAuthShell } from "@/components/auth/localized-auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to Ideaven with your email or username to keep building.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <LocalizedAuthShell
      kickerKey="dash.welcome"
      titleKey="auth.loginTitle"
      descriptionKey="auth.loginSub"
      footer="login"
    >
      <LoginForm />
    </LocalizedAuthShell>
  );
}
