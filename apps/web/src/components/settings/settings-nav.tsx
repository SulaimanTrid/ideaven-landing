"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { label: "Profile", href: "/settings", description: "Display name, username, bio, avatar" },
  { label: "Security", href: "/settings/security", description: "Email identity and password" },
  { label: "Account", href: "/settings/account", description: "Status, ID, and dates" },
  { label: "Appearance", href: "/settings/appearance", description: "Light, dark, or system theme" },
] as const;

/** Section switcher for the settings area; highlights the active section. */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="md:col-span-1">
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <li key={section.href} className="shrink-0 md:shrink">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-xl border px-4 py-3 transition-colors ${
                  active
                    ? "border-violet/40 bg-violet/10 text-ink"
                    : "border-line bg-card text-fog hover:border-white/20 hover:text-ink"
                }`}
              >
                <span className="text-sm font-medium">{section.label}</span>
                <span className="mt-0.5 hidden text-[12px] text-mist md:block">
                  {section.description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
