"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { ThemeToggle } from "@/theme/theme-toggle";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";
import { Avatar } from "@/components/profile/avatar";
import {
  IconBlocks,
  IconClose,
  IconHome,
  IconMenu,
  IconSettings,
  IconSignOut,
  IconTemplates,
  IconUsers,
} from "@/components/visuals/icons";

/**
 * Workspace chrome for authenticated areas: a fixed sidebar on desktop and a
 * slide-over drawer on smaller screens. The marketing header/footer stay out
 * of workspace routes so this shell is the product surface.
 */

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** True when the route lives outside the workspace chrome. */
  external?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: IconHome },
  { label: "Projects", href: "/dashboard/projects", icon: IconBlocks },
  { label: "Templates", href: "/dashboard/templates", icon: IconTemplates },
  { label: "Extensions", href: "/dashboard/extensions", icon: IconTemplates },
  { label: "Community", href: "/community", icon: IconUsers, external: true },
  { label: "Settings", href: "/settings", icon: IconSettings, external: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({
  pathname,
  onNavigate,
  firstLinkRef,
}: {
  pathname: string;
  onNavigate?: () => void;
  firstLinkRef?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item, index) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              ref={index === 0 ? firstLinkRef : undefined}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                active
                  ? "bg-surface-strong font-medium text-ink"
                  : "text-fog hover:bg-surface hover:text-ink"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-violet transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <Icon
                size={17}
                className={active ? "text-violet" : "text-mist group-hover:text-fog"}
              />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BrandLink({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Ideaven — back to site" className={`rounded-md ${className ?? ""}`}>
      <Logo />
    </Link>
  );
}

function UserBlock() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
      <Avatar displayName={user?.displayName ?? "?"} avatarUrl={user?.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user?.displayName}</p>
        <p className="truncate text-[12px] text-mist">@{user?.username}</p>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={async () => {
          setSigningOut(true);
          try {
            await logout();
          } finally {
            setSigningOut(false);
          }
        }}
        disabled={signingOut}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-60"
      >
        <IconSignOut size={17} />
      </button>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const firstDrawerLink = useRef<HTMLAnchorElement>(null);

  // Escape closes the drawer; opening moves focus into it.
  useEffect(() => {
    if (!drawerOpen) return;
    firstDrawerLink.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
          <BrandLink />
        </div>
        <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-3 py-4">
          <NavList pathname={pathname} />
        </nav>
        <div className="shrink-0 border-t border-line p-3">
          <p className="px-1 pb-2 font-mono text-[10px] tracking-[0.18em] text-mist uppercase">
            Phase 3 · Workspace
          </p>
          <UserBlock />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="px-1 text-[11.5px] text-mist">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-md lg:hidden">
        <BrandLink />
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          aria-expanded={drawerOpen}
          aria-controls="workspace-drawer"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          onClick={() => setDrawerOpen(true)}
        >
          <IconMenu size={18} />
        </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Workspace menu">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            id="workspace-drawer"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-panel"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <BrandLink />
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <IconClose size={18} />
              </button>
            </div>
            <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-3 py-4">
              <NavList
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
                firstLinkRef={firstDrawerLink}
              />
            </nav>
            <div className="shrink-0 border-t border-line p-3">
              <UserBlock />
            </div>
          </div>
        </div>
      ) : null}

      {/* Workspace content */}
      <div className="lg:pl-64">
        {children}
      </div>
    </div>
  );
}
