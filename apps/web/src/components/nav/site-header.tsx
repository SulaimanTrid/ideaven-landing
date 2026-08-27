"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, ButtonLink, Container, Logo } from "@ideaven/ui";
import { IconClose, IconMenu } from "@/components/visuals/icons";
import { useAuth } from "@/auth/auth-provider";

const NAV_LINKS = [
  { label: "Learn", href: "/#journey" },
  { label: "Explore", href: "/#explore" },
  { label: "Community", href: "/community" },
  { label: "Pricing", href: "/pricing" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const firstMobileLink = useRef<HTMLAnchorElement>(null);
  const { status, logout } = useAuth();

  const authenticated = status === "authenticated";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    firstMobileLink.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      // No navigation here: on public pages the header simply flips back;
      // protected pages are redirected by <RequireAuth> to /login?next=….
      await logout();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-line bg-canvas/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <Container className="relative flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="Ideaven — home" className="rounded-md">
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 md:block"
        >
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm text-fog transition-colors hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {authenticated ? (
            <>
              <ButtonLink variant="ghost" size="sm" href="/dashboard">
                Dashboard
              </ButtonLink>
              <Button size="sm" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </>
          ) : (
            <>
              <ButtonLink variant="ghost" size="sm" href="/login">
                Log in
              </ButtonLink>
              <ButtonLink size="sm" href="/start">
                Start Building
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <IconClose size={18} /> : <IconMenu size={18} />}
        </button>
      </Container>

      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-line bg-canvas/95 backdrop-blur-md md:hidden"
      >
        <Container className="py-4">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link, index) => (
              <li key={link.label}>
                <Link
                  ref={index === 0 ? firstMobileLink : undefined}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-[15px] text-fog transition-colors hover:bg-white/5 hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 pb-1">
            {authenticated ? (
              <>
                <ButtonLink
                  variant="secondary"
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                >
                  Dashboard
                </ButtonLink>
                <Button onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? "Signing out…" : "Sign out"}
                </Button>
              </>
            ) : (
              <>
                <ButtonLink
                  variant="secondary"
                  href="/login"
                  onClick={() => setOpen(false)}
                >
                  Log in
                </ButtonLink>
                <ButtonLink href="/start" onClick={() => setOpen(false)}>
                  Start Building
                </ButtonLink>
              </>
            )}
          </div>
        </Container>
      </div>
    </header>
  );
}
