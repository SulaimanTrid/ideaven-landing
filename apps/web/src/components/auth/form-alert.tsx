"use client";

import type { ReactNode } from "react";
import { Button } from "@ideaven/ui";
import { cn } from "@ideaven/ui";

/** Inline banner for form-level outcomes. */
export function FormAlert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const tones = {
    error: "border-rose/30 bg-rose/10 text-rose",
    success: "border-mint/30 bg-mint/10 text-mint",
    info: "border-sky/30 bg-sky/10 text-sky",
  } as const;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3.5 py-2.5 text-[13px] leading-5",
        tones[tone],
      )}
    >
      {children}
    </div>
  );
}

/**
 * Submit button with a communicated loading state (label swap + disabled +
 * aria-busy), matching the @ideaven/ui Button API.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  className,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      aria-busy={pending}
      className={cn("w-full", className)}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" className="animate-spin">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M13 7A6 6 0 0 0 7 1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
