"use client";

import Link from "next/link";
import { DropdownMenu } from "@/components/dashboard/menu";
import { formatRelativeDate } from "@/lib/format";
import type { ProjectSummary } from "@/types/project";
import { engineIdentityLabel } from "@/lib/project-meta";
import { CreationPreview, type CreationPreviewType } from "@/components/visuals/creation-preview";
import {
  IconArchive,
  IconCopy,
  IconPen,
  IconRestore,
  IconTrash,
} from "@/components/visuals/icons";

/**
 * A library project card. The whole card opens the project; the ⋯ menu
 * carries the management actions owned by the parent page.
 */
export function ProjectCard({
  project,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: ProjectSummary;
  onRename?: (project: ProjectSummary) => void;
  onDuplicate?: (project: ProjectSummary) => void;
  onArchive?: (project: ProjectSummary) => void;
  onRestore?: (project: ProjectSummary) => void;
  onDelete?: (project: ProjectSummary) => void;
}) {
  const archived = project.status === "archived";
  // TASK 61: every environment gets its real preview — 3D projects are no
  // longer shown with the generic app glyph.
  const previewType: CreationPreviewType =
    project.type === "game" ? "game" : project.type === "3d" ? "3d" : "app";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-white/20">
      {/* Stretched link makes the whole card the open affordance. */}
      <Link
        href={`/builder/${project.id}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        aria-label={`Open ${project.name}`}
      />

      <div aria-hidden="true" className="relative h-28 border-b border-line bg-panel p-3">
        <CreationPreview type={previewType} className="mx-auto h-full max-w-[240px]" />

        {archived ? (
          <span className="absolute top-3 left-3 rounded-md border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber">
            Archived
          </span>
        ) : project.status === "published" ? (
          <span className="absolute top-3 left-3 rounded-md border border-mint/30 bg-mint/10 px-2 py-0.5 text-[11px] font-medium text-mint">
            Published
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
            {project.name}
          </h3>
          {onRename || onDelete ? (
            <div className="relative z-20 -mt-1 -mr-1">
              <DropdownMenu
                label={`Actions for ${project.name}`}
                items={[
                  ...(onRename
                    ? [{ key: "rename", label: "Rename", icon: <IconPen size={15} />, onSelect: () => onRename(project) }]
                    : []),
                  ...(onDuplicate
                    ? [{ key: "duplicate", label: "Duplicate", icon: <IconCopy size={15} />, onSelect: () => onDuplicate(project) }]
                    : []),
                  ...(archived && onRestore
                    ? [{ key: "restore", label: "Restore", icon: <IconRestore size={15} />, onSelect: () => onRestore(project) }]
                    : []),
                  ...(!archived && onArchive
                    ? [{ key: "archive", label: "Archive", icon: <IconArchive size={15} />, onSelect: () => onArchive(project) }]
                    : []),
                  ...(onDelete
                    ? [{ key: "delete", label: "Delete", icon: <IconTrash size={15} />, danger: true, onSelect: () => onDelete(project) }]
                    : []),
                ]}
              />
            </div>
          ) : null}
        </div>

        {/* TASK 65 §13/§14: the ENGINE IDENTITY badge — the same vocabulary
            the builder header uses (APP / 2D GAME / 3D GAME), never a bare
            "Project". Description rides below, quiet. */}
        <div className="flex items-center gap-2">
          <span
            data-engine-badge={project.type}
            className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fog"
          >
            {engineIdentityLabel(project.type)}
          </span>
        </div>
        {project.description ? (
          <p className="line-clamp-1 text-[12.5px] leading-5 text-mist">{project.description}</p>
        ) : null}

        <p className="mt-auto pt-2 text-[12px] text-mist">
          Updated {formatRelativeDate(project.updatedAt)}
        </p>
      </div>
    </div>
  );
}
