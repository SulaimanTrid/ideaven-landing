"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-provider";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, PasswordInput, TextInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n/i18n";

/** Returns a path that is safe to redirect to (same-site, no protocol tricks). */
export function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

export function LoginForm() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await login({ identifier: identifier.trim(), password });
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
      } else {
        setFormError("Something went wrong. Try again shortly.");
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <FormAlert tone="error">{formError}</FormAlert> : null}

      <FormField label={t("auth.identifier")} error={fieldErrors.identifier}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="identifier"
            autoComplete="username"
            autoFocus
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder={t("auth.identifierPlaceholder")}
          />
        )}
      </FormField>

      <FormField label={t("auth.password")} error={fieldErrors.password}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder={t("auth.passwordPlaceholder")}
          />
        )}
      </FormField>

      <div className="text-right">
        <Link
          href="/forgot-password"
          className="text-[13px] text-fog underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          {t("auth.forgot")}
        </Link>
      </div>

      <SubmitButton pending={pending} pendingLabel={t("common.saving")}>
        {t("auth.signIn")}
      </SubmitButton>

      <p className="text-center text-sm text-fog">
        New to Ideaven?{" "}
        <Link
          href="/register"
          className="font-medium text-violet underline-offset-4 transition-colors hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
