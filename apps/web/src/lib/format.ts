/**
 * Compact date formatting for dashboard surfaces. Relative for recent dates,
 * absolute beyond a month — deterministic, locale-driven, no dependencies.
 */

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffMinutes) < 1) return "just now";
  if (Math.abs(diffHours) < 1) return relative.format(diffMinutes, "minute");
  if (Math.abs(diffDays) < 1) return relative.format(diffHours, "hour");
  if (Math.abs(diffDays) <= 30) return relative.format(diffDays, "day");
  return absolute.format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return absolute.format(date);
}
