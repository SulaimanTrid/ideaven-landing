"use client";

import { LOCALE_LABELS, type Locale } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * Language switcher (master realignment §31): actually changes the UI —
 * every translated surface re-renders through the i18n context. Preference
 * persists (localStorage) and survives navigation.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  return (
    <div role="group" aria-label="Language" className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-0.5">
      {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            title={LOCALE_LABELS[code]}
            className={`rounded-md px-2 py-1 text-[11.5px] font-medium uppercase transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint ${
              active ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
            }`}
          >
            {compact ? code : LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
