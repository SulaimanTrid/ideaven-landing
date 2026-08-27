import type { ReactNode } from "react";
import Link from "next/link";
import { Chip, Container, Logo } from "@ideaven/ui";

/**
 * Shared visual shell for the authentication pages: dotted-grid backdrop,
 * centered card, logo return-link. Mirrors the hero/placeholder treatment
 * so the flows feel native to the landing page.
 */
export function AuthShell({
  kicker,
  title,
  description,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 pt-24 pb-16 sm:pt-28">
      <div
        aria-hidden="true"
        className="bg-dots absolute inset-0 [mask-image:radial-gradient(50%_40%_at_50%_40%,black,transparent)]"
      />
      <Container className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link href="/" aria-label="Ideaven — home" className="rounded-md">
            <Logo />
          </Link>
        </div>

        <main className="anim-rise-in rounded-2xl border border-line bg-card p-6 shadow-[0_24px_60px_-32px] shadow-black/60 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <Chip tone="violet">{kicker}</Chip>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-2 text-pretty text-sm leading-6 text-fog">{description}</p>
          </div>
          <div className="mt-7">{children}</div>
        </main>

        {footer ? (
          <footer className="mt-5 text-center text-sm text-fog">{footer}</footer>
        ) : null}
      </Container>
    </div>
  );
}
