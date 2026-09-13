"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { publicApi, type PublicationSummary } from "@/lib/api";
import { PROJECT_TYPES, projectTypeLabel } from "@/lib/project-meta";
import type { ProjectType } from "@/types/project";
import { ProjectThumb } from "@/components/community/project-thumb";

/**
 * The public gallery (roadmap 21): search and filter over the live
 * publication feed. Every card opens the interactive snapshot.
 */
export default function ExplorePage() {
  const [publications, setPublications] = useState<PublicationSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | ProjectType>("all");

  useEffect(() => {
    publicApi.list(48).then(setPublications).catch(() => setPublications([]));
  }, []);

  const visible = useMemo(() => {
    const items = publications ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (q && !(`${p.name} ${p.description} ${p.author}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [publications, query, type]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Explore</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Built with Ideaven</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
        Real projects published by their creators. Every card opens the live
        app — click around, it actually runs.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects and creators…"
          aria-label="Search projects"
          className="h-10 flex-1 rounded-lg border border-line bg-card px-3 text-[13px] text-ink placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        />
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-canvas p-1" role="group" aria-label="Project type">
          {(["all", ...PROJECT_TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                type === t ? "bg-surface-strong text-ink" : "text-mist hover:text-fog"
              }`}
            >
              {t === "all" ? "All" : projectTypeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      {publications === null ? (
        <p className="mt-10 text-sm text-fog">Loading projects…</p>
      ) : visible.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-line bg-card p-10 text-center">
          <h2 className="text-lg font-semibold text-ink">
            {publications.length === 0 ? "Nothing published yet" : "No matches"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fog">
            {publications.length === 0
              ? "The gallery fills up as creators publish. Build a project, hit Publish in the builder, and it appears here."
              : "Try a different search or switch the type filter."}
          </p>
          {publications.length === 0 ? (
            <Link
              href="/dashboard/templates"
              className="mt-6 inline-flex h-10 items-center rounded-lg bg-violet-deep px-5 text-[13px] font-medium text-white transition-colors hover:bg-violet"
            >
              Start building
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((publication) => (
            <li key={publication.slug}>
              <Link
                href={`/p/${publication.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition-colors hover:border-violet/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                <ProjectThumb
                  slug={publication.slug}
                  name={publication.name}
                  className="mb-4 aspect-[16/9] w-full rounded-xl border border-line object-cover"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-mist">
                    {projectTypeLabel(publication.type)}
                  </span>
                  <span className="text-[11px] text-mist">
                    {new Date(publication.publishedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <h2 className="mt-3 truncate text-[15px] font-semibold text-ink group-hover:text-violet">
                  {publication.name}
                </h2>
                <p className="mt-1 text-[12px] text-mist">
                  by{" "}
                  <span className="text-violet group-hover:text-ink">
                    {publication.authorName || publication.author}
                  </span>
                </p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-fog">
                  {publication.description || "No description."}
                </p>
                <span className="mt-auto pt-4 text-[12px] font-medium text-violet">Open live ↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
