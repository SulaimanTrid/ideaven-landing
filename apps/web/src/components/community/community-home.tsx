"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  COMMUNITY_CHANNELS,
  CHANNEL_LABELS,
  communityApi,
  publicApi,
  type CommunityFeedFilter,
  type CommunityPost,
  type CommunitySummary,
  type PublicationSummary,
} from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { projectTypeLabel } from "@/lib/project-meta";
import { useAuth } from "@/auth/auth-provider";
import { useI18n, type TranslationKey } from "@/lib/i18n/i18n";
import { apiErrorKey } from "@/lib/i18n/errors";
import { ApiError } from "@/types/auth";
import {
  IconAppWindow,
  IconArrowUpRight,
  IconBlocks,
  IconCheck,
  IconGamepad,
  IconHome,
  IconLoop,
  IconPlus,
  IconSearch,
  IconSparkle,
  IconUsers,
} from "@/components/visuals/icons";
import { ProjectThumb } from "@/components/community/project-thumb";
import { CompactRemixButton } from "@/components/community/compact-remix-button";

type Sort = "latest" | "popular" | "trending";

type View =
  | { type: "home" }
  | { type: "questions" }
  | { type: "unanswered" }
  | { type: "projects" }
  | { type: "channel"; channel: string }
  | { type: "tag"; tag: string }
  | { type: "challenges" };

const SORTS: { key: Sort; keyName: string }[] = [
  { key: "latest", keyName: "community.latest" },
  { key: "popular", keyName: "community.popular" },
  { key: "trending", keyName: "community.trending" },
];

function filterFor(view: View, sort: Sort): CommunityFeedFilter {
  switch (view.type) {
    case "home":
      return { sort };
    case "questions":
      return { kind: "question", sort: sort === "latest" ? "popular" : sort };
    case "unanswered":
      return { sort: "unanswered" };
    case "projects":
      return { hasProject: true };
    case "channel":
      return { channel: view.channel, sort };
    case "tag":
      return { tag: view.tag, sort };
    default:
      return { sort };
  }
}

