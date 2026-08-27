import { Chip, Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { IconAppWindow, IconGamepad } from "@/components/visuals/icons";

/* ------------------------------------------------------------------ */
/* Miniature game scene — pure SVG, no assets                          */
/* ------------------------------------------------------------------ */

function GameArt() {
  return (
    <svg
      viewBox="0 0 400 240"
      className="block w-full"
      role="img"
      aria-label="Miniature platformer: a mint character leaping between platforms toward coins and a finish flag."
    >
      <rect width="400" height="240" fill="#0c0f17" />
      {/* distant hills */}
      <polygon points="0,205 90,150 190,205" fill="#10141f" />
      <polygon points="150,205 260,138 400,205" fill="#0f1320" />
      {/* ground */}
      <rect x="0" y="204" width="400" height="36" fill="#151b29" />
      <rect x="0" y="204" width="400" height="2.5" fill="#232c40" />
      {/* platforms */}
      {[
        { x: 34, y: 152, w: 92 },
        { x: 168, y: 108, w: 82 },
        { x: 288, y: 158, w: 74 },
      ].map((p) => (
        <g key={p.x}>
          <rect x={p.x} y={p.y} width={p.w} height="9" rx="3" fill="#1b2130" />
          <rect x={p.x} y={p.y} width={p.w} height="2.5" rx="1.25" fill="#2a3348" />
        </g>
      ))}
      {/* coins */}
      {[
        { cx: 78, cy: 140 },
        { cx: 208, cy: 96 },
        { cx: 322, cy: 146 },
      ].map((coin) => (
        <g key={coin.cx}>
          <circle cx={coin.cx} cy={coin.cy} r="5.5" fill="var(--color-amber)" />
          <circle cx={coin.cx} cy={coin.cy} r="2.2" fill="rgb(10 12 18 / 0.35)" />
        </g>
      ))}
      {/* finish flag */}
      <rect x="348" y="118" width="2.5" height="40" rx="1" fill="#3a4358" />
      <polygon points="350.5,120 368,126 350.5,132" fill="var(--color-rose)" />
      {/* spikes */}
      <polygon points="246,204 254,190 262,204" fill="#242b3d" />
      <polygon points="264,204 272,192 280,204" fill="#242b3d" />
      {/* character mid-jump */}
      <g transform="rotate(-8 140 122)">
        <rect x="130" y="106" width="20" height="20" rx="5" fill="var(--color-mint)" />
        <rect x="133" y="110" width="6" height="7" rx="3" fill="rgb(10 12 18 / 0.85)" />
        <rect x="142" y="110" width="6" height="7" rx="3" fill="rgb(10 12 18 / 0.85)" />
      </g>
      {/* motion arcs */}
      <path d="M120 112c-5 3-8 8-9 13" stroke="#2e3850" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M124 104c-7 4-11 11-12 18" stroke="#232c46" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* HUD */}
      <text x="14" y="24" fill="#a9b0c2" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="2">
        SCORE 02
      </text>
      <text x="386" y="24" fill="#6f7789" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="2" textAnchor="end">
        1-1
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Miniature app — a quiz interface in HTML/CSS                        */
/* ------------------------------------------------------------------ */

function AppArt() {
  return (
    <div className="flex h-full flex-col bg-[#0c0f17] p-6 sm:p-8" role="img" aria-label="Miniature quiz app: a question with three options, one selected, and a progress indicator.">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.2em] text-mist uppercase">
          Daily quiz
        </p>
        <p className="font-mono text-[10px] text-mist">3 / 5</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full w-3/5 rounded-full bg-violet" />
      </div>

      <p className="mt-6 text-lg font-medium tracking-tight text-ink">
        Which block runs first?
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        <li className="rounded-lg border border-line bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-fog">
          change score by 1
        </li>
        <li className="flex items-center justify-between rounded-lg border border-mint/50 bg-mint/[0.08] px-3.5 py-2.5 text-[13px] text-mint">
          when <span aria-hidden="true">⏵</span> clicked
          <span className="h-2 w-2 rounded-full bg-mint" />
        </li>
        <li className="rounded-lg border border-line bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-fog">
          play sound coin
        </li>
      </ul>

      <div className="mt-auto flex items-center justify-between pt-6">
        <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-fog">
          score 2
        </span>
        <span className="rounded-lg bg-violet-deep px-3.5 py-2 text-[13px] font-medium text-white">
          Check answer
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const GAME_KINDS = ["Platformer", "Puzzle", "Arcade", "Simulation", "Educational"];
const APP_KINDS = ["Dashboard", "Quiz", "Utility", "Productivity", "Educational"];

function KindChips({ kinds }: { kinds: string[] }) {
  return (
    <ul className="mt-5 flex flex-wrap gap-2">
      {kinds.map((kind) => (
        <li key={kind}>
          <Chip>{kind}</Chip>
        </li>
      ))}
    </ul>
  );
}

export function Creations() {
  return (
    <section
      id="create"
      aria-labelledby="creations-title"
      className="border-y border-line bg-panel/40 py-24 sm:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeader
            index="06"
            kicker="What you can create"
            title={<span id="creations-title">Make something you can actually use.</span>}
            lead="Games and apps are first-class citizens in Ideaven — the same blocks, the same code, the same runtime."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <Reveal delay={60}>
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-white/15">
              <GameArt />
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    Games
                  </h3>
                  <Chip tone="sky">
                    <IconGamepad size={11} />
                    Game
                  </Chip>
                </div>
                <p className="mt-2 text-sm leading-6 text-fog">
                  Platformers, puzzles, arcade rounds, little simulations —
                  anything with a loop and some physics.
                </p>
                <KindChips kinds={GAME_KINDS} />
              </div>
            </article>
          </Reveal>

          <Reveal delay={140}>
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-white/15">
              <div className="min-h-[240px] flex-1 border-b border-line">
                <AppArt />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    Apps
                  </h3>
                  <Chip tone="violet">
                    <IconAppWindow size={11} />
                    App
                  </Chip>
                </div>
                <p className="mt-2 text-sm leading-6 text-fog">
                  Dashboards, quizzes, utilities and small tools that solve a
                  problem you actually have.
                </p>
                <KindChips kinds={APP_KINDS} />
              </div>
            </article>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
