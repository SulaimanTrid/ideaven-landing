import type { ApiError } from "@/types/auth";
import type { TranslationKey } from "@/lib/i18n/i18n";

/**
 * Server errors are keyed by stable machine codes (httpx envelope), so the
 * client can translate them without the server knowing any language. Unknown
 * codes fall back to the server's English message verbatim.
 */
export function apiErrorKey(error: unknown): TranslationKey | null {
  const code = (error as { code?: string })?.code;
  if (!code) return null;
  const key = `errors.${code}` as TranslationKey;
  return key;
}
