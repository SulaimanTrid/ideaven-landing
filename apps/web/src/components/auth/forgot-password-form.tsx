"use client";

import { useState, type FormEvent } from "react";
import { authApi } from "@/lib/api";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, TextInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setPending(true);
    setFormError(null);
    setFieldError(undefined);
    try {
      await authApi.forgotPassword(trimmed);
      setSent(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Try again shortly.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">
          If an account exists for {email.trim()}, a reset link is on its way. Check your inbox (and
          spam folder).
        </FormAlert>
        <p className="text-center text-[13px] leading-6 text-mist">
          The link is valid for 1 hour and can be used once.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <FormAlert tone="error">{formError}</FormAlert> : null}

      <FormField label="Email" error={fieldError}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="you@example.com"
          />
        )}
      </FormField>

      <SubmitButton pending={pending} pendingLabel="Sending reset link…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
