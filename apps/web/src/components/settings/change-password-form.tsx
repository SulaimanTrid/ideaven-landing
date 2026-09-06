"use client";

import { useState, type FormEvent } from "react";
import { authApi } from "@/lib/api";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, PasswordInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";

/**
 * Changes the signed-in user's password. The server verifies the current
 * password, applies the new one, and signs out every other device — the
 * banner explains that behavior so it never surprises anyone.
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);
    setFieldErrors({});

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: "The two new passwords do not match." });
      return;
    }

    setPending(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.details) {
          setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        }
      } else {
        setFormError("Something went wrong. Try again shortly.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {formError ? <FormAlert tone="error">{formError}</FormAlert> : null}
      {saved ? (
        <FormAlert tone="success">
          Password updated. Other devices have been signed out — this one stays signed in.
        </FormAlert>
      ) : null}

      <FormField label="Current password" error={fieldErrors.currentPassword}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            name="currentPassword"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            describedBy={describedBy}
            invalid={invalid}
          />
        )}
      </FormField>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="New password" error={fieldErrors.password} hint="At least 8 characters.">
          {({ id, describedBy, invalid }) => (
            <PasswordInput
              id={id}
              name="newPassword"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              describedBy={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField label="Confirm new password" error={fieldErrors.confirmPassword}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput
              id={id}
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              describedBy={describedBy}
              invalid={invalid}
            />
          )}
        </FormField>
      </div>

      <SubmitButton pending={pending} pendingLabel="Updating…" className="w-full sm:w-auto sm:self-start">
        Update password
      </SubmitButton>
    </form>
  );
}
