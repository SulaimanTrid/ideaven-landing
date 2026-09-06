"use client";

import { useEffect, useState } from "react";
import { projectApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import { useBuilder } from "./builder-context";
import {
  MEMORY_CATEGORY_LABELS,
  type MemoryCategory,
  type MemoryItem,
} from "@/types/memory";

/**
 * Project Memory (roadmap 5.0 M5, phase 5A): durable rules the user writes
 * for the AI planner — "use the existing Button", "never touch the auth
 * screen". Every Ask AI plan reads these rules server-side; they are never
 * created silently (the user writes them here) and can be deleted any time.
 */

const CATEGORY_ORDER = Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[];

export function MemoryPanel() {
  const { project } = useBuilder();
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<MemoryCategory>("coding");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    projectApi
      .memoryList(project.id)
      .then((res) => {
        if (alive) setItems(res.memory);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : "Could not load project memory.");
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (content.trim() === "" || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await projectApi.memoryAdd(project.id, { category, content: content.trim() });
      setItems((current) => [...(current ?? []), res.memory]);
      setContent("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the rule.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await projectApi.memoryRemove(project.id, id);
      setItems((current) => (current ?? []).filter((item) => item.id !== id));
    } catch {
      setError("Could not remove the rule. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold text-ink">Project memory</h2>
      <p className="mt-1 text-[12.5px] text-fog">
        Durable rules the AI must respect in every plan for this project.
        They stay private to this project and apply until you delete them.
      </p>

      {/* Add a rule */}
      <form onSubmit={submit} className="mt-4 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="text-[12px] text-mist sm:w-44">
            <span className="sr-only">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as MemoryCategory)}
              aria-label="Rule category"
              className="h-9 w-full rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {CATEGORY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {MEMORY_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Rule</span>
            <input
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={500}
              placeholder='e.g. "Use the existing Button component for actions."'
              aria-label="Rule text"
              className="h-9 w-full rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            />
          </label>
          <button
            type="submit"
            disabled={saving || content.trim() === ""}
            className="h-9 shrink-0 rounded-md bg-violet-deep px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-50"
          >
            {saving ? "Saving…" : "Remember"}
          </button>
        </div>
        {error ? <p className="mt-2 text-[12px] text-rose">{error}</p> : null}
      </form>

      {/* Rules list */}
      {items === null && !error ? (
        <p className="mt-4 text-[13px] text-fog">Loading rules…</p>
      ) : items !== null && items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-card/50 p-6 text-center">
          <p className="text-[13.5px] text-fog">No project rules yet.</p>
          <p className="mt-1 text-[12.5px] text-mist">
            Write the first one above — the AI reads these before every plan.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {(items ?? []).map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5"
            >
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-mist">
                {MEMORY_CATEGORY_LABELS[item.category] ?? item.category}
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-fog">{item.content}</span>
              <button
                type="button"
                aria-label={`Delete rule: ${item.content}`}
                title="Delete rule"
                disabled={removing === item.id}
                onClick={() => remove(item.id)}
                className="shrink-0 rounded-md px-2 py-1 text-[11.5px] text-mist transition-colors hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-50"
              >
                {removing === item.id ? "…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
