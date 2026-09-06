"use client";

import { useTheme, type ThemePreference } from "@/theme/theme-provider";
import { cn } from "@ideaven/ui";

/**
 * Appearance settings (roadmap 2.0-I): the single control surface for the
 * global theme. The choice persists and applies everywhere through tokens —
 * no per-page theme logic exists anywhere in the product.
 */

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Bright surfaces for well-lit rooms and daylight building.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "The classic Ideaven studio look — deep navy, glowing accents.",
  },
  {
    value: "system",
    label: "System",
    description: "Follow your device's light/dark preference automatically.",
  },
];

export function AppearanceSettings() {
  const { preference, setTheme, resolved } = useTheme();

  return (
    <div>
      <p className="text-[12.5px] text-fog" role="status">
        Current: {resolved} theme · preference: {preference}
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Theme options">
        {OPTIONS.map((option) => {
          const active = preference === option.value;
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={active}
                className={cn(
                  "h-full w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint",
                  active ? "border-violet bg-violet/10" : "border-line bg-panel hover:border-violet/40",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-[13.5px] font-semibold text-ink">{option.label}</span>
                  {active ? (
                    <span className="rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 text-[10.5px] font-medium text-mint">
                      Active
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-5 text-fog">
                  {option.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
