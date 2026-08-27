import Link from "next/link";
import { Container, Logo } from "@ideaven/ui";

const LINK_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Learn", href: "/#journey" },
      { label: "Explore", href: "/#explore" },
      { label: "Community", href: "/community" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Made with Ideaven", href: "/#explore" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
] as const;

const SOCIALS = ["GitHub", "X", "YouTube"] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-panel/60">
      <Container className="py-12 md:py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-6 text-fog">
              Every idea deserves a way to exist.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3 md:max-w-lg"
          >
            {LINK_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="font-mono text-[11px] tracking-[0.22em] text-mist uppercase">
                  {group.title}
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="rounded-sm text-sm text-fog transition-colors hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-mist">
            © 2026 Ideaven. Built with blocks and TypeScript.
          </p>
          <ul className="flex items-center gap-2" aria-label="Social channels">
            {SOCIALS.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="rounded-full border border-line px-3 py-1 text-[12px] text-mist"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <p className="font-mono text-[11px] tracking-[0.22em] text-mist uppercase">
            Phase 1 · Foundation
          </p>
        </div>
      </Container>
    </footer>
  );
}
