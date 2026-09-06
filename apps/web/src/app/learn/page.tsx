import type { Metadata } from "next";
import Link from "next/link";
import { LESSONS } from "@/lib/lessons";

/**
 * Learn (roadmap 27): the index of real lessons about the actual editor.
 */
export const metadata: Metadata = {
  title: "Learn — Ideaven",
  description: "Short, real lessons: design screens, wire blocks, write code, publish, and export.",
};

export default function LearnPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-16">
      <p className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">Learn</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">From idea to live app</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-7 text-fog">
        Six short lessons cover the whole path — every step described here
        exists in the product today, not in a future roadmap.
      </p>

      <ol className="mt-10 space-y-4">
        {LESSONS.map((lesson, index) => (
          <li key={lesson.slug}>
            <Link
              href={`/learn/${lesson.slug}`}
              className="group flex items-start gap-4 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-violet/50"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet/10 font-mono text-[13px] font-semibold text-violet">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                    {lesson.kicker}
                  </span>
                  <span className="text-[11px] text-mist">{lesson.minutes} min</span>
                </span>
                <span className="mt-1 block text-[16px] font-semibold text-ink group-hover:text-violet">
                  {lesson.title}
                </span>
                <span className="mt-1 block text-[13.5px] leading-6 text-fog">{lesson.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-[13px] text-fog">
        Prefer reference material? Read the{" "}
        <Link href="/docs" className="text-violet hover:text-ink">
          developer docs
        </Link>{" "}
        instead.
      </p>
    </main>
  );
}
