"use client";

import { ButtonLink, Chip, Container } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { IconArrowRight } from "@/components/visuals/icons";
import { useI18n } from "@/lib/i18n/i18n";
import { EditorVisual } from "./editor-visual";

export function Hero() {
  const { t } = useI18n();
  const [lead = "", trail = ""] = t("landing.heroTitle").split(/your way\.\s*|caramu\.\s*/);
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden pt-32 pb-20 sm:pt-36 sm:pb-24"
    >
      <div
        aria-hidden="true"
        className="bg-dots absolute inset-0 [mask-image:radial-gradient(70%_55%_at_50%_18%,black,transparent)]"
      />
      <div className="relative">
        <Container className="text-center">
          <Reveal>
            <Chip tone="mint">
              <span
                aria-hidden="true"
                className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-mint"
              />
              In active development
            </Chip>
          </Reveal>

          <Reveal delay={80}>
            <h1
              id="hero-title"
              className="mx-auto mt-6 max-w-3xl text-balance text-[2.75rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-7xl"
            >
              {lead}
              <span className="text-violet">{trail || t("landing.heroTitle").slice(lead.length)}</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-fog sm:text-xl sm:leading-9">
              {t("landing.heroSub")}
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/start" size="lg">
                {t("landing.startBuilding")}
                <IconArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="#explore" variant="secondary" size="lg">
                Explore Ideaven
              </ButtonLink>
            </div>
            <p className="mt-5 text-sm text-mist">
              {t("landing.finalSub").split(".")[0]}. (2.0 beta)
            </p>
          </Reveal>
        </Container>

        <Container className="mt-16 max-w-5xl sm:mt-20">
          <Reveal delay={120}>
            <EditorVisual />
          </Reveal>
        </Container>
      </div>
    </section>
  );
}
