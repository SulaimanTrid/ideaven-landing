"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { useI18n, type TranslationKey } from "@/lib/i18n/i18n";

/**
 * Client wrapper around AuthShell (TASK 10): the auth pages are server
 * components, so their copy flows through this translator keyed by
 * dictionary keys.
 */
export function LocalizedAuthShell({
  kickerKey,
  titleKey,
  descriptionKey,
  footer,
  children,
}: {
  kickerKey: TranslationKey;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  /** Known footer variants, fully translated inside this client component. */
  footer?: "login" | "signup" | "forgot";
  children: ReactNode;
}) {
  const { t } = useI18n();
  const footers: Record<string, ReactNode> = {
    login: (
      <>
        {t("auth.newHere")}{" "}
        <Link href="/register" className="font-medium text-violet underline-offset-4 hover:underline">
          {t("auth.createAccount")}
        </Link>
      </>
    ),
    signup: (
      <>
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-violet underline-offset-4 hover:underline">
          {t("auth.signIn")}
        </Link>
      </>
    ),
    forgot: (
      <>
        Remembered it after all?{" "}
        <Link href="/login" className="font-medium text-violet underline-offset-4 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </>
    ),
  };
  return (
    <AuthShell
      kicker={t(kickerKey)}
      title={t(titleKey)}
      description={t(descriptionKey)}
      footer={footer ? footers[footer] : undefined}
    >
      {children}
    </AuthShell>
  );
}
