import { Chip, Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { HighlightedCode, type CodeToken } from "@/components/visuals/code";
import { CollisionScriptBlocks } from "@/components/visuals/script-blocks";

const SNIPPET: readonly CodeToken[] = [
  ["player", "text-mint"],
  [".onCollision", "text-sky"],
  ["(", "text-mist"],
  ["coin", "text-mint"],
  [", ", "text-mist"],
  ["() ", "text-mist"],
  ["=>", "text-violet"],
  [" {", "text-mist"],
  ["\n  score ", undefined],
  ["+=", "text-violet"],
  [" ", undefined],
  ["1", "text-rose"],
  [";", "text-mist"],
  ["\n}", undefined],
];

function ModeCard({
  title,
  tagline,
  caption,
  chip,
  children,
}: {
  title: string;
  tagline: string;
  caption: string;
  chip: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-white/15">
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-ink">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-fog">{tagline}</p>
        </div>
        {chip}
      </div>
      <div className="flex min-h-[220px] flex-1 items-center justify-center px-6 py-8">
        {children}
      </div>
      <p className="border-t border-line px-6 py-2.5 font-mono text-[10.5px] tracking-[0.1em] text-mist">
        {caption}
      </p>
    </article>
  );
}

export function CoreIdea() {
  return (
    <section aria-labelledby="core-idea-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader
            index="03"
            kicker="The core idea"
            title={
              <span id="core-idea-title">One idea. Many ways to build.</span>
            }
            lead="Every Ideaven project speaks two languages. Choose the one that fits you — or switch between them as you grow."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal delay={60}>
            <ModeCard
              title="Blocks"
              tagline="Drag. Connect. Experiment."
              caption="coin.script — visual"
              chip={<Chip tone="amber">Visual</Chip>}
            >
              <CollisionScriptBlocks />
            </ModeCard>
          </Reveal>

          <Reveal delay={140}>
            <ModeCard
              title="Code"
              tagline="Write real TypeScript."
              caption="player.scene.ts — typescript"
              chip={<Chip tone="sky">TypeScript</Chip>}
            >
              <div className="w-full max-w-xs rounded-xl border border-line bg-panel/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-md border border-line bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-fog">
                    player.scene.ts
                  </span>
                  <span className="font-mono text-[10px] text-mist">ts</span>
                </div>
                <HighlightedCode tokens={SNIPPET} />
              </div>
            </ModeCard>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <p className="mt-10 text-center font-mono text-sm tracking-[0.2em] text-fog uppercase">
            Same idea. <span className="text-violet">Your choice.</span>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
