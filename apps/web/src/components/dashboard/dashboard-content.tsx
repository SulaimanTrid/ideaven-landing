"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ButtonLink, Chip } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";
import { authApi } from "@/lib/api";
import { useProjects } from "@/lib/use-projects";
import { useI18n } from "@/lib/i18n/i18n";
import { ProjectCard } from "@/components/dashboard/project-card";
import { Block, BlockInput } from "@/components/visuals/block";
import { IconPlus, IconRun } from "@/components/visuals/icons";
import { useExtensionsSummary } from "@/lib/use-extensions-summary";

/**
 * The workspace home: a welcome hero with the create-project action and the
 * {t("dash.recentProjects")} section. The empty state is honest — no fake statistics or
 * seeded data — and becomes a real library view as soon as projects exist.
 */
export function DashboardContent() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const recent = useProjects({ q: "", status: "all", sort: "opened", limit: 6 });
  const extensions = useExtensionsSummary();

  if (!user) return null;

  const resend = async () => {
    setResendState("sending");
    try {
      await authApi.resendVerification(user.email);
      setResendState("sent");
    } catch {
      setResendState("idle");
    }
  };

  const hasProjects = recent.projects.length > 0;

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 pb-24 sm:px-6 lg:pt-14">
      <div
        aria-hidden="true"
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:radial-gradient(70%_100%_at_50%_0%,black,transparent)]"
      />

      <div className="relative">
        <Chip tone="violet">{t("dash.projects") === "Proyek" ? "Ruang Kerja" : "Workspace"}</Chip>

        <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              {t("dash.welcome")}
            </h1>
            <p className="mt-3 text-pretty text-lg leading-8 text-fog">
              Good to see you, {user.displayName}. {t("dash.welcomeSub")}
            </p>
          </div>
          <ButtonLink
            href="/dashboard/projects/new"
            size="lg"
            className="shrink-0 self-start md:self-auto"
          >
            <IconPlus size={16} />
            {t("dash.createProjectBtn")}
          </ButtonLink>
        </div>

        {!user.emailVerified ? (
          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-amber/30 bg-amber/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] leading-5 text-amber">
              {t("dash.verifyBanner")}
            </p>
            {resendState === "sent" ? (
              <span className="text-[13px] text-amber/80">New link sent — check your inbox.</span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={resend}
                disabled={resendState === "sending"}
              >
                {resendState === "sending" ? t("dash.sending") : t("dash.resendLink")}
              </Button>
            )}
          </div>
        ) : null}

        <section aria-labelledby="recent-projects-heading" className="mt-14">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="recent-projects-heading"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
            >
              {t("dash.recentProjects")}
            </h2>
            {hasProjects ? (
              <Link
                href="/dashboard/projects"
                className="shrink-0 text-[13px] text-mist underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
              >
                {t("dash.viewAll")}
              </Link>
            ) : null}
          </div>

          {recent.loading && !hasProjects ? (
            <div
              className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              aria-hidden="true"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-56 animate-pulse rounded-2xl border border-line bg-card/60"
                />
              ))}
            </div>
          ) : recent.error && !hasProjects ? (
            <div className="mt-6 flex flex-col items-start rounded-2xl border border-dashed border-line bg-card/50 px-6 py-8">
              <p className="text-sm text-fog">{recent.error}</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => void recent.reload()}>
                Try again
              </Button>
            </div>
          ) : hasProjects ? (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line bg-card/50 px-6 py-16 text-center">
              {/* Decorative block stack — the product's core motif. */}
              <div aria-hidden="true" className="flex flex-col items-center">
                <Block color="var(--color-violet-deep)" width={236} textClassName="text-white">
                  <IconRun size={13} />
                  when <BlockInput>start</BlockInput> clicked
                </Block>
                <Block color="var(--color-mint)" width={204} textClassName="text-[#0b0e16]">
                  move <BlockInput>10</BlockInput> steps
                </Block>
                <Block color="var(--color-card)" width={222} textClassName="text-fog">
                  say <BlockInput>Hello, world</BlockInput>
                </Block>
              </div>

              <p className="mt-8 text-lg font-medium">{t("dash.emptyTitle")}</p>
              <p className="mt-1 text-fog">Your next idea could start here.</p>
              <ButtonLink href="/dashboard/projects/new" className="mt-6">
                {t("dash.createFirst")}
              </ButtonLink>
            </div>
          )}

          {!hasProjects && !recent.error ? (
            <p className="mt-6 text-center text-[13px] text-mist">
              Blocks, TypeScript, and a live preview — the editor arrives in the next phase.{" "}
              <Link
                href="/#journey"
                className="underline underline-offset-4 hover:text-ink"
              >
                See the roadmap
              </Link>
            </p>
          ) : null}
        </section>

        <section aria-labelledby="extensions-heading" className="mt-12">
          <div className="flex items-center justify-between gap-3">
            <h2 id="extensions-heading" className="text-[19px] font-semibold tracking-tight text-ink">
              {t("dash.extensionsHeading")}
            </h2>
            <Link href="/dashboard/extensions" className="text-[13px] text-violet hover:underline">
              {t("dash.openExtensions")} →
            </Link>
          </div>
          <p className="mt-1 text-[13px] text-fog">
                        {t("dash.extensionsSub")}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">{t("dash.yours")}</p>
              <p className="mt-1 text-[22px] font-semibold text-ink">{extensions.yours === null ? "…" : extensions.yours}</p>
              <p className="text-[12px] text-mist">authored extensions</p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">{t("dash.installed")}</p>
              <p className="mt-1 text-[22px] font-semibold text-ink">{extensions.installed === null ? "…" : extensions.installed}</p>
              <p className="text-[12px] text-mist">in your builder palette</p>
            </div>
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">{t("dash.published")}</p>
              <p className="mt-1 text-[22px] font-semibold text-ink">{extensions.published === null ? "…" : extensions.published}</p>
              <p className="text-[12px] text-mist">on the public shelf</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
