"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CHANNEL_LABELS,
  communityApi,
  type CommunityPost,
  type CommunityReply,
} from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { projectTypeLabel } from "@/lib/project-meta";
import { useAuth } from "@/auth/auth-provider";
import { useI18n, type TranslationKey } from "@/lib/i18n/i18n";
import { apiErrorKey } from "@/lib/i18n/errors";
import { ApiError } from "@/types/auth";
import { IconArrowUpRight, IconCheck, IconPlus, IconTrash } from "@/components/visuals/icons";
import { ProjectThumb } from "@/components/community/project-thumb";
import { CompactRemixButton } from "@/components/community/compact-remix-button";

const REPORT_REASONS = [
  { key: "spam", label: "Spam" },
  { key: "abusive", label: "Abusive" },
  { key: "inappropriate", label: "Inappropriate" },
  { key: "other", label: "Other" },
];

/**
 * One community post with its answers. Interactions mirror the API's real
 * rules: one upvote per viewer (toggle), only the asker can accept an
 * answer, authors can soft-delete their own posts, and reports are recorded
 * for moderation without pretending an anonymous review queue exists.
 */
export function PostDetail({ post, replies }: { post: CommunityPost; replies: CommunityReply[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const tError = (err: unknown, fallback: TranslationKey) =>
    (err instanceof ApiError ? t(apiErrorKey(err) ?? fallback) : t(fallback));
  const [current, setCurrent] = useState(post);
  const [answers, setAnswers] = useState(replies);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ kind: "post" | "reply"; id: string } | null>(null);

  // The server render fetches anonymously (no cookies server-side), so the
  // viewer's own state — author? voted? — must be refreshed from the client
  // once the session is known. Until then the UI shows the anonymous truth.
  useEffect(() => {
    let cancelled = false;
    communityApi
      .post(post.id)
      .then((data) => {
        if (cancelled) return;
        setCurrent(data.post);
        setAnswers(data.replies);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [post.id, user?.id]);

  const requireSignIn = () => {
    router.push(`/login?next=${encodeURIComponent(`/community/post/${post.id}`)}`);
  };

  const votePost = async () => {
    if (!user) return requireSignIn();
    setError(null);
    try {
      setCurrent(await communityApi.votePost(current.id));
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    }
  };

  const voteReply = async (reply: CommunityReply) => {
    if (!user) return requireSignIn();
    setError(null);
    try {
      const updated = await communityApi.voteReply(reply.id);
      setAnswers((list) => list.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    }
  };

  const acceptReply = async (reply: CommunityReply) => {
    setError(null);
    try {
      setCurrent(await communityApi.acceptReply(current.id, reply.id));
      setAnswers((list) =>
        list.map((r) => ({ ...r, accepted: r.id === reply.id })),
      );
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    }
  };

  const clearAccepted = async () => {
    setError(null);
    try {
      setCurrent(await communityApi.acceptReply(current.id, ""));
      setAnswers((list) => list.map((r) => ({ ...r, accepted: false })));
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    }
  };

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return requireSignIn();
    if (!replyBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await communityApi.createReply(current.id, replyBody.trim());
      setAnswers((list) => [...list, reply]);
      setReplyBody("");
      setCurrent((p) => ({ ...p, replyCount: p.replyCount + 1 }));
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    } finally {
      setBusy(false);
    }
  };

  const deletePost = async () => {
    if (!window.confirm("Delete this post? This cannot be undone from the community.")) return;
    setBusy(true);
    try {
      await communityApi.deletePost(current.id);
      router.push("/community");
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
      setBusy(false);
    }
  };

  const deleteReply = async (reply: CommunityReply) => {
    if (!window.confirm("Delete this answer?")) return;
    setError(null);
    try {
      await communityApi.deleteReply(reply.id);
      setAnswers((list) => list.filter((r) => r.id !== reply.id));
      setCurrent((p) => ({ ...p, replyCount: Math.max(0, p.replyCount - 1) }));
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    }
  };

  const submitReport = async (reason: string) => {
    if (!reportTarget) return;
    setError(null);
    try {
      await communityApi.report(
        reportTarget.kind === "post"
          ? { postId: reportTarget.id, reason }
          : { replyId: reportTarget.id, reason },
      );
      setReportTarget(null);
      setNotice(t("community.reportDone"));
    } catch (err) {
      setError(tError(err, "errors.INTERNAL_ERROR"));
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/community" className="text-[13px] text-violet hover:underline">
        ← Community
      </Link>

      <article className="mt-4 rounded-2xl border border-line bg-card p-6">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => void votePost()}
            aria-label={current.viewerVoted ? "Remove upvote" : "Upvote"}
            className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
              current.viewerVoted
                ? "border-violet/60 bg-violet/15 text-violet"
                : "border-line bg-panel text-fog hover:border-violet/40 hover:text-violet"
            }`}
          >
            <span aria-hidden>▲</span>
            {current.upvotes}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-mist">
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  current.kind === "question" ? "bg-sky/15 text-sky" : "bg-violet/15 text-violet"
                }`}
              >
                {current.kind === "question" ? t("community.question") : t("community.discussion")}
              </span>
              <span># {CHANNEL_LABELS[current.channel]}</span>
              <span>{formatRelativeDate(current.createdAt)}</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">{current.title}</h1>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-7 text-fog">{current.body}</p>

            {current.projectSlug ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-panel p-3">
                <ProjectThumb
                  slug={current.projectSlug}
                  name={current.projectName ?? current.projectSlug}
                  className="h-14 w-24 shrink-0 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{current.projectName}</p>
                  <p className="text-[11px] text-mist">{projectTypeLabel(current.projectType ?? "app")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/p/${current.projectSlug}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-deep px-3 text-[12px] font-medium text-white hover:bg-violet"
                  >
                    Open <IconArrowUpRight size={12} />
                  </Link>
                  <CompactRemixButton slug={current.projectSlug} next={`/community/post/${current.id}`} />
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-mist">
              <Link href={`/creators/${current.author}`} className="font-medium text-fog hover:text-violet">
                @{current.author}
              </Link>
              {current.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-[11px]">
                  #{tag}
                </span>
              ))}
              {current.viewerIsAuthor ? (
                <button
                  type="button"
                  onClick={() => void deletePost()}
                  className="ml-auto inline-flex items-center gap-1 text-[12px] text-rose hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  <IconTrash size={13} /> {t("community.deletePost")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setReportTarget({ kind: "post", id: current.id })}
                  className="ml-auto text-[12px] text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  Report
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      {error ? <p className="mt-3 text-[13px] text-rose">{error}</p> : null}
      {notice ? <p className="mt-3 text-[13px] text-mint">{notice}</p> : null}

      <section aria-label="Answers" className="mt-8">
        <h2 className="text-[15px] font-semibold text-ink">
          {answers.length} {answers.length === 1 ? "answer" : "answers"}
        </h2>

        {answers.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-line bg-card p-6 text-center text-[13px] text-fog">
            {t("community.noDiscussions").split(".")[0]}.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {answers.map((reply) => (
              <li
                key={reply.id}
                className={`rounded-2xl border bg-card p-5 ${
                  reply.accepted ? "border-mint/50" : "border-line"
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => void voteReply(reply)}
                    aria-label={reply.viewerVoted ? "Remove upvote" : "Upvote"}
                    className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                      reply.viewerVoted
                        ? "border-violet/60 bg-violet/15 text-violet"
                        : "border-line bg-panel text-fog hover:border-violet/40 hover:text-violet"
                    }`}
                  >
                    <span aria-hidden>▲</span>
                    {reply.upvotes}
                  </button>
                  <div className="min-w-0 flex-1">
                    {reply.accepted ? (
                      <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-medium text-mint">
                        <IconCheck size={11} /> {t("community.acceptedAnswer")}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-[13px] leading-6 text-fog">{reply.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-mist">
                      <Link href={`/creators/${reply.author}`} className="font-medium text-fog hover:text-violet">
                        @{reply.author}
                      </Link>
                      <span>{formatRelativeDate(reply.createdAt)}</span>
                      {current.kind === "question" && current.viewerIsAuthor ? (
                        reply.accepted ? (
                          <button
                            type="button"
                            onClick={() => void clearAccepted()}
                            className="text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                          >
                            {t("community.unaccept")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void acceptReply(reply)}
                            className="inline-flex items-center gap-1 text-mint hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                          >
                            <IconCheck size={12} /> {t("community.acceptAnswer")}
                          </button>
                        )
                      ) : null}
                      {reply.viewerIsAuthor ? (
                        <button
                          type="button"
                          onClick={() => void deleteReply(reply)}
                          className="ml-auto inline-flex items-center gap-1 text-rose hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                        >
                          <IconTrash size={12} /> {t("community.deleteAnswer")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReportTarget({ kind: "reply", id: reply.id })}
                          className="ml-auto text-mist hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                        >
                          Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reportTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Report content">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
            <h3 className="text-[15px] font-semibold text-ink">{t("community.reportTitle")}</h3>
            <p className="mt-1 text-[12px] leading-5 text-mist">
              {t("community.reportSub")}
            </p>
            <div className="mt-4 grid gap-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason.key}
                  type="button"
                  onClick={() => void submitReport(reason.key)}
                  className="rounded-lg border border-line bg-panel px-3 py-2 text-left text-[13px] text-fog transition-colors hover:border-rose/50 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReportTarget(null)}
              className="mt-4 w-full rounded-lg px-3 py-2 text-[13px] text-mist hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={submitReply} className="mt-8 rounded-2xl border border-line bg-card p-5">
        <h2 className="text-[15px] font-semibold text-ink">{t("community.yourAnswer")}</h2>
        {user ? (
          <>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder={t("community.answerPlaceholder")}
              aria-label="Write an answer"
              className="mt-3 w-full resize-y rounded-xl border border-line bg-panel p-3 text-[13px] leading-6 text-ink placeholder:text-mist focus:border-violet/60 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-mist">{replyBody.length}/5000</span>
              <button
                type="submit"
                disabled={busy || !replyBody.trim()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white transition-colors hover:bg-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
              >
                <IconPlus size={14} /> {busy ? t("community.posting") : t("community.postAnswer")}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-fog">{t("community.signInToAnswer")}</p>
            <Link
              href={`/login?next=${encodeURIComponent(`/community/post/${current.id}`)}`}
              className="inline-flex h-9 items-center rounded-lg bg-violet-deep px-4 text-[13px] font-medium text-white hover:bg-violet"
            >
              {t("community.signInToHelp")}
            </Link>
          </div>
        )}
      </form>
    </main>
  );
}
