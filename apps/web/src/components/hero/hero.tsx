import { ButtonLink, Chip, Container } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { IconArrowRight } from "@/components/visuals/icons";
import { EditorVisual } from "./editor-visual";

export function Hero() {
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
              Build it <span className="text-violet">your way.</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-fog sm:text-xl sm:leading-9">
              Create games and apps visually with blocks, or write real
              TypeScript code when you&rsquo;re ready.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/start" size="lg">
                Start Building
                <IconArrowRight size={16} />
              </ButtonLink>
              <ButtonLink href="#explore" variant="secondary" size="lg">
                Explore Ideaven
              </ButtonLink>
            </div>
            <p className="mt-5 text-sm text-mist">
              From your first block to your first real creation.
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
