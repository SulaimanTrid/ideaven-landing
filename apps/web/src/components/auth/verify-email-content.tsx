"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/auth/auth-provider";
import { authApi } from "@/lib/api";
import { FormAlert, SubmitButton } from "@/components/auth/form-alert";
import { FormField, TextInput } from "@/components/auth/form-field";
import { ApiError } from "@/types/auth";

type Phase = "verifying" | "success" | { failed: string };

export function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { refresh, user } = useAuth();

  const [phase, setPhase] = useState<Phase>(token ? "verifying" : { failed: "TOKEN_INVALID" });
  const [resendEmail, setResendEmail] = useState("");
  const [resendPending, setResendPending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authApi
      .verifyEmail(token)
      .then(() => !cancelled && setPhase("success"))
      .catch((err) => {
        if (cancelled) return;
        setPhase({ failed: err instanceof ApiError ? err.code : "TOKEN_INVALID" });
      })
      .finally(() => !cancelled && refresh());
    return () => {
      cancelled = true;
    };
    // refresh is stable; token comes from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onResend(event: FormEvent) {
    event.preventDefault();
    setResendPending(true);
    try {
      await authApi.resendVerification(resendEmail.trim());
      setResendSent(true);
    } finally {
      setResendPending(false);
    }
  }

  if (phase === "verifying") {
    return (
      <p className="text-center text-sm text-fog" role="status">
        Verifying your email…
      </p>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">Your email is verified. Welcome to Ideaven!</FormAlert>
        <Link
          href={user ? "/dashboard" : "/login"}
          className="text-center text-sm font-medium text-violet underline-offset-4 hover:underline"
        >
          {user ? "Go to your dashboard" : "Sign in"}
        </Link>
      </div>
    );
  }

  const failedCode = typeof phase === "object" ? phase.failed : "TOKEN_INVALID";
  return (
    <div className="flex flex-col gap-5">
      <FormAlert tone="error">
        {failedCode === "TOKEN_EXPIRED"
          ? "This verification link has expired. Request a new one below."
          : "This verification link is not valid — it may have been used already. Request a new one below."}
      </FormAlert>

      {resendSent ? (
        <FormAlert tone="success">
          If that address needs verification, a new link is on its way.
        </FormAlert>
      ) : (
        <form onSubmit={onResend} className="flex flex-col gap-3">
          <FormField label="Send a new link to">
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                describedBy={describedBy}
                invalid={invalid}
                placeholder="you@example.com"
              />
            )}
          </FormField>
          <SubmitButton pending={resendPending} pendingLabel="Sending…">
            Resend verification link
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
