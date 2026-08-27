"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";
import { authApi } from "@/lib/api";
import { ButtonLink, Button } from "@ideaven/ui";

/**
 * Minimal protected profile page — the Phase 3 dashboard replaces its body.
 * Demonstrates: route protection, session persistence, safe user profile,
 * and the email-verification banner flow.
 */
export function DashboardContent() {
  const { user, logout } = useAuth();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [signingOut, setSigningOut] = useState(false);

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

  const created = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lastLogin = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "This session";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-28 pb-20 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Chip tone="mint">Phase 2 · account</Chip>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Welcome, {user.displayName}
          </h1>
          <p className="mt-1 text-fog">
            Your account is live. The project dashboard arrives in the next phase.
          </p>
        </div>
        <ButtonLink href="/" variant="secondary" size="sm">
          Back to home
        </ButtonLink>
      </div>

      {!user.emailVerified && (
        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-amber/30 bg-amber/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-5 text-amber">
            Your email isn&apos;t verified yet — verify it to secure account recovery.
          </p>
          {resendState === "sent" ? (
            <span className="text-[13px] text-amber/80">New link sent — check your inbox.</span>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={resend}
              disabled={resendState === "sending"}
            >
              {resendState === "sending" ? "Sending…" : "Resend link"}
            </Button>
          )}
        </div>
      )}

      <section
        aria-labelledby="profile-heading"
        className="mt-8 overflow-hidden rounded-2xl border border-line bg-card"
      >
        <h2 id="profile-heading" className="sr-only">
          Profile
        </h2>
        <div className="flex items-center gap-4 border-b border-line p-5">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-deep text-lg font-semibold text-white"
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.displayName}</p>
            <p className="truncate text-sm text-mist">@{user.username}</p>
          </div>
          <div className="ml-auto">
            {user.emailVerified ? (
              <Chip tone="mint">Verified</Chip>
            ) : (
              <Chip tone="amber">Unverified</Chip>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          <Row term="Email" detail={user.email} />
          <Row term="Username" detail={`@${user.username}`} />
          <Row term="Member since" detail={created} />
          <Row term="Last sign-in" detail={lastLogin} />
        </dl>
      </section>

      <div className="mt-8 flex items-center justify-between rounded-2xl border border-line bg-panel p-5">
        <div>
          <p className="text-sm font-medium">Signed in on this device</p>
          <p className="mt-0.5 text-[13px] text-mist">
            Sessions expire after 7 days of inactivity.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            setSigningOut(true);
            await logout();
          }}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      <p className="mt-6 text-center text-[13px] text-mist">
        What&apos;s next?{" "}
        <Link href="/#journey" className="text-fog underline underline-offset-4 hover:text-ink">
          See the roadmap
        </Link>
      </p>
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">{term}</dt>
      <dd className="mt-1 truncate text-sm" title={detail}>
        {detail}
      </dd>
    </div>
  );
}
