"use client";

import { ButtonLink, Container } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { Block } from "@/components/visuals/block";
import { useI18n } from "@/lib/i18n/i18n";
import { IconArrowRight } from "@/components/visuals/icons";

export function FinalCta() {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="final-cta-title"
      className="relative overflow-hidden border-t border-line py-28 sm:py-36"
    >
      {/* soft violet wash + dim connected blocks, echoing the motif */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(45%_45%_at_50%_55%,rgb(108_88_245/0.13),transparent_70%)]"
      />
      <div aria-hidden="true" className="absolute inset-0 hidden lg:block">
        <div className="absolute top-[22%] left-[7%] -rotate-6 opacity-25">
          <Block color="var(--color-violet)" width={110} height={30}>
            Imagine
          </Block>
        </div>
        <div className="absolute top-[46%] left-[11%] mt-[26px] rotate-3 opacity-20">
          <Block color="var(--color-amber)" width={96} height={30}>
            Build
          </Block>
        </div>
        <div className="absolute right-[8%] bottom-[28%] rotate-6 opacity-25">
          <Block color="var(--color-mint)" width={100} height={30}>
            Share
          </Block>
        </div>
      </div>

      <Container className="relative text-center">
        <Reveal>
          <h2
            id="final-cta-title"
            className="mx-auto max-w-2xl text-balance text-3xl leading-[1.12] font-semibold tracking-tight sm:text-5xl"
          >
            {t("landing.finalTitle")}
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-fog">
            Start with a block. Write some code. See where your idea takes you.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/start" size="lg">
              Start Building
              <IconArrowRight size={16} />
            </ButtonLink>
            <ButtonLink href="#explore" variant="secondary" size="lg">
              Explore Ideaven
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
