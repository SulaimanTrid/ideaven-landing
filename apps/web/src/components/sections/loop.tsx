"use client";

import { useEffect, useRef, useState } from "react";
import { Container, SectionHeader, cn } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import {
  IconArrowRight,
  IconEye,
  IconGamepad,
  IconLoop,
  IconPause,
  IconPen,
  IconRun,
  IconStop,
} from "@/components/visuals/icons";

const STEPS = [
  { label: "Design", Icon: IconPen, hint: "Sketch the screen" },
  { label: "Preview", Icon: IconEye, hint: "See it take shape" },
  { label: "Run", Icon: IconRun, hint: "Bring it to life" },
  { label: "Play", Icon: IconGamepad, hint: "Feel the response" },
  { label: "Iterate", Icon: IconLoop, hint: "Change one thing" },
] as const;

const CYCLE_MS = 2600;

const MENTIONS = [
  { label: "Run", desc: "try it live", Icon: IconRun },
  { label: "Pause", desc: "freeze a moment", Icon: IconPause },
  { label: "Stop", desc: "end the run", Icon: IconStop },
  { label: "Preview", desc: "see changes instantly", Icon: IconEye },
] as const;

/** One miniature app moving through the five states of the creation loop. */
function LoopScreen({ step }: { step: number }) {
  const designing = step === 0;
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-[11px] text-fog">quiz-craft</span>
        {step >= 2 ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase",
              step === 3 ? "text-mint" : "text-sky",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                step === 3 ? "bg-mint anim-pulse-dot" : "bg-sky anim-pulse-dot",
              )}
            />
            {step === 3 ? "Playing" : "Running"}
          </span>
        ) : (
          <span className="font-mono text-[10px] tracking-[0.12em] text-mist uppercase">
            {designing ? "Editing" : "Ready"}
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="relative">
          {/* annotation layer while iterating */}
          {step === 4 ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-3 rounded-xl border border-dashed border-violet/60"
            >
              <span className="absolute -top-3 right-3 rounded-full border border-violet/50 bg-violet/15 px-2 py-[2px] font-mono text-[10px] tracking-[0.1em] text-violet uppercase">
                edit
              </span>
            </div>
          ) : null}

          {designing ? (
            <div aria-hidden="true" className="flex flex-col gap-3">
              <span className="block h-4 w-3/5 rounded border border-dashed border-mist/50" />
              <span className="block h-9 w-full rounded-lg border border-dashed border-mist/40" />
              <span className="block h-9 w-full rounded-lg border border-dashed border-mist/40" />
              <span className="block h-9 w-2/3 rounded-lg border border-dashed border-mist/40" />
            </div>
          ) : (
            <div>
              <p className="text-[15px] font-medium text-ink">
                Which planet is closest to the Sun?
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  { label: "Venus", key: "A" },
                  { label: "Mercury", key: "B" },
                  { label: "Mars", key: "C" },
                ].map((option, index) => {
                  const selected = step === 3 && index === 1;
                  return (
                    <li
                      key={option.key}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-[13px] transition-colors duration-300",
                        selected
                          ? "border-mint/50 bg-mint/[0.08] text-mint"
                          : "border-line bg-white/[0.02] text-fog",
                      )}
                    >
                      {option.label}
                      {selected ? (
                        <span className="anim-pop-in h-2 w-2 rounded-full bg-mint" />
                      ) : (
                        <span className="font-mono text-[10px] text-mist">
                          {option.key}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {step >= 2 ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-panel/70 px-3 py-2">
            <span className="flex items-center gap-1.5 text-mist">
              <IconRun size={12} className={step >= 2 ? "text-mint" : ""} />
              <IconPause size={12} className={step === 3 ? "text-ink" : ""} />
              <IconStop size={12} className={step >= 2 ? "text-fog" : ""} />
            </span>
            <span className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
              {step === 3 ? "answer locked · +1" : "listening for taps"}
            </span>
          </div>
        ) : null}

        {step === 4 ? (
          <p className="mt-4 flex items-center gap-2 text-[12px] text-mist">
            <IconLoop size={13} className="text-violet" />
            Tweak the question — then run it again.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LoopSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reducedMotion.current) return;
    const id = window.setInterval(
      () => setStep((current) => (current + 1) % STEPS.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [visible]);

  return (
    <section
      aria-labelledby="loop-title"
      className="py-24 sm:py-32"
      ref={rootRef}
    >
      <Container>
        <Reveal>
          <SectionHeader
            index="07"
            kicker="Live creation loop"
            title={<span id="loop-title">Build. Run. See it come alive.</span>}
            lead="The distance between an idea and a running creation should be one keystroke — not a build pipeline."
          />
        </Reveal>

        <Reveal delay={100} className="mt-12">
          <ol className="flex items-stretch gap-1.5 sm:gap-2">
            {STEPS.map((stepDef, index) => {
              const active = index === step;
              const { Icon } = stepDef;
              return (
                <li key={stepDef.label} className="flex flex-1 items-center gap-1.5 last:flex-none sm:gap-2">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStep(index)}
                    className={cn(
                      "relative flex w-full flex-col items-center gap-1 overflow-hidden rounded-xl border px-2 py-3 transition-colors sm:py-3.5",
                      active
                        ? "border-violet/50 bg-violet/10 text-ink"
                        : "border-line bg-card text-mist hover:text-fog",
                    )}
                  >
                    <Icon size={15} />
                    <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase sm:text-[10px]">
                      {stepDef.label}
                    </span>
                    {active && !reducedMotion.current ? (
                      <span
                        key={`${step}-${visible}`}
                        aria-hidden="true"
                        className="anim-progress-x absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-violet"
                        style={{ animationDuration: `${CYCLE_MS}ms` }}
                      />
                    ) : null}
                  </button>
                  {index < STEPS.length - 1 ? (
                    <IconArrowRight
                      size={13}
                      className="hidden shrink-0 text-mist/60 sm:block"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div className="mt-6">
            <LoopScreen step={step} />
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MENTIONS.map(({ label, desc, Icon }) => (
              <li
                key={label}
                className="rounded-xl border border-line bg-card/60 px-4 py-3.5"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon size={13} className="text-violet" />
                  {label}
                </span>
                <p className="mt-1 text-[12.5px] text-mist">{desc}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
