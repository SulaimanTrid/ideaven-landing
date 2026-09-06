"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectApi, templateApi, type TemplateBrief } from "@/lib/api";
import { ApiError } from "@/types/auth";
import type { ProjectType } from "@/types/project";
import { projectTypeLabel } from "@/lib/project-meta";

/**
 * The template gallery (roadmap 32): every card is a real, valid model the
 * API applies on creation — layout, navigation, and logic blocks included.
 * "Use template" creates the project and opens the builder immediately.
 */
export function TemplateGallery() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateBrief[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    templateApi.list().then(setTemplates);
  }, []);

  const use = async (template: TemplateBrief) => {
    setBusyId(template.id);
    setError(null);
    try {
      const { project } = await projectApi.create({
        type: template.type as ProjectType,
        name: template.name,
        description: template.description,
        template: template.id,
      });
      router.push(`/builder/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the project. Try again shortly.");
      setBusyId(null);
    }
  };

  if (templates === null) {
    return <p className="text-sm text-fog">Loading templates…</p>;
  }
  if (templates.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card p-8 text-center">
        <p className="text-sm text-fog">
          No templates are installed on this server yet. Blank projects are
          always available.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error ? <p className="mb-4 text-sm text-rose">{error}</p> : null}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex h-full flex-col rounded-2xl border border-line bg-card p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-mist">
                {projectTypeLabel(template.type)}
              </span>
              <span className="text-[11px] text-mist">
                {template.screens} {template.screens === 1 ? "screen" : "screens"}
              </span>
            </div>
            <h2 className="mt-3 text-[15px] font-semibold text-ink">{template.name}</h2>
            <p className="mt-1 text-[13px] leading-5 text-fog">{template.description}</p>
            <button
              type="button"
              onClick={() => void use(template)}
              disabled={busyId !== null}
              className="mt-4 h-9 rounded-lg bg-violet-deep text-[12.5px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
            >
              {busyId === template.id ? "Creating…" : "Use this template"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
