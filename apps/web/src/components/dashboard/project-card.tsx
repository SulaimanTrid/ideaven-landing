"use client";

import Link from "next/link";
import { cn } from "@ideaven/ui";
import { DropdownMenu } from "@/components/dashboard/menu";
import { formatRelativeDate } from "@/lib/format";
import type { ProjectSummary } from "@/types/project";
import { projectTypeLabel } from "@/lib/project-meta";
import {
  IconAppWindow,
  IconArchive,
  IconCopy,
  IconGamepad,
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

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-white/20">
      {/* Stretched link makes the whole card the open affordance. */}
      <Link
        href={`/builder/${project.id}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        aria-label={`Open ${project.name}`}
      />

      <div
        aria-hidden="true"
        className={cn(
          "relative flex h-28 items-center justify-center border-b border-line",
          project.type === "game"
            ? "bg-gradient-to-br from-mint/15 via-panel to-panel"
            : "bg-gradient-to-br from-violet/20 via-panel to-panel",
        )}
      >
        <div className="bg-dots absolute inset-0 opacity-40" />
        {project.type === "game" ? (
          <IconGamepad size={30} className="relative text-mint/80" />
        ) : (
          <IconAppWindow size={30} className="relative text-violet/90" />
        )}

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

        <p className="text-[13px] leading-5 text-mist">
          {projectTypeLabel(project.type)}
          {project.description ? ` · ${project.description}` : ""}
        </p>

        <p className="mt-auto pt-2 text-[12px] text-mist">
          Updated {formatRelativeDate(project.updatedAt)}
        </p>
      </div>
    </div>
  );
}