export function CommunityHome() {
  const { user } = useAuth();
  const { t } = useI18n();
  const tError = (err: unknown, fallback: TranslationKey) =>
    (err instanceof ApiError ? t(apiErrorKey(err) ?? fallback) : t(fallback));
  const [view, setView] = useState<View>({ type: "home" });
  const [sort, setSort] = useState<Sort>("latest");
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [featured, setFeatured] = useState<PublicationSummary[]>([]);

  const filter = useMemo(() => filterFor(view, sort), [view, sort]);

  const loadFeed = useCallback(async () => {
    setPosts(null);
    setLoadError(null);
    try {
      setPosts(await communityApi.feed({ ...filter, limit: 30 }));
    } catch {
      setLoadError("The community feed could not load. Try again shortly.");
    }
  }, [filter]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    communityApi.summary().then(setSummary).catch(() => setSummary(null));
    publicApi.list(4).then(setFeatured).catch(() => setFeatured([]));
  }, [view]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    setView({ type: "home" });
    setPosts(null);
    setLoadError(null);
    try {
      setPosts(await communityApi.feed({ q: query, limit: 30 }));
    } catch {
      setLoadError("The community feed could not load. Try again shortly.");
    }
  };

  const toggleVote = async (post: CommunityPost) => {
    if (!user) {
      window.location.href = `/login?next=${encodeURIComponent("/community")}`;
      return;
    }
    try {
      const updated = await communityApi.votePost(post.id);
      setPosts((current) =>
        current ? current.map((p) => (p.id === updated.id ? updated : p)) : current,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/community")}`;
      }
    }
  };

  const navItem = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
      active ? "bg-violet/15 font-medium text-violet" : "text-fog hover:bg-panel hover:text-ink"
    }`;

  const channelCount = (channel: string) =>
    summary?.channels.find((c) => c.channel === channel)?.count ?? 0;

  const heading = (() => {
    switch (view.type) {
      case "questions":
        return t("community.questions");
      case "unanswered":
        return t("community.unanswered");
      case "projects":
        return t("community.projects");
      case "challenges":
        return t("community.challenges");
      case "channel":
        return `# ${CHANNEL_LABELS[view.channel as keyof typeof CHANNEL_LABELS] ?? view.channel}`;
      case "tag":
        return `#${view.tag}`;
      default:
        return t("community.heading");
    }
  })();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">{t("community.heading")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            {t("community.tagline")}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-7 text-fog">
            {t("community.sub")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/community/ask"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            <IconPlus size={15} /> {t("community.askOrShare")}
          </Link>
        </div>
      </div>

      {/* Mobile channel chips (feed-first; desktop uses the left sidebar) */}
      <nav aria-label="Community channels" className="mt-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {(
          [
            ["home", t("community.heading")],
            ["questions", t("community.questions")],
            ["projects", t("community.projects")],
            ...COMMUNITY_CHANNELS.map((c) => [`channel:${c}`, `# ${CHANNEL_LABELS[c]}`] as const),
          ] as const
        ).map(([key, label]) => {
          const active =
            (key === "home" && view.type === "home" && !query) ||
            (key === "questions" && view.type === "questions") ||
            (key === "projects" && view.type === "projects") ||
            (key.startsWith("channel:") && view.type === "channel" && view.channel === key.slice(8));
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setQuery("");
                if (key === "home") setView({ type: "home" });
                else if (key === "questions") setView({ type: "questions" });
                else if (key === "projects") setView({ type: "projects" });
                else setView({ type: "channel", channel: key.slice(8) });
              }}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                active
                  ? "border-violet/60 bg-violet/15 text-violet"
                  : "border-line bg-card text-fog hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_270px]">
        {/* Left sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6">
            <nav aria-label="Community sections" className="space-y-1">
              <button type="button" className={navItem(view.type === "home")} onClick={() => { setQuery(""); setView({ type: "home" }); }}>
                <IconHome size={15} /> {t("community.projects") === "Proyek" ? "Beranda" : "Home"}
              </button>
              <button type="button" className={navItem(view.type === "questions")} onClick={() => { setQuery(""); setView({ type: "questions" }); }}>
                <IconSparkle size={15} /> {t("community.questions")}
                {summary ? (
                  <span className="ml-auto text-[11px] text-mist">{summary.questionCount}</span>
                ) : null}
              </button>
              <button type="button" className={navItem(view.type === "unanswered")} onClick={() => { setQuery(""); setView({ type: "unanswered" }); }}>
                <IconLoop size={15} /> {t("community.unanswered")}
              </button>
              <button type="button" className={navItem(view.type === "projects")} onClick={() => { setQuery(""); setView({ type: "projects" }); }}>
                <IconAppWindow size={15} /> {t("community.projects")}
              </button>
              <div className="pt-3 pb-1 pl-3 font-mono text-[10px] uppercase tracking-[0.14em] text-mist">
                {t("community.channels")}
              </div>
              {COMMUNITY_CHANNELS.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  className={navItem(view.type === "channel" && view.channel === channel)}
                  onClick={() => { setQuery(""); setView({ type: "channel", channel }); }}
                >
                  <span className="text-mist">#</span> {channelLabel(channel, t as unknown as (key: string) => string)}
                  <span className="ml-auto text-[11px] text-mist">{channelCount(channel)}</span>
                </button>
              ))}
              <div className="pt-3 pb-1 pl-3 font-mono text-[10px] uppercase tracking-[0.14em] text-mist">
                {t("community.create")}
              </div>
              <Link href="/dashboard/extensions" className={navItem(false)}>
                <IconBlocks size={15} /> {t("dash.extensions")}
                <IconArrowUpRight size={12} className="ml-auto text-mist" />
              </Link>
              <button
                type="button"
                className={navItem(view.type === "challenges")}
                onClick={() => setView({ type: "challenges" })}
              >
                <IconGamepad size={15} /> {t("community.challenges")}
              </button>
              <Link href={`/creators/${user?.username ?? "-"}`} className={navItem(false)} onClick={(e) => { if (!user) e.preventDefault(); }}>
                <IconUsers size={15} /> {t("community.profiles")}
              </Link>
            </nav>
            {summary && (summary.questionCount > 0 || summary.answerCount > 0) ? (
              <p className="px-3 text-[11px] leading-5 text-mist">
                {summary.questionCount} {t("community.questions").toLowerCase()} ·{" "}
                {summary.answerCount} {t("community.answers")} — {t("community.helpfulCreators")}.
              </p>
            ) : null}
          </div>
        </aside>

        {/* Center feed */}
        <section aria-label="Community feed" className="min-w-0">
          {view.type === "challenges" ? (
            <div className="rounded-2xl border border-line bg-card p-8 text-center">
              <p className="text-[15px] font-medium text-ink">{t("community.challengesSoon")}</p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-fog">
                {t("community.challengesSoonSub")}
              </p>
              <button
                type="button"
                onClick={() => setView({ type: "channel", channel: "showcase" })}
                className="mt-4 inline-flex h-9 items-center rounded-lg border border-violet/50 bg-violet/10 px-4 text-[13px] font-medium text-violet hover:bg-violet/20"
              >
                {t("community.browseShowcase")}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[17px] font-semibold text-ink">{heading}</h2>
                <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-card p-1">
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={sort === s.key}
                      onClick={() => setSort(s.key)}
                      className={`h-7 rounded-md px-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                        sort === s.key ? "bg-violet/15 text-violet" : "text-fog hover:text-ink"
                      }`}
                    >
                      {t(s.keyName as TranslationKey)}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={search} className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("community.search")}
                    aria-label={t("community.search")}
                    className="h-10 w-full rounded-lg border border-line bg-card pl-9 pr-3 text-[13px] text-ink placeholder:text-mist focus:border-violet/60 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 rounded-lg border border-line bg-card px-4 text-[13px] font-medium text-fog transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  {t("community.searchButton")}
                </button>
              </form>

              {query ? (
                <p className="mt-3 text-[12px] text-mist">
                  Results for “{query}” ·{" "}
                  <button
                    type="button"
                    className="text-violet hover:underline"
                    onClick={() => {
                      setQuery("");
                      void loadFeed();
                    }}
                  >
                    clear
                  </button>
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {loadError ? <p className="text-[13px] text-rose">{loadError}</p> : null}
                {posts === null && !loadError ? (
                  <div className="space-y-3" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-card" />
                    ))}
                  </div>
                ) : null}
                {posts?.length === 0 ? (
                  <div className="rounded-2xl border border-line bg-card p-8 text-center">
                    <p className="text-[14px] font-medium text-ink">{t("community.nothingYet")}</p>
                    <p className="mx-auto mt-1 max-w-sm text-[13px] leading-6 text-fog">
                      {t("community.nothingYetSub")}
                    </p>
                    <Link
                      href="/community/ask"
                      className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white hover:bg-violet"
                    >
                      <IconPlus size={14} /> {t("community.firstPost")}
                    </Link>
                  </div>
                ) : null}
                {posts?.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onVote={() => void toggleVote(post)}
                    onTag={(tag) => {
                      setQuery("");
                      setView({ type: "tag", tag });
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Right sidebar */}
        <aside className="min-w-0 lg:col-span-2 xl:col-span-1">
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
            <section aria-label="Trending tags" className="rounded-2xl border border-line bg-card p-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mist">{t("community.trendingTags")}</h3>
              {summary && summary.trendingTags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {summary.trendingTags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => { setQuery(""); setView({ type: "tag", tag: t.tag }); }}
                      className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] text-fog transition-colors hover:border-violet/50 hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                    >
                      #{t.tag} <span className="text-mist">{t.count}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12px] leading-5 text-mist">
                  {t("community.tagsEmpty")}
                </p>
              )}
            </section>

            <section aria-label="Featured projects" className="rounded-2xl border border-line bg-card p-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mist">{t("community.freshProjects")}</h3>
              {featured.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {featured.map((p) => (
                    <li key={p.slug} className="flex items-center gap-3">
                      <ProjectThumb slug={p.slug} name={p.name} className="h-10 w-14 shrink-0 rounded-md border border-line object-cover" />
                      <div className="min-w-0">
                        <Link href={`/p/${p.slug}`} className="block truncate text-[13px] font-medium text-ink hover:text-violet">
                          {p.name}
                        </Link>
                        <p className="truncate text-[11px] text-mist">
                          {projectTypeLabel(p.type)} · @{p.author}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] leading-5 text-mist">
                  {t("community.nothingPublished").split("—")[0]} —{" "}
                  <Link href="/dashboard/templates" className="text-violet hover:underline">
                    build one
                  </Link>{" "}
                  and publish it.
                </p>
              )}
            </section>

            <section aria-label="Helpful creators" className="rounded-2xl border border-line bg-card p-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mist">{t("community.helpfulCreators")}</h3>
              {summary && summary.helpfulCreators.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {summary.helpfulCreators.map((c) => (
                    <li key={c.username} className="flex items-center justify-between gap-2">
                      <Link href={`/creators/${c.username}`} className="truncate text-[13px] text-ink hover:text-violet">
                        {c.displayName || `@${c.username}`}
                      </Link>
                      <span className="shrink-0 text-[11px] text-mist" title="Accepted answers">
                        <IconCheck size={12} className="mr-1 inline text-mint" />
                        {c.acceptedAnswers}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] leading-5 text-mist">
                  {t("community.helpfulEmpty")}
                </p>
              )}
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}

function channelLabel(channel: string, t: (key: string) => string): string {
  const translated = t(`channel.${channel}`);
  return translated === `channel.${channel}` ? channel : translated;
}

function PostCard({
  post,
  onVote,
  onTag,
}: {
  post: CommunityPost;
  onVote: () => void;
  onTag: (tag: string) => void;
}) {
  const { t } = useI18n();
  return (
    <article className="rounded-2xl border border-line bg-card p-5 transition-colors hover:border-line/80">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={onVote}
          aria-label={post.viewerVoted ? "Remove upvote" : "Upvote"}
          className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
            post.viewerVoted
              ? "border-violet/60 bg-violet/15 text-violet"
              : "border-line bg-panel text-fog hover:border-violet/40 hover:text-violet"
          }`}
        >
          <span aria-hidden>▲</span>
          {post.upvotes}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-mist">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                post.kind === "question" ? "bg-sky/15 text-sky" : "bg-violet/15 text-violet"
              }`}
            >
              {post.kind === "question" ? t("community.question") : t("community.discussion")}
            </span>
            <span># {channelLabel(post.channel, t as unknown as (key: string) => string)}</span>
            {post.acceptedReplyId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 font-medium text-mint">
                <IconCheck size={11} /> {t("community.answered")}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1.5 text-[15px] font-semibold leading-6 text-ink">
            <Link href={`/community/post/${post.id}`} className="hover:text-violet">
              {post.title}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-fog">{post.body}</p>

          {post.projectSlug ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-panel p-2.5">
              <ProjectThumb
                slug={post.projectSlug}
                name={post.projectName ?? post.projectSlug}
                className="h-12 w-20 shrink-0 rounded-lg border border-line object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{post.projectName}</p>
                <p className="text-[11px] text-mist">{projectTypeLabel(post.projectType ?? "app")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/p/${post.projectSlug}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-deep px-3 text-[12px] font-medium text-white hover:bg-violet"
                >
                  {t("community.open")} <IconArrowUpRight size={12} />
                </Link>
                <CompactRemixButton slug={post.projectSlug} next={`/community/post/${post.id}`} />
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mist">
            <Link href={`/creators/${post.author}`} className="font-medium text-fog hover:text-violet">
              @{post.author}
            </Link>
            <span>{formatRelativeDate(post.createdAt)}</span>
            <Link href={`/community/post/${post.id}`} className="hover:text-violet">
              {post.replyCount} {post.replyCount === 1 ? t("community.answer") : t("community.answers")}
            </Link>
            {post.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTag(tag)}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] transition-colors hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
