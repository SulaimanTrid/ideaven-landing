"use client";

import { Button, Container } from "@ideaven/ui";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[72vh] items-center justify-center pt-16 pb-24">
      <Container className="max-w-xl text-center">
        <p className="font-mono text-[11px] tracking-[0.3em] text-mist uppercase">
          Something disconnected
        </p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          A wire came loose.
        </h1>
        <p className="mt-4 text-pretty text-lg leading-8 text-fog">
          An unexpected error interrupted this page. Try again — if it
          persists, the problem is on our side.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-mist">
            ref {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
        </div>
      </Container>
    </div>
  );
}
