"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  detectLocale,
  dictionaries,
  STORAGE_KEY,
  type Locale,
  type TranslationKey,
} from "./dictionaries";

/**
 * The i18n provider (master realignment §30–31): key-based translations with
 * the flow user preference (localStorage) → browser language → English
 * fallback. `t(key)` always returns a string (missing keys fall back to
 * English, then to the key itself — never a blank label).
 */

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode: preference lives for the session only
    }
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: TranslationKey) => {
      const dict = dictionaries[locale] ?? dictionaries.en;
      return (dict as Record<string, string>)[key] ?? (dictionaries.en as Record<string, string>)[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Surfaces outside the provider (none today) render English rather than crash.
    return {
      locale: "en",
      setLocale: () => {},
      t: (key: TranslationKey) => (dictionaries.en as Record<string, string>)[key] ?? key,
    };
  }
  return ctx;
}
