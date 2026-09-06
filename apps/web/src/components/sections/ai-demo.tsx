"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@ideaven/ui";
import { IconCheck, IconSparkle } from "@/components/visuals/icons";

/**
 * Timed concept demonstration: a request → analysis → change plan → applied
 * edit, mirrored by a miniature screen that visibly changes. Starts only
 * while on screen and freezes on the final state for reduced motion.
 */

const STEP_DELAYS = [900, 1500, 1300] as const;

function AnalyzingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="anim-pulse-dot h-1 w-1 rounded-full bg-violet"
          style={{ animationDelay: `${dot * 0.22}s` }}
        />
      ))}
    </span>
  );
}

export function AiDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      setStep(3);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (step >= 3) {
      const hold = window.setTimeout(() => setStep(0), 3400);
      return () => window.clearTimeout(hold);
    }
    const delay = STEP_DELAYS[step] ?? 1000;
    const timer = window.setTimeout(() => setStep((s) => Math.min(s + 1, 3)), delay);
    return () => window.clearTimeout(timer);
  }, [visible, step]);

  return (
    <div
      ref={rootRef}
      className="mt-12 grid gap-5 lg:grid-cols-[5fr_7fr]"
      role="img"
      aria-label="Concept demonstration: the user asks for a red button below the login form, the assistant analyzes the screen, proposes the change, and applies it to Screen 1."
    >
      {/* Chat panel */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <IconSparkle size={14} className="text-violet" />
            Ideaven AI
          </span>
          <span className="rounded-full border border-line px-2 py-[2px] font-mono text-[10px] tracking-[0.12em] text-mist uppercase">
            Concept
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {step >= 0 ? (
            <div className="anim-pop-in self-end rounded-xl rounded-br-sm border border-line bg-surface-strong px-3.5 py-2.5 text-sm text-ink">
              Add a red button below the login form.
            </div>
          ) : null}

          {step >= 1 ? (
            <div className="anim-pop-in self-start rounded-xl rounded-bl-sm border border-violet/25 bg-violet/10 px-3.5 py-2.5 text-sm text-fog">
              <span className="mr-2 inline-flex">
                <AnalyzingDots />
              </span>
              Analyzing current screen…
            </div>
          ) : null}

          {step >= 2 ? (
            <div className="anim-pop-in self-start rounded-xl border border-violet/25 bg-violet/[0.07] px-3.5 py-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-violet uppercase">
                Change plan
              </p>
              <ul className="mt-2 flex flex-col gap-1.5 font-mono text-[12px] text-fog">
                <li>
                  <span className="text-mint">+</span> Button
                </li>
                <li>
                  Position: <span className="text-ink">Below Login Form</span>
                </li>
                <li>
                  Color: <span className="text-rose">Red</span>
                </li>
              </ul>
            </div>
          ) : null}

          {step >= 3 ? (
            <div className="anim-pop-in self-start rounded-xl border border-mint/25 bg-mint/[0.08] px-3.5 py-2.5 text-sm text-mint">
              <IconCheck size={13} className="mr-1.5 inline align-[-2px]" />
              Applied to Screen 1
            </div>
          ) : null}
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel/70 px-3 py-2">
            <IconSparkle size={13} className="text-mist" />
            <span className="text-[13px] text-mist">
              Ask about this project…
            </span>
          </div>
        </div>
      </div>

      {/* Screen mockup */}
      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-mono text-[11px] text-fog">
            Screen 1 · Login
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-[2px] font-mono text-[10px] tracking-[0.12em] uppercase transition-opacity",
              step >= 2
                ? "border-violet/40 bg-violet/10 text-violet opacity-100"
                : "opacity-0",
            )}
          >
            AI edit
          </span>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mx-auto max-w-xs">
            <p className="text-lg font-semibold tracking-tight text-ink">
              Welcome back
            </p>
            <p className="mt-1 text-[13px] text-mist">
              Sign in to continue building.
            </p>

            <div className="mt-6 flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-[12px] text-fog">Email</p>
                <div className="h-9 rounded-lg border border-line bg-surface" />
              </div>
              <div>
                <p className="mb-1.5 text-[12px] text-fog">Password</p>
                <div className="h-9 rounded-lg border border-line bg-surface" />
              </div>
              <div className="mt-1 flex h-10 items-center justify-center rounded-lg border border-violet/40 bg-violet/10 text-sm font-medium text-violet">
                Log in
              </div>

              {/* The change: a red button below the form */}
              {step === 2 ? (
                <div
                  aria-hidden="true"
                  className="mt-1 h-10 rounded-lg border border-dashed border-violet/50 bg-violet/[0.04]"
                />
              ) : null}
              {step >= 3 ? (
                <div className="anim-pop-in mt-1 flex h-10 items-center justify-center rounded-lg bg-[#e5484d] text-sm font-medium text-white">
                  Sign up
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
