import { ButtonLink, Chip, Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { IconAppWindow, IconArrowUpRight, IconGamepad } from "@/components/visuals/icons";
import { MiniArt } from "@/components/visuals/mini-art";

type Project = {
  name: string;
  kind: "Game" | "App";
  tag: string;
  art: string;
  desc: string;
};

/*
 * Demo content only. These cards are structured so real community projects
 * (image/preview + metadata) can drop in later without redesign.
 */
const PROJECTS: Project[] = [
  {
    name: "Coin Run",
    kind: "Game",
    tag: "Platformer",
    art: "platformer",
    desc: "Run, jump, and collect every coin before the timer ends.",
  },
  {
    name: "Orbit",
    kind: "Game",
    tag: "Puzzle",
    art: "orbit",
    desc: "Slide planets onto matching orbits across calm little puzzles.",
  },
  {
    name: "Star Volley",
    kind: "Game",
    tag: "Arcade",
    art: "arcade",
    desc: "Keep the rally alive in a fast one-button arcade match.",
  },
  {
    name: "Habit Streak",
    kind: "App",
    tag: "Dashboard",
    art: "dashboard",
    desc: "Track daily habits and watch your streak grow week by week.",
  },
  {
    name: "Quiz Craft",
    kind: "App",
    tag: "Quiz",
    art: "quiz",
    desc: "Build and share quizzes on any topic you love.",
  },
  {
    name: "Synth Pad",
    kind: "App",
    tag: "Utility",
    art: "synth",
    desc: "Tap out beats on a pocket-sized grid of sounds.",
  },
];

function KindBadge({ kind }: { kind: Project["kind"] }) {
  return kind === "Game" ? (
    <Chip tone="sky">
      <IconGamepad size={11} />
      Game
    </Chip>
  ) : (
    <Chip tone="violet">
      <IconAppWindow size={11} />
      App
    </Chip>
  );
}

export function Showcase() {
  return (
    <section
      id="explore"
      aria-labelledby="showcase-title"
      className="border-y border-line bg-panel/40 py-24 sm:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeader
            index="08"
            kicker="Made with Ideaven"
            title={<span id="showcase-title">From imagination to something real.</span>}
            lead="A first set of example projects, made to show what the building blocks can become."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((project, index) => (
            <Reveal key={project.name} delay={(index % 3) * 80}>
              <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-all duration-300 hover:-translate-y-1 hover:border-white/15">
                <div className="relative aspect-[16/10] overflow-hidden border-b border-line">
                  <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.05]">
                    <MiniArt variant={project.art} />
                  </div>
                  <span className="absolute top-3 left-3">
                    <Chip>Example</Chip>
                  </span>
                  <span className="absolute top-3 right-3">
                    <KindBadge kind={project.kind} />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-medium tracking-tight text-ink">
                      {project.name}
                    </h3>
                    <span className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                      {project.tag}
                    </span>
                  </div>
                  <p className="mt-1.5 flex-1 text-sm leading-6 text-fog">
                    {project.desc}
                  </p>
                  <ButtonLink
                    variant="ghost"
                    size="sm"
                    href="/explore"
                    className="-ml-3 mt-4 self-start"
                  >
                    View Project
                    <IconArrowUpRight size={14} />
                  </ButtonLink>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <p className="mt-10 text-center text-[13px] text-mist">
            These examples ship with Ideaven — real community projects will
            replace them later without changing the component.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
