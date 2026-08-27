"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, PasswordInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";

type TokenState = { phase: "checking" } | { phase: "valid" } | { phase: "invalid"; code: string };

export function ResetPasswordForm({ token }: { token: string }) {
  const [tokenState, setTokenState] = useState<TokenState>(
    token ? { phase: "checking" } : { phase: "invalid", code: "TOKEN_INVALID" },
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reject dead links before asking the user to type a new password.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authApi
      .validateResetToken(token)
      .then(() => !cancelled && setTokenState({ phase: "valid" }))
      .catch((err) => {
        if (cancelled) return;
        setTokenState({
          phase: "invalid",
          code: err instanceof ApiError ? err.code : "TOKEN_INVALID",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (password.length < 8) errors.password = "Passwords are at least 8 characters.";
    else if (password.trim() !== password)
      errors.password = "Passwords cannot start or end with whitespace.";
    if (!errors.password && confirmPassword !== password)
      errors.confirmPassword = "Passwords do not match.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
        if (err.code === "TOKEN_INVALID" || err.code === "TOKEN_EXPIRED") {
          setTokenState({ phase: "invalid", code: err.code });
        }
      } else {
        setFormError("Something went wrong. Try again shortly.");
      }
    } finally {
      setPending(false);
    }
  }

  if (tokenState.phase === "checking") {
    return (
      <p className="text-center text-sm text-fog" role="status">
        Checking your reset link…
      </p>
    );
  }

  if (tokenState.phase === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="error">
          {tokenState.code === "TOKEN_EXPIRED"
            ? "This reset link has expired. Request a new one to continue."
            : "This reset link is not valid — it may have been used already. Request a new one to continue."}
        </FormAlert>
        <Link
          href="/forgot-password"
          className="text-center text-sm font-medium text-violet underline-offset-4 hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">
          Your password has been updated and other sessions were signed out.
        </FormAlert>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-violet underline-offset-4 hover:underline"
        >
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <FormAlert tone="error">{formError}</FormAlert> : null}

      <FormField label="New password" error={fieldErrors.password} hint="At least 8 characters.">
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="new-password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="Create a new password"
          />
        )}
      </FormField>

      <FormField label="Confirm new password" error={fieldErrors.confirmPassword}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="confirm-password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
            placeholder="Repeat your new password"
          />
        )}
      </FormField>

      <SubmitButton pending={pending} pendingLabel="Resetting password…">
        Reset password
      </SubmitButton>
    </form>
  );
}

/** Reads the reset token from the URL — useSearchParams requires a client component. */
export function ResetPasswordTokenReader() {
  const token = useSearchParams().get("token") ?? "";
  return <ResetPasswordForm token={token} />;
}
