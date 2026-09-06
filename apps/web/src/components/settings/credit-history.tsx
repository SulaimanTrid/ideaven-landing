"use client";

import { useEffect, useState } from "react";
import { aiApi, type AICreditActivityEntry, type AICredits } from "@/lib/api";

/**
 * The account-settings credit surface: the derived balance (the ai_usage
 * ledger is the single source of truth) and the merged award/consumption
 * feed from the credit ledger.
 */
export function CreditHistory() {
  const [credits, setCredits] = useState<AICredits | null>(null);
  const [entries, setEntries] = useState<AICreditActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([aiApi.credits(), aiApi.creditActivity()])
      .then(([balance, activity]) => {
        if (!alive) return;
        setCredits(balance.credits);
        setEntries(activity.entries);
      })
      .catch(() => {
        if (alive) setError("Could not load your credit history. Try again shortly.");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-fog">{error}</p>;
  }
  if (!credits || !entries) {
    return <p className="text-sm text-fog">Loading your credits…</p>;
  }

  const resets = new Date(credits.resetsAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const rows: Array<[string, string]> = [
    ["Used today", `${credits.usedToday} of ${credits.dailyLimit} free commands`],
    ["Free remaining", `${credits.freeRemaining}`],
    ["Pack balance", `${credits.packBalance}`],
    ["Resets", resets],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {rows.map(([term, detail]) => (
          <div key={term} className="bg-panel px-4 py-3">
            <dt className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">{term}</dt>
            <dd className="mt-1 text-sm">{detail}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">Recent activity</h3>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-fog">
            No credit activity yet. AI commands and credit awards appear here.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {entries.map((entry, index) => (
              <CreditEntry key={`${entry.kind}-${entry.at}-${index}`} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreditEntry({ entry }: { entry: AICreditActivityEntry }) {
  const at = new Date(entry.at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  let amount: string;
  let detail: string;
  if (entry.kind === "grant") {
    amount = `+${entry.amount}`;
    detail = entry.detail;
  } else if (entry.amount > 0) {
    amount = `−${entry.amount}`;
    detail = `${entry.detail} commands — pack credits drawn`;
  } else {
    amount = "·";
    detail = `${entry.detail} commands — within the free allowance`;
  }

  return (
    <li className="flex items-center justify-between gap-4 bg-panel px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm">{detail}</p>
        <p className="mt-0.5 text-xs text-fog">
          {at}
          {entry.kind === "grant" && entry.expiresAt
            ? ` · expires ${new Date(entry.expiresAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}`
            : ""}
        </p>
      </div>
      <span
        className={`font-mono text-sm ${
          entry.kind === "grant" ? "text-mint" : entry.amount > 0 ? "text-fog" : "text-mist"
        }`}
      >
        {amount}
      </span>
    </li>
  );
}
