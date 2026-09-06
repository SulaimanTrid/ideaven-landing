import type { Metadata } from "next";
import { projectTypeLabel } from "@/lib/project-meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicApi } from "@/lib/api";
import { LiveApp } from "@/components/runtime/live-app";
import { RemixButton } from "@/components/community/remix-button";

/**
 * The public page of a published project (roadmap 19). Server-rendered from
 * the stored snapshot: editing the project never changes this page until the
 * owner republishes. Unpublishing kills it immediately.
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function load(slug: string) {
  try {
    return await publicApi.project(slug);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = await load(slug).catch(() => null);
  if (!publication) return { title: "Not published — Ideaven" };
  return {
    title: `${publication.name} — built with Ideaven`,
    description: publication.description || `An interactive ${publication.type} built with Ideaven.`,
  };
}

export default async function PublishedProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const publication = await load(slug);
  if (!publication) notFound();

  const published = new Date(publication.publishedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-12 pb-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-ink">{publication.name}</h1>
          {publication.description ? (
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fog">{publication.description}</p>
          ) : null}
          <p className="mt-2 text-[12px] text-mist">
            <span className="rounded-full border border-violet/40 bg-violet/10 px-2.5 py-1 text-[11.5px] font-medium text-violet">
              Built with Ideaven
            </span>{" "}
            · {projectTypeLabel(publication.type)} · by{" "}
            <Link
              href={`/creators/${publication.author}`}
              className="text-violet transition-colors hover:text-ink"
            >
              {publication.authorName || publication.author}
            </Link>{" "}
            · Published {published}
          </p>
        </div>

        <div className="mb-8 flex justify-center">
          <RemixButton slug={publication.slug} />
        </div>

        <LiveApp model={publication.model} />
      </main>

      <footer className="border-t border-line bg-panel py-6 text-center text-[12px] text-mist">
        This is a live snapshot of an Ideaven project.{" "}
        <Link href="/" className="text-violet transition-colors hover:text-ink">
          Build your own
        </Link>
      </footer>
    </div>
  );
}
