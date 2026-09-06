"use client";

import { useAuth } from "@/auth/auth-provider";

/** Read-only account facts: ID, status, and the dates users ask about. */
export function AccountInfo() {
  const { user } = useAuth();
  if (!user) return null;

  const created = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const lastLogin = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "This session";

  const rows: Array<[string, string, boolean?]> = [
    ["Account ID", user.id, true],
    ["Status", "Active"],
    ["Created", created],
    ["Last sign-in", lastLogin],
  ];

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
      {rows.map(([term, detail, mono]) => (
        <div key={term} className="bg-panel px-4 py-3">
          <dt className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">{term}</dt>
          <dd
            className={`mt-1 truncate text-sm ${mono ? "font-mono text-[12px] text-fog" : ""}`}
            title={detail}
          >
            {detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}
