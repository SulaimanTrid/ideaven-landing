"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/auth-provider";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, PasswordInput, TextInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n/i18n";

/** Mirrors the backend's rules (apps/api/internal/auth/validate.go). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export function validateRegisterForm(input: {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = input.email.trim();
  const username = input.username.trim();

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  if (!username) errors.username = "Choose a username.";
  else if (!USERNAME_RE.test(username))
    errors.username = "3–32 characters: letters, numbers, underscores, hyphens.";

  if (input.password.length < 8) errors.password = "Passwords are at least 8 characters.";
  else if (input.password.length > 128) errors.password = "Passwords are at most 128 characters.";
  else if (input.password.trim() !== input.password)
    errors.password = "Passwords cannot start or end with whitespace.";

  if (!errors.password && input.confirmPassword !== input.password)
    errors.confirmPassword = "Passwords do not match.";

  if (input.displayName.trim().length > 50)
    errors.displayName = "Display names are at most 50 characters.";

  return errors;
}

export function RegisterForm() {
  const { t } = useI18n();
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function setField(field: keyof typeof form) {
    return (value: string) => {
      setForm((current) => ({ ...current, [field]: value }));
      setFieldErrors((errors) => {
        if (!(field in errors)) return errors;
        const { [field]: _omit, ...rest } = errors;
        return rest;
      });
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const localErrors = validateRegisterForm(form);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await register({
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
      });
      router.replace("/dashboard");
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

      <FormField label={t("auth.email")} error={fieldErrors.email}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={form.email}
            onChange={(e) => setField("email")(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="you@example.com"
          />
        )}
      </FormField>

      <FormField label={t("auth.username")} error={fieldErrors.username} hint="Your public handle — letters, numbers, - and _.">
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="username"
            autoComplete="username"
            required
            value={form.username}
            onChange={(e) => setField("username")(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="blockbuilder"
          />
        )}
      </FormField>

      <FormField label={t("auth.password")} error={fieldErrors.password} hint="At least 8 characters.">
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="new-password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => setField("password")(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="Create a password"
          />
        )}
      </FormField>

      <FormField label={t("auth.password")} error={fieldErrors.confirmPassword}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="confirm-password"
            autoComplete="new-password"
            required
            value={form.confirmPassword}
            onChange={(e) => setField("confirmPassword")(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="Repeat your password"
          />
        )}
      </FormField>

      <FormField label={t("settings.profile")} error={fieldErrors.displayName} hint="Optional — defaults to your username.">
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="displayName"
            value={form.displayName}
            onChange={(e) => setField("displayName")(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="Ada"
          />
        )}
      </FormField>

      <SubmitButton pending={pending} pendingLabel={t("common.loading")}>
        {t("auth.join")}
      </SubmitButton>

      <p className="text-center text-sm text-fog">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-violet underline-offset-4 transition-colors hover:underline"
        >
          {t("auth.signIn")}
        </Link>
      </p>
    </form>
  );
}
