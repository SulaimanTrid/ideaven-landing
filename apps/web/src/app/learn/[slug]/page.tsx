import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LESSONS, lessonBySlug } from "@/lib/lessons";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return LESSONS.map((lesson) => ({ slug: lesson.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const lesson = lessonBySlug(slug);
  if (!lesson) return { title: "Lesson not found — Ideaven" };
  return { title: `${lesson.title} — Learn — Ideaven`, description: lesson.summary };
}

export default async function LessonPage({ params }: PageProps) {
  const { slug } = await params;
  const lesson = lessonBySlug(slug);
  if (!lesson) notFound();

  const index = LESSONS.indexOf(lesson);
  const next = LESSONS[index + 1];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <Link href="/learn" className="text-[13px] text-mist transition-colors hover:text-ink">
        ← All lessons
      </Link>

      <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-violet uppercase">
        {lesson.kicker} · {lesson.minutes} min
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{lesson.title}</h1>
      <p className="mt-3 text-[15px] leading-7 text-fog">{lesson.summary}</p>

      <div className="mt-10 space-y-10">
        {lesson.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold text-ink">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-3 text-[14px] leading-7 text-fog">
                {paragraph}
              </p>
            ))}
            {section.tips ? (
              <ul className="mt-4 space-y-2">
                {section.tips.map((tip) => (
                  <li key={tip.slice(0, 32)} className="flex gap-2 text-[13px] leading-6 text-fog">
                    <span aria-hidden="true" className="text-mint">◆</span>
                    {tip}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-14 flex items-center justify-between rounded-2xl border border-line bg-card p-5">
        {next ? (
          <Link href={`/learn/${next.slug}`} className="text-[13.5px] font-medium text-violet hover:text-ink">
            Next: {next.title} →
          </Link>
        ) : (
          <Link href="/dashboard/templates" className="text-[13.5px] font-medium text-violet hover:text-ink">
            Start building from a template →
          </Link>
        )}
        <Link href="/register" className="text-[13px] text-mist hover:text-ink">
          Create a free account
        </Link>
      </div>
    </main>
  );
}
