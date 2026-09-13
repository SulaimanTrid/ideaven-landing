"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  COMMUNITY_CHANNELS,
  CHANNEL_LABELS,
  communityApi,
  projectApi,
  type CommunityPost,
} from "@/lib/api";
import { useAuth } from "@/auth/auth-provider";
import { useI18n } from "@/lib/i18n/i18n";
import { ApiError } from "@/types/auth";

/**
 * Create a community post: a question (help me build this) or a discussion
 * (show & tell). Attaching one of your published projects is real — the
 * server verifies the project is yours-and-published before accepting it.
 */
export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskForm />
    </Suspense>
  );
}

function AskForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth();
  const { t } = useI18n();

  const [kind, setKind] = useState<"question" | "discussion">(
    searchParams.get("kind") === "discussion" ? "discussion" : "question",
  );
  const [channel, setChannel] = useState<string>(searchParams.get("channel") ?? "help");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [projectSlug, setProjectSlug] = useState<string>(searchParams.get("project") ?? "");
  const [published, setPublished] = useState<{ slug: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    projectApi
      .list({ status: "published", limit: 50 })
      .then((response) => setPublished(response.projects.map((p) => ({ slug: p.slug, name: p.name }))))
      .catch(() => setPublished([]));
  }, [user]);

  const tagList = useMemo(
    () =>
      tags
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [tags],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const post: CommunityPost = await communityApi.createPost({
        kind,
        channel,
        title: title.trim(),
        body: body.trim(),
        tags: tagList,
        projectSlug: projectSlug || undefined,
      });
      router.push(`/community/post/${post.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the post. Try again shortly.");
      setBusy(false);
    }
  };

  if (status !== "loading" && !user) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-ink">{t("community.joinConversation")}</h1>
        <p className="mt-2 text-[14px] leading-7 text-fog">
          {t("community.joinSub")}
        </p>
        <Link
          href={`/login?next=${encodeURIComponent("/community/ask")}`}
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-violet-deep px-5 text-[13px] font-medium text-white hover:bg-violet"
        >
          {t("community.signInToContinue")}
        </Link>
      </main>
    );
  }

  const fieldLabel = "block text-[12px] font-medium uppercase tracking-[0.1em] text-mist";
  const inputClass =
    "mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-ink placeholder:text-mist focus:border-violet/60 focus:outline-none";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/community" className="text-[13px] text-violet hover:underline">
        ← Community
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{t("community.askTitle")}</h1>
      <p className="mt-1 text-[14px] text-fog">
        {t("community.askSub")}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-line bg-card p-6">
        <fieldset>
          <legend className={fieldLabel}>{t("community.whatIsThis")}</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(
              [
                ["question", t("community.questionChoice"), t("community.questionHint")],
                ["discussion", t("community.discussionChoice"), t("community.discussionHint")],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value);
                  setChannel(value === "question" ? "help" : "showcase");
                }}
                className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                  kind === value
                    ? "border-violet/60 bg-violet/10"
                    : "border-line bg-panel hover:border-violet/40"
                }`}
              >
                <span className={`block text-[13px] font-medium ${kind === value ? "text-violet" : "text-ink"}`}>
                  {label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-mist">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="channel" className={fieldLabel}>
            {t("community.channel")}
          </label>
          <select id="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className={inputClass}>
            {COMMUNITY_CHANNELS.map((c) => (
              <option key={c} value={c}>
                # {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className={fieldLabel}>
            {t("community.titleLabel")}
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            required
            minLength={5}
            placeholder={kind === "question" ? "How do I make a score system?" : "My first coin runner game"}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="body" className={fieldLabel}>
            {t("community.details")}
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={5000}
            required
            placeholder={
              kind === "question"
                ? "What are you building, what did you try, and what happened?"
                : "What did you build, how does it work, and what feedback do you want?"
            }
            className={`${inputClass} resize-y leading-6`}
          />
          <p className="mt-1 text-right text-[11px] text-mist">{body.length}/5000</p>
        </div>

        <div>
          <label htmlFor="tags" className={fieldLabel}>
            {t("community.tagsLabel")}
          </label>
          <input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="blocks, game-dev, extensions"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="project" className={fieldLabel}>
            {t("community.attachProject")}
          </label>
          <select
            id="project"
            value={projectSlug}
            onChange={(e) => setProjectSlug(e.target.value)}
            className={inputClass}
          >
            <option value="">{t("community.noProject")}</option>
            {published.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          {user && published.length === 0 ? (
            <p className="mt-1 text-[11px] leading-4 text-mist">
              {t("community.nothingPublished").split("—")[0]} —{" "}
              <Link href="/dashboard/templates" className="text-violet hover:underline">
                build and publish a project
              </Link>{" "}
              to attach it here.
            </p>
          ) : null}
        </div>

        {error ? <p className="text-[13px] text-rose">{error}</p> : null}

        <div className="flex items-center justify-end gap-3">
          <Link href="/community" className="text-[13px] text-mist hover:text-ink">
            {t("community.cancel")}
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg bg-violet-deep px-5 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
          >
            {busy ? t("community.posting") : kind === "question" ? t("community.postQuestion") : t("community.postDiscussion")}
          </button>
        </div>
      </form>
    </main>
  );
}
