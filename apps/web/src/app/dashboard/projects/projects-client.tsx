"use client";

import { importProjectPackage } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, ButtonLink, Chip } from "@ideaven/ui";
import { Modal } from "@/components/dashboard/modal";
import { ProjectCard } from "@/components/dashboard/project-card";
import { projectApi } from "@/lib/api";
import { useProjects } from "@/lib/use-projects";
import { ApiError } from "@/types/auth";
import type { ProjectSort, ProjectStatusFilter, ProjectSummary } from "@/types/project";
import { IconPlus, IconSearch, IconTrash } from "@/components/visuals/icons";

/**
 * The Projects library: search, sort, and status filtering over the signed-in
 * user's own projects, with rename / duplicate / archive / delete actions.
 */

const SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "opened", label: "Recently opened" },
  { value: "name", label: "Alphabetical" },
];

const STATUS_TABS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export function ProjectsClient() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("updated");
  const [status, setStatus] = useState<ProjectStatusFilter>("active");

  const { projects, total, loading, error, reload } = useProjects({
    q: query,
    status,
    sort,
    limit: 100,
  });

  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const busy = (id: string) => busyId === id;

  const duplicate = async (project: ProjectSummary) => {
    setActionError(null);
    setBusyId(project.id);
    try {
      await projectApi.duplicate(project.id);
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not duplicate the project.");
    } finally {
      setBusyId(null);
    }
  };

  const setStatusTo = async (project: ProjectSummary, next: "archived" | "draft") => {
    setActionError(null);
    setBusyId(project.id);
    try {
      await projectApi.update(project.id, { status: next });
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update the project.");
    } finally {
      setBusyId(null);
    }
  };

  const showSkeleton = loading && projects.length === 0 && !error;

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 pb-24 sm:px-6 lg:pt-14">
      <div
        aria-hidden="true"
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:radial-gradient(70%_100%_at_50%_0%,black,transparent)]"
      />

      <div className="relative">
        <Chip tone="violet">Projects</Chip>

        <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Your projects.
            </h1>
            <p className="mt-3 text-pretty text-lg leading-8 text-fog">
              Every idea you have started — {total === 1 ? "1 project" : `${total} projects`} in
              your library.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 self-start md:flex-row md:self-auto">
            <ImportPackageButton />
            <ButtonLink
              href="/dashboard/projects/new"
              size="lg"
              className="shrink-0"
            >
              <IconPlus size={16} />
              Create Project
            </ButtonLink>
          </div>
        </div>

        {/* Toolbar: search, status tabs, sort. */}
        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative lg:w-80">
            <IconSearch
              size={16}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mist"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your projects…"
              aria-label="Search projects"
              className="h-10 w-full rounded-lg border border-line bg-panel pr-3.5 pl-10 text-sm text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Filter by status"
              className="flex rounded-lg border border-line bg-panel p-1"
            >
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                    status === tab.value ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[13px] text-mist">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as ProjectSort)}
                className="h-9 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {actionError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose/30 bg-rose/10 px-4 py-3 text-[13px] text-rose"
          >
            {actionError}
          </p>
        ) : null}

        {/* Content states: skeleton → error → empty → grid. */}
        {showSkeleton ? (
          <div
            className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-hidden="true"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-2xl border border-line bg-card/60"
              />
            ))}
          </div>
        ) : error ? (
          <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-line bg-card/50 px-6 py-16 text-center">
            <p className="text-lg font-medium">Something went wrong.</p>
            <p className="mt-1 max-w-md text-fog">{error}</p>
            <Button variant="secondary" className="mt-6" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : projects.length === 0 ? (
          query ? (
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-line bg-card/50 px-6 py-16 text-center">
              <p className="text-lg font-medium">No matches for “{query}”.</p>
              <p className="mt-1 text-fog">Try a different search, or clear it to see everything.</p>
              <Button variant="secondary" className="mt-6" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-line bg-card/50 px-6 py-16 text-center">
              <p className="text-lg font-medium">
                {status === "archived" ? "Nothing archived." : "No projects yet."}
              </p>
              <p className="mt-1 text-fog">Your next idea could start here.</p>
              {status !== "archived" ? (
                <ButtonLink href="/dashboard/projects/new" className="mt-6">
                  <IconPlus size={16} />
                  Create your first project
                </ButtonLink>
              ) : null}
            </div>
          )
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={setRenaming}
                onDuplicate={(target) => void duplicate(target)}
                onArchive={(target) => void setStatusTo(target, "archived")}
                onRestore={(target) => void setStatusTo(target, "draft")}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </div>

      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => reload()}
      />

      <DeleteDialog project={deleting} onClose={() => setDeleting(null)} onDeleted={() => reload()} />
    </div>
  );
}

/** Rename + description editor for one project. */
function RenameDialog({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectSummary | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const seeded = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the fields the first time a given project is opened.
  if (project && seeded.current !== project.id) {
    seeded.current = project.id;
    setName(project.name);
    setDescription(project.description);
    setFieldError(null);
    setError(null);
  }
  if (!project && seeded.current) seeded.current = null;

  if (!project) return <Modal open={false} onClose={onClose} title="" children={null} />;

  const save = async () => {
    setError(null);
    setFieldError(null);
    setSaving(true);
    try {
      await projectApi.update(project.id, {
        name: name.trim(),
        description: description.trim(),
      });
      await onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldMessage = err.fieldError("name");
        if (fieldMessage) setFieldError(fieldMessage);
        else setError(err.message);
      } else {
        setError("Could not save the project. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Rename project"
      description="Give this project a name you will recognize later."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rename-name" className="text-sm font-medium text-ink">
            Name
          </label>
          <input
            id="rename-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoFocus
            aria-invalid={Boolean(fieldError) || undefined}
            aria-describedby={fieldError ? "rename-name-error" : undefined}
            className="h-11 w-full rounded-lg border border-line bg-panel px-3.5 text-[15px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
          {fieldError ? (
            <p id="rename-name-error" role="alert" className="text-[13px] text-rose">
              {fieldError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rename-description" className="text-sm font-medium text-ink">
            Description <span className="font-normal text-mist">(optional)</span>
          </label>
          <textarea
            id="rename-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={280}
            rows={3}
            className="w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          />
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-rose">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || name.trim() === ""}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Irreversible-delete confirmation for one project. */
function DeleteDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectSummary | null;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!project) return <Modal open={false} onClose={onClose} title="" children={null} />;

  const remove = async () => {
    setError(null);
    setDeleting(true);
    try {
      await projectApi.remove(project.id);
      await onDeleted();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete the project. Try again.",
      );
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete “${project.name}”?`}
      description="This permanently removes the project and everything in it. This cannot be undone."
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-[13px] text-rose">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Keep project
          </Button>
          <Button
            onClick={() => void remove()}
            disabled={deleting}
            className="bg-rose text-white shadow-none hover:bg-rose/85 active:bg-rose/70"
          >
            <IconTrash size={15} />
            {deleting ? "Deleting…" : "Delete forever"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportPackageButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { project } = await importProjectPackage(file);
      router.push(`/builder/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The import failed. Try again shortly.");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Import a project package"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-4 text-[14px] font-medium text-fog transition-colors hover:border-violet/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
      >
        {busy ? "Importing…" : "Import package"}
      </button>
      {error ? <span className="text-[11.5px] text-rose">{error}</span> : null}
    </span>
  );
}
