import { Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import {
  IconBlocks,
  IconCode,
  IconEye,
  IconShare,
  IconSparkle,
} from "@/components/visuals/icons";

const FEATURES = [
  {
    title: "Visual First",
    desc: "Build without being blocked by syntax.",
    Icon: IconBlocks,
  },
  {
    title: "Real Code",
    desc: "Move from visual programming into TypeScript.",
    Icon: IconCode,
  },
  {
    title: "Contextual AI",
    desc: "Get help that understands your project.",
    Icon: IconSparkle,
  },
  {
    title: "Live Preview",
    desc: "Build, test, and iterate quickly.",
    Icon: IconEye,
  },
  {
    title: "Open Creation",
    desc: "Create things you can share and eventually publish.",
    Icon: IconShare,
  },
] as const;

export function WhyIdeaven() {
  return (
    <section aria-labelledby="why-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader
            index="10"
            kicker="Why Ideaven"
            title={<span id="why-title">Why Ideaven</span>}
            lead="Five principles, each tied to something concrete in the product roadmap — not a checklist of buzzwords."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ title, desc, Icon }, index) => (
            <Reveal
              key={title}
              delay={(index % 3) * 70}
              className={index === 4 ? "lg:col-start-2" : undefined}
            >
              <article className="h-full rounded-2xl border border-line bg-card p-6 transition-colors hover:border-white/15">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-violet">
                  <Icon size={17} />
                </span>
                <h3 className="mt-4 text-[15px] font-medium tracking-tight text-ink">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-fog">{desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
