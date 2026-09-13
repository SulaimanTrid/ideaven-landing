import type { Metadata } from "next";
import { LocalizedAuthShell } from "@/components/auth/localized-auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Join Ideaven and start building games and apps — visually or with real code.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <LocalizedAuthShell
      kickerKey="landing.heroBadge"
      titleKey="auth.signupTitle"
      descriptionKey="auth.signupSub"
      footer="signup"
    >
      <RegisterForm />
    </LocalizedAuthShell>
  );
}
