"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/auth-provider";
import { authApi } from "@/lib/api";
import {
  detectLocale,
  dictionaries,
  STORAGE_KEY,
  type Locale,
  type TranslationKey,
} from "./dictionaries";

export type { TranslationKey };

/**
 * The i18n provider (TASK 10): ONE language setting drives ONE global UI
 * language. Resolution priority: account preference → local preference
 * (localStorage) → browser language → English fallback. `t(key)` always
 * returns a string (missing keys fall back to English, then to the key
 * itself — never a blank label).
 */

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  /** True while the account preference is being persisted server-side. */
  syncingAccount: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LOCALES: Locale[] = ["en", "id"];

function asLocale(value: string | null | undefined): Locale | null {
  return LOCALES.includes((value ?? "") as Locale) ? (value as Locale) : null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // The provider sits inside AuthProvider so the account preference can win.
  const { user, status, setUser } = useAuth();
  const [locale, setLocaleState] = useState<Locale>("en");
  const [syncingAccount, setSyncingAccount] = useState(false);

  // Resolution: account preference → local → browser → English. The account
  // wins whenever it carries an explicit locale; the auth status gates so an
  // in-flight /me check doesn't flash English before the account is known.
  useEffect(() => {
    if (status === "loading") return;
    const account = asLocale(user?.locale);
    if (account) {
      setLocaleState(account);
      return;
    }
    if (status === "authenticated") {
      // Signed in without an account locale: keep the local choice if the
      // user already picked one on this device, else detect.
      try {
        const local = asLocale(window.localStorage.getItem(STORAGE_KEY));
        setLocaleState(local ?? detectLocale());
        return;
      } catch {
        setLocaleState(detectLocale());
        return;
      }
    }
    setLocaleState(detectLocale());
  }, [status, user?.locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      document.documentElement.lang = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private mode: preference lives for the session only
      }
      // Persist to the account too, so other devices inherit it. The profile
      // endpoint rewrites the editable fields, so it needs them all.
      if (user) {
        setSyncingAccount(true);
        authApi
          .updateProfile({
            username: user.username,
            displayName: user.displayName,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            locale: next,
          })
          .then(({ user: updated }) => {
            setUser(updated);
          })
          .catch(() => {
            // Local preference already applied; the account sync retries on
            // the next change. Never block the UI on it.
          })
          .finally(() => setSyncingAccount(false));
      }
    },
    [user, setUser],
  );

  const t = useCallback(
    (key: TranslationKey) => {
      const dict = dictionaries[locale] ?? dictionaries.en;
      return (dict as Record<string, string>)[key] ?? (dictionaries.en as Record<string, string>)[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t, syncingAccount }), [locale, setLocale, t, syncingAccount]);
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
      syncingAccount: false,
    };
  }
  return ctx;
}
