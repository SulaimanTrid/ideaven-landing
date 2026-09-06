"use client";

import { useEffect, useState } from "react";
import { projectApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import { useBuilder } from "./builder-context";
import type { IntentInput } from "@/types/intent";

/**
 * Project Brain (roadmap 7.0 M371, phase 7A): what IDEAVEN understands
 * about this project, starting with the user-authored Project Intent
 * (M11). The AI planner reads this alongside Project Memory before every
 * plan; it is user-owned, never derived, and editable here.
 */

const FIELDS: Array<{ key: keyof IntentInput; label: string; placeholder: string }> = [
  { key: "goal", label: "Goal", placeholder: "What is this project trying to achieve?" },
  { key: "audience", label: "Target users", placeholder: "Who is it for?" },
  { key: "platforms", label: "Platforms", placeholder: "e.g. Web + Android" },
  { key: "constraints", label: "Important constraints", placeholder: "e.g. fast startup, accessible, offline" },
  { key: "success", label: "Success criteria", placeholder: "How do you know it works?" },
];

const EMPTY: IntentInput = { goal: "", audience: "", platforms: "", constraints: "", success: "" };

export function BrainPanel() {
  const { project } = useBuilder();
  const [intent, setIntent] = useState<IntentInput>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    projectApi
      .intentGet(project.id)
      .then((res) => {
        if (!alive) return;
        const { projectId: _projectId, updatedAt: _updatedAt, ...fields } = res.intent;
        setIntent(fields);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "Could not load project intent.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatus("idle");
    try {
      await projectApi.intentSet(project.id, intent);
      setStatus("saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the intent.");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold text-ink">Project Brain</h2>
      <p className="mt-1 text-[12.5px] text-fog">
        What IDEAVEN knows about this project on purpose. The intent below is
        yours to define — the AI reads it (with your project rules) before
        every plan, and it keeps recommendations honest.
      </p>

      {loading ? (
        <p className="mt-4 text-[13px] text-fog">Reading project intent…</p>
      ) : (
        <form onSubmit={save} className="mt-4 rounded-xl border border-line bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">Project intent</p>
          <div className="mt-3 flex flex-col gap-3">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="text-[12px] text-mist">{field.label}</span>
                <input
                  value={intent[field.key]}
                  maxLength={500}
                  onChange={(event) => {
                    setStatus("idle");
                    setIntent((current) => ({ ...current, [field.key]: event.target.value }));
                  }}
                  placeholder={field.placeholder}
                  aria-label={field.label}
                  className="mt-0.5 h-9 w-full rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-md bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save intent"}
            </button>
            {status === "saved" ? (
              <span className="text-[12px] text-mint" role="status">Saved — the AI will use this.</span>
            ) : null}
            {status === "error" && error ? <span className="text-[12px] text-rose">{error}</span> : null}
          </div>
        </form>
      )}
    </div>
  );
}
