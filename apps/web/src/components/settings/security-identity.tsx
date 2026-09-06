"use client";

import { useState } from "react";
import { Chip, Button } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";
import { authApi } from "@/lib/api";

/** Email identity card: address, verification state, and resend action. */
export function SecurityIdentity() {
  const { user, refresh } = useAuth();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  if (!user) return null;

  const resend = async () => {
    setResendState("sending");
    try {
      await authApi.resendVerification(user.email);
      setResendState("sent");
    } catch {
      setResendState("idle");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        <div className="bg-panel px-4 py-3">
          <dt className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">Email</dt>
          <dd className="mt-1 truncate text-sm" title={user.email}>
            {user.email}
          </dd>
        </div>
        <div className="bg-panel px-4 py-3">
          <dt className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">Status</dt>
          <dd className="mt-1">
            {user.emailVerified ? <Chip tone="mint">Verified</Chip> : <Chip tone="amber">Unverified</Chip>}
          </dd>
        </div>
      </dl>

      {!user.emailVerified && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-5 text-amber">
            Verify your email to secure account recovery.
          </p>
          {resendState === "sent" ? (
            <span className="text-[13px] text-amber/80">New link sent — check your inbox.</span>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={resend}
              disabled={resendState === "sending"}
              className="sm:self-start"
            >
              {resendState === "sending" ? "Sending…" : "Resend verification link"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
