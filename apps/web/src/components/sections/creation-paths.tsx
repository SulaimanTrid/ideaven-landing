"use client";

import Link from "next/link";
import { Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { CreationPreview } from "@/components/visuals/creation-preview";
import {
  IconAppWindow,
  IconArrowRight,
  IconCube3D,
  IconGamepad,
} from "@/components/visuals/icons";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * TASK 65 §8/§9: "THREE WAYS TO CREATE" — the three real creation
 * environments with who each is for, what capabilities exist, and CTAs that
 * enter the ONE canonical creation hub (/start → the Creation Hub). The
 * previews reuse the CreationPreview system (TASK 61) — no mock interfaces.
 * §9: extensions are positioned honestly — real blocks, real palette, no
 * marketplace-maturity claims.
 */

interface PathCard {
  type: "app" | "game" | "3d";
  titleKey: string;
  forKey: string;
  descKey: string;
  ctaKey: string;
  icon: React.ReactNode;
}

const PATHS: PathCard[] = [
  {
    type: "app",
    titleKey: "landing.pathAppTitle",
    forKey: "landing.pathAppFor",
    descKey: "landing.pathAppDesc",
    ctaKey: "landing.pathAppCta",
    icon: <IconAppWindow size={22} />,
  },
  {
    type: "game",
    titleKey: "landing.pathGameTitle",
    forKey: "landing.pathGameFor",
    descKey: "landing.pathGameDesc",
    ctaKey: "landing.pathGameCta",
    icon: <IconGamepad size={22} />,
  },
  {
    type: "3d",
    titleKey: "landing.path3dTitle",
    forKey: "landing.path3dFor",
    descKey: "landing.path3dDesc",
    ctaKey: "landing.path3dCta",
    icon: <IconCube3D size={22} />,
  },
];

export function CreationPaths() {
  const { t } = useI18n();
  return (
    <section
      id="ways-to-create"
      aria-labelledby="creation-paths-title"
      className="py-24 sm:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeader
            index="02"
            kicker={t("landing.pathsKicker")}
            title={<span id="creation-paths-title">{t("landing.pathsTitle")}</span>}
            lead={t("landing.pathsLead")}
          />
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PATHS.map((path, index) => (
            <Reveal key={path.type} delay={60 * index}>
              <article
                aria-label={`${t(path.titleKey as Parameters<typeof t>[0])} creation path`}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-white/15"
              >
                <div className="border-b border-line bg-panel p-4">
                  <CreationPreview type={path.type} className="h-32 w-full" />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink">
                      <span className="text-violet" aria-hidden="true">{path.icon}</span>
                      {t(path.titleKey as Parameters<typeof t>[0])}
                    </h3>
                  </div>
                  <p className="mt-1 text-[12.5px] font-medium text-mist">
                    {t(path.forKey as Parameters<typeof t>[0])}
                  </p>
                  <p className="mt-2 pb-6 text-sm leading-6 text-fog">
                    {t(path.descKey as Parameters<typeof t>[0])}
                  </p>
                  <Link
                    href={`/start?type=${path.type}`}
                    className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet/40 bg-violet/10 px-4 py-2.5 text-[13.5px] font-medium text-violet transition-colors hover:bg-violet/20 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                  >
                    {t(path.ctaKey as Parameters<typeof t>[0])}
                    <IconArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <p className="mx-auto mt-10 max-w-2xl text-center text-[13.5px] leading-6 text-mist">
            {t("landing.extensionsLine")}{" "}
            <Link
              href="/dashboard/extensions"
              className="text-violet underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              {t("landing.extensionsLink")}
            </Link>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
