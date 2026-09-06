import type { Metadata } from "next";
import Link from "next/link";
import { publicApi, type PublicationSummary } from "@/lib/api";

/**
 * Community (roadmap 20/33): the honest version of "social" — real creators,
 * their live published projects, and the remix loop. No invented feeds.
 */

export const metadata: Metadata = {
  title: "Community — Ideaven",
  description: "Creators and their published projects. Open anything, remix it, make it yours.",
};

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const [stats, publications] = await Promise.all([
    publicApi.stats(),
    publicApi.list(12).catch(() => [] as PublicationSummary[]),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Community</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Creators building in the open</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
        Everything here is a real, running project published by its creator.
        Open one, then remix it into your own account with one click.
      </p>

      {stats ? (
        <dl className="mt-8 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {[
            ["Creators", stats.creators],
            ["Projects", stats.projects],
            ["Live publications", stats.publications],
          ].map(([term, value]) => (
            <div key={term as string} className="bg-card px-4 py-4 text-center">
              <dd className="text-2xl font-semibold text-ink">{value as number}</dd>
              <dt className="mt-1 text-[12px] text-mist">{term as string}</dt>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Latest publications</h2>
          <Link href="/explore" className="text-[13px] text-violet hover:text-ink">
            Browse all →
          </Link>
        </div>
        {publications.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-line bg-card p-8 text-center">
            <p className="text-sm text-fog">
              Nothing published yet — be the first. Build a project and hit
              Publish in the builder.
            </p>
            <Link
              href="/dashboard/templates"
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet"
            >
              Start from a template
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publications.map((publication) => (
              <li key={publication.slug}>
                <Link
                  href={`/p/${publication.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 transition-colors hover:border-violet/50"
                >
                  <span className="text-[11px] text-mist">
                    by {publication.authorName || publication.author}
                  </span>
                  <h3 className="mt-1 truncate text-[15px] font-semibold text-ink group-hover:text-violet">
                    {publication.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-fog">
                    {publication.description || "No description."}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="mt-14 rounded-2xl border border-line bg-card p-8">
        <h2 className="text-lg font-semibold text-ink">The remix loop</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-fog">
          Every published project can be copied into your account as a fresh
          draft — blocks, screens, and logic included. The copy credits the
          original creator, and publishing your version adds your name to the
          community gallery.
        </p>
        <ol className="mt-4 grid max-w-2xl grid-cols-1 gap-3 text-[13px] text-fog sm:grid-cols-3">
          <li className="rounded-xl border border-line bg-panel p-3">1. Open a live project</li>
          <li className="rounded-xl border border-line bg-panel p-3">2. Remix it into your account</li>
          <li className="rounded-xl border border-line bg-panel p-3">3. Edit, publish, repeat</li>
        </ol>
      </section>
    </main>
  );
}
