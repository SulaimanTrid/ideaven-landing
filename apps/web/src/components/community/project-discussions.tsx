"use client";

import { useState } from "react";
import Link from "next/link";
import { type CommunityPost } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n";
import { IconArrowUpRight } from "@/components/visuals/icons";

/**
 * The Discussions section of a public project page (TASK 07 + TASK 10):
 * real community posts attached to this project, translated through the
 * i18n context (the surrounding page is a server component).
 */
export function ProjectDiscussions({
  slug,
  discussions,
}: {
  slug: string;
  discussions: CommunityPost[];
}) {
  const { t } = useI18n();
  return (
    <section aria-label="Community discussions" className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">
          {discussions.length > 0
            ? `${t("community.discussions")} (${discussions.length})`
            : t("community.discussions")}
        </h2>
        <Link
          href={`/community/ask?project=${encodeURIComponent(slug)}&kind=discussion`}
          className="text-[13px] font-medium text-violet hover:underline"
        >
          {t("community.startDiscussion")} →
        </Link>
      </div>
      {discussions.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {discussions.map((post) => (
            <li key={post.id} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-mist">
                <span className="rounded-full bg-sky/15 px-2 py-0.5 font-medium text-sky">
                  {post.kind === "question" ? t("community.question") : t("community.discussion")}
                </span>
                <span>{formatRelativeDate(post.createdAt)}</span>
                <span>
                  {post.replyCount} {post.replyCount === 1 ? t("community.answer") : t("community.answers")}
                </span>
              </div>
              <h3 className="mt-1.5 text-[15px] font-semibold text-ink">
                <Link href={`/community/post/${post.id}`} className="hover:text-violet">
                  {post.title}
                </Link>
              </h3>
              <p className="mt-1 line-clamp-2 text-[13px] leading-6 text-fog">{post.body}</p>
              <p className="mt-2 text-[12px] text-mist">
                by{" "}
                <Link href={`/creators/${post.author}`} className="text-fog hover:text-violet">
                  @{post.author}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-line bg-card p-6 text-center text-[13px] leading-6 text-fog">
          {t("community.noDiscussions")}
        </p>
      )}
    </section>
  );
}
