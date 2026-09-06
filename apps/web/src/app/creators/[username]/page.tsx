import type { Metadata } from "next";
import { projectTypeLabel } from "@/lib/project-meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicApi, type PublicationSummary } from "@/lib/api";

/**
 * A creator's public page (roadmap 33): their identity and their live,
 * published projects. Served from the publication feed, nothing private.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ username: string }>;
}

async function load(username: string) {
  return publicApi.creator(username);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const data = await load(username).catch(() => null);
  if (!data) return { title: "Creator not found — Ideaven" };
  return {
    title: `${data.creator.displayName || data.creator.username} — Ideaven`,
    description: `Published projects by ${data.creator.displayName || data.creator.username}.`,
  };
}

export default async function CreatorPage({ params }: PageProps) {
  const { username } = await params;
  const data = await load(username).catch(() => null);
  if (!data) notFound();

  const name = data.creator.displayName || data.creator.username;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Creator</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">@{data.creator.username}</h1>
      {data.creator.displayName && data.creator.displayName !== data.creator.username ? (
        <p className="mt-1 text-[15px] text-fog">{data.creator.displayName}</p>
      ) : null}

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink">
          Published projects{" "}
          <span className="text-[13px] font-normal text-mist">({data.publications.length})</span>
        </h2>
        {data.publications.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center">
            <p className="text-sm text-fog">Nothing published yet.</p>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.publications.map((publication: PublicationSummary) => (
              <li key={publication.slug}>
                <Link
                  href={`/p/${publication.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition-colors hover:border-violet/50"
                >
                  <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-mist self-start">
                    {projectTypeLabel(publication.type)}
                  </span>
                  <h3 className="mt-3 truncate text-[15px] font-semibold text-ink group-hover:text-violet">
                    {publication.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-fog">
                    {publication.description || "No description."}
                  </p>
                  <span className="mt-auto pt-4 text-[12px] text-mist">
                    {new Date(publication.publishedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-12 text-[13px] text-mist">
        <Link href="/community" className="text-violet hover:text-ink">
          ← Back to community
        </Link>
      </p>
      <span className="sr-only">Creator: {name}</span>
    </main>
  );
}
