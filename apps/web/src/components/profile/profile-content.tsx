"use client";

import Link from "next/link";
import { Chip } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";
import { Avatar } from "@/components/profile/avatar";
import { ButtonLink } from "@ideaven/ui";

/**
 * The signed-in user's own profile view. Private by nature (email and dates
 * included); the public /u/[username] page is a later milestone.
 */
export function ProfileContent() {
  const { user } = useAuth();
  if (!user) return null;

  const created = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-28 pb-20 sm:px-6">
      <Chip tone="mint">Phase 3 · profile</Chip>

      <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <Avatar displayName={user.displayName} avatarUrl={user.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{user.displayName}</h1>
            <p className="mt-0.5 truncate text-fog">@{user.username}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {user.emailVerified ? (
                <Chip tone="mint">Verified</Chip>
              ) : (
                <Chip tone="amber">Unverified</Chip>
              )}
              <span className="text-[13px] text-mist">Joined {created}</span>
            </div>
          </div>
          <ButtonLink href="/settings" variant="secondary" size="sm" className="sm:self-start">
            Edit profile
          </ButtonLink>
        </div>

        <div className="border-t border-line p-6">
          <h2 className="sr-only">About</h2>
          {user.bio ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-line text-fog">{user.bio}</p>
          ) : (
            <p className="text-[15px] text-mist">
              No bio yet.{" "}
              <Link href="/settings" className="text-fog underline underline-offset-4 hover:text-ink">
                Add one
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="account-heading"
        className="mt-6 overflow-hidden rounded-2xl border border-line bg-card"
      >
        <h2 id="account-heading" className="sr-only">
          Account
        </h2>
        <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2">
          <Row term="Email" detail={user.email} />
          <Row term="Username" detail={`@${user.username}`} />
          <Row term="Account ID" detail={user.id} mono />
          <Row term="Member since" detail={created} />
        </dl>
      </section>
    </div>
  );
}

function Row({ term, detail, mono = false }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="font-mono text-[11px] tracking-[0.14em] text-mist uppercase">{term}</dt>
      <dd
        className={`mt-1 truncate text-sm ${mono ? "font-mono text-[12px] text-fog" : ""}`}
        title={detail}
      >
        {detail}
      </dd>
    </div>
  );
}
