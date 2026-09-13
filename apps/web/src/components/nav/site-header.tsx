"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, ButtonLink, Container, Logo } from "@ideaven/ui";
import { IconClose, IconMenu } from "@/components/visuals/icons";
import { Avatar } from "@/components/profile/avatar";
import { ThemeToggle } from "@/theme/theme-toggle";
import { useAuth } from "@/auth/auth-provider";

const NAV_LINKS = [
  { labelKey: "nav.learn", href: "/#journey" },
  { labelKey: "nav.explore", href: "/#explore" },
  { labelKey: "nav.community", href: "/community" },
  { labelKey: "nav.pricing", href: "/pricing" },
] as const;

const USER_LINKS = [
  { labelKey: "dash.home", href: "/dashboard" },
  { labelKey: "dash.projects", href: "/dashboard/projects" },
  { labelKey: "dash.settings", href: "/settings" },
] as const;

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const firstMobileLink = useRef<HTMLAnchorElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { status, user, logout } = useAuth();

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

  // Close the user menu on Escape or outside pointer interaction.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      // No navigation here: on public pages the header simply flips back;
      // protected pages are redirected by <RequireAuth> to /login?next=….
      await logout();
      setMenuOpen(false);
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  // Workspace routes carry their own sidebar chrome — no marketing header.
  // Checked after every hook so the hook order never changes between renders.
  if (pathname?.startsWith("/dashboard") || pathname?.startsWith("/builder")) return null;

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
              <li key={t(link.labelKey)}>
                <Link
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm text-fog transition-colors hover:text-ink"
                >
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher compact />
          {authenticated ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-controls="user-menu"
                aria-label="Account menu"
                onClick={() => setMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                <Avatar
                  displayName={user?.displayName ?? "?"}
                  avatarUrl={user?.avatarUrl}
                  size="sm"
                />
                <span className="max-w-32 truncate text-sm text-fog">
                  {user?.displayName}
                </span>
              </button>
              {menuOpen ? (
                <div
                  id="user-menu"
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-canvas shadow-xl shadow-black/40"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-sm font-medium">{user?.displayName}</p>
                    <p className="truncate text-[12px] text-mist">@{user?.username}</p>
                  </div>
                  <ul className="p-1.5">
                    {USER_LINKS.map((link) => (
                      <li key={link.href} role="none">
                        <Link
                          role="menuitem"
                          href={link.href}
                          onClick={() => setMenuOpen(false)}
                          className="block rounded-lg px-3 py-2 text-sm text-fog transition-colors hover:bg-surface hover:text-ink"
                        >
                          {t(link.labelKey)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line p-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-fog transition-colors hover:bg-surface hover:text-ink disabled:opacity-60"
                    >
                      {signingOut ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
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
              <li key={t(link.labelKey)}>
                <Link
                  ref={index === 0 ? firstMobileLink : undefined}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-[15px] text-fog transition-colors hover:bg-surface hover:text-ink"
                >
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line px-3 py-2">
            <span className="text-[13px] text-fog">Theme</span>
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
          <div className="mt-3 flex flex-col gap-2 pb-1">
            {authenticated ? (
              <>
                {USER_LINKS.map((link) => (
                  <ButtonLink
                    key={link.href}
                    variant="secondary"
                    href={link.href}
                    onClick={() => setOpen(false)}
                  >
                    {t(link.labelKey)}
                  </ButtonLink>
                ))}
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
