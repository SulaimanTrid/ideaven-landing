"use client";

import { useEffect, useState } from "react";
import { useTheme, type ThemePreference } from "@/theme/theme-provider";

/**
 * The global theme switcher: cycles Light → Dark → System. Lives in the
 * site header; the same preference drives every surface through tokens.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Unmounted render keeps markup stable between server and client.
  const current: ThemePreference = mounted ? preference : "system";
  const next: ThemePreference = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  const label =
    current === "light" ? "Light theme" : current === "dark" ? "Dark theme" : "System theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`${label} — click for ${next === "light" ? "Light" : next === "dark" ? "Dark" : "System"}`}
      aria-label={`Theme: ${label}. Activate to switch to ${next === "light" ? "Light" : next === "dark" ? "Dark" : "System"} theme.`}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-mist transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      {current === "light" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : current === "dark" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
      {compact ? null : <span className="hidden text-[12px] font-medium lg:inline">{current}</span>}
    </button>
  );
}
