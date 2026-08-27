import { Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { Block } from "@/components/visuals/block";

type Step = {
  name: string;
  note: string;
  color: string;
  width: number;
  textClassName?: string;
};

const STEPS: Step[] = [
  { name: "Imagine", note: "Sketch the idea", color: "#3d4356", width: 122, textClassName: "text-ink" },
  { name: "Blocks", note: "Snap logic together", color: "var(--color-amber)", width: 112 },
  { name: "Experiment", note: "Try, break, redo", color: "var(--color-sky)", width: 146 },
  { name: "Low-code", note: "Mix blocks & code", color: "var(--color-rose)", width: 134 },
  { name: "TypeScript", note: "Full control", color: "var(--color-violet)", width: 136 },
  { name: "Create", note: "Ship something real", color: "var(--color-mint)", width: 112 },
];

function StepChip({ step }: { step: Step }) {
  return (
    <Block
      color={step.color}
      width={step.width}
      textClassName={step.textClassName}
      className="shadow-[0_10px_24px_-12px_rgb(0_0_0_/_0.7)]"
    >
      {step.name}
    </Block>
  );
}

export function Journey() {
  return (
    <section
      id="journey"
      aria-labelledby="journey-title"
      className="border-y border-line bg-panel/40 py-24 sm:py-32"
    >
      <Container>
        <Reveal>
          <SectionHeader
            index="04"
            kicker="The creator journey"
            title={<span id="journey-title">Start anywhere. Grow without limits.</span>}
            lead="Start visually, understand how things work, and move into real code when you're ready. The path is the product."
          />
        </Reveal>

        {/* Desktop: rising staircase of connected blocks */}
        <Reveal delay={100} className="mt-16 hidden md:block">
          <div className="relative h-[248px]">
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <path
                d="M8.3 88 L25 72.5 L41.7 56.7 L58.3 40.8 L75 25 L91.7 9.2"
                fill="none"
                stroke="var(--color-mist)"
                strokeOpacity="0.45"
                strokeWidth="1"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx="8.3" cy="88" r="1" fill="var(--color-mist)" />
            </svg>

            <ol className="relative grid h-full grid-cols-6 items-end gap-2">
              {STEPS.map((step, index) => (
                <li
                  key={step.name}
                  className="flex flex-col items-center justify-end gap-2.5"
                  style={{ marginBottom: index * 34 }}
                >
                  <span className="font-mono text-[10px] tracking-[0.2em] text-mist">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <StepChip step={step} />
                  <span className="whitespace-nowrap text-[11.5px] text-mist">
                    {step.note}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        {/* Mobile / tablet: vertical steps */}
        <Reveal delay={100} className="mt-12 md:hidden">
          <ol className="flex flex-col gap-4">
            {STEPS.map((step, index) => (
              <li key={step.name} className="flex items-center gap-4">
                <span className="w-6 shrink-0 font-mono text-[10px] tracking-[0.2em] text-mist">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <StepChip step={step} />
                <span className="text-[12px] text-mist">{step.note}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  );
}
