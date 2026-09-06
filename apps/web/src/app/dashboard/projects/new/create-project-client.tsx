"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, Chip } from "@ideaven/ui";
import { projectApi, templateApi, type TemplateBrief } from "@/lib/api";
import { ApiError } from "@/types/auth";
import type { ProjectType } from "@/types/project";
import { PROJECT_TYPES, isFlagshipType, projectTypeLabel } from "@/lib/project-meta";
import {
  IconAppWindow,
  IconArrowRight,
  IconBlocks,
  IconChevronLeft,
  IconGamepad,
  IconSparkle,
} from "@/components/visuals/icons";

/**
 * Project creation: WHAT do you want to build (app/game) → HOW do you want to
 * start (blank today; templates and AI are marked, not faked) → details.
 * Creating posts to the API, which persists a real project with its initial
 * canonical model, then routes into the project workspace.
 */

type CreationMethod = "blank" | "template" | "ai";
type GameDimension = "2d" | "3d" | null;

export function CreateProjectClient() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 12>(1);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [gameDimension, setGameDimension] = useState<GameDimension>(null);
  const [method, setMethod] = useState<CreationMethod | null>(null);
  const [templates, setTemplates] = useState<TemplateBrief[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateBrief | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!projectType) return;
    setError(null);
    setFieldError(null);
    setCreating(true);
    try {
      const { project } = await projectApi.create({
        type: projectType,
        name: name.trim(),
        description: description.trim() || undefined,
        template: selectedTemplate?.id,
      });
      router.push(`/builder/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldMessage = err.fieldError("name") ?? err.fieldError("type");
        if (fieldMessage) setFieldError(fieldMessage);
        else setError(err.message);
      } else {
        setError("Could not create the project. Check your connection and try again.");
      }
      setCreating(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-4xl px-4 pt-10 pb-24 sm:px-6 lg:pt-14">
      <div
        aria-hidden="true"
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:radial-gradient(70%_100%_at_50%_0%,black,transparent)]"
      />

      <div className="relative">
        {/* Breadcrumb */}
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconChevronLeft size={14} />
          All projects
        </Link>

        {step === 1 ? (
          <section aria-labelledby="create-what" className="mt-8">
            <Chip tone="violet">Create Project</Chip>
            <h1 id="create-what" className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              What do you want to build?
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-lg leading-8 text-fog">
              Pick a starting point. You can switch techniques — blocks or real code — at any
              time inside the project.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TypeCard
                title="App"
                description="Tools, utilities, interactive pages — anything with a screen, buttons, and logic."
                icon={<IconAppWindow size={26} />}
                onSelect={() => {
                  setProjectType("app");
                  setStep(2);
                }}
              />
              <TypeCard
                title="Game"
                description="Gameplay, scenes, scores, and interaction — built visually, playable instantly."
                icon={<IconGamepad size={26} />}
                onSelect={() => {
                  setProjectType("game");
                  setGameDimension(null);
                  setStep(12);
                }}
              />
            </div>

            <div className="mt-6">
              <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">More kinds</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROJECT_TYPES.filter((t) => !isFlagshipType(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setProjectType(t);
                      setStep(2);
                    }}
                    className="rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:border-violet/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                  >
                    {projectTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {step === 12 && projectType === "game" ? (
          <section aria-labelledby="create-dim" className="mt-8">
            <Chip tone="violet">New Game</Chip>
            <h1 id="create-dim" className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              2D or 3D?
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-lg leading-8 text-fog">
              Pick the dimension you want to work in.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TypeCard
                title="2D"
                description="Sprites, scenes, scores, and gameplay — fully supported today. Pick a template or start blank."
                icon={<IconAppWindow size={26} />}
                onSelect={() => {
                  setGameDimension("2d");
                  setStep(2);
                }}
              />
              <TypeCard
                title="3D"
                description="Foundation in development — the 2D tooling is fully available today, and 3D scenes build on the same blocks."
                icon={<IconGamepad size={26} />}
                onSelect={() => {
                  setGameDimension("3d");
                  setStep(2);
                }}
              />
            </div>
            {gameDimension === "3d" ? (
              <p className="mt-6 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] leading-6 text-amber" role="note">
                Honest status: 3D scenes are the next engine milestone — today you can
                build and play the 2D workflow end to end. Your project can adopt 3D
                scenes when the foundation lands.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-6 text-[13px] text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              ← Change project type
            </button>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="create-how" className="mt-8">
            <Chip tone="violet">New {projectType ? projectTypeLabel(projectType) : "Project"}{gameDimension === "3d" ? " · 3D (foundation)" : ""}</Chip>
            <h1 id="create-how" className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              How do you want to start?
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-lg leading-8 text-fog">
              Choose a starting point for your {projectType ? projectTypeLabel(projectType).toLowerCase() : "project"}.
            </p>

            <div className="mt-10 flex flex-col gap-3">
              <MethodCard
                title="Blank project"
                description="One empty screen and full freedom. The fastest way to start building."
                icon={<IconBlocks size={22} />}
                enabled
                selected={method === "blank"}
                onSelect={() => {
                  setMethod("blank");
                  setStep(3);
                }}
              />
              <MethodCard
                title="Start from a template"
                description="Ready-made projects built on the real model — layout, navigation, and logic you can remix."
                icon={<IconSparkle size={22} />}
                enabled
                selected={method === "template"}
                onSelect={() => {
                  setMethod("template");
                  templateApi.list().then(setTemplates);
                }}
              />
              {method === "template" ? (
                <div className="mt-2 rounded-2xl border border-line bg-card p-4">
                  <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">
                    Built-in templates
                  </p>
                  {templates.length === 0 ? (
                    <p className="mt-3 text-[13px] text-fog">Loading templates…</p>
                  ) : templates.filter((t) => t.type === projectType).length === 0 ? (
                    <p className="mt-3 text-[13px] text-fog">
                      No {projectType ? projectTypeLabel(projectType).toLowerCase() : ""} templates yet —
                      start blank (or with AI) and it works the same.
                    </p>
                  ) : (
                    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {templates
                        .filter((t) => t.type === projectType)
                        .map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTemplate(t);
                                setName(t.name);
                                setStep(3);
                              }}
                              className={`h-full w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                                selectedTemplate?.id === t.id
                                  ? "border-violet bg-violet/10"
                                  : "border-line bg-panel hover:border-violet/50"
                              }`}
                            >
                              <span className="text-[13px] font-semibold text-ink">{t.name}</span>
                              <span className="mt-1 block text-[12px] leading-5 text-fog">
                                {t.description}
                              </span>
                              <span className="mt-2 block text-[11px] text-mist">
                                {t.screens} {t.screens === 1 ? "screen" : "screens"}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ) : null}
              <MethodCard
                title="Generate with AI"
                description="Describe your idea in a sentence and let Ideaven draft the first version."
                icon={<IconSparkle size={22} />}
                badge="Coming soon"
                enabled={false}
                onSelect={() => undefined}
              />
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
            >
              <IconChevronLeft size={14} />
              Change project type
            </button>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby="create-details" className="mt-8">
            <Chip tone="violet">New {projectType ? projectTypeLabel(projectType) : "Project"}</Chip>
            <h1 id="create-details" className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Name it.
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-lg leading-8 text-fog">
              You can rename it at any time — nothing here is permanent.
            </p>

            <form
              className="mt-10 flex max-w-xl flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-name" className="text-sm font-medium text-ink">
                  Project name
                </label>
                <input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoFocus
                  placeholder={projectType === "game" ? "e.g. Sky Jumper" : "e.g. Habit Tracker"}
                  aria-invalid={Boolean(fieldError) || undefined}
                  aria-describedby={fieldError ? "project-name-error" : undefined}
                  className="h-11 w-full rounded-lg border border-line bg-panel px-3.5 text-[15px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
                {fieldError ? (
                  <p id="project-name-error" role="alert" className="text-[13px] text-rose">
                    {fieldError}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-description" className="text-sm font-medium text-ink">
                  Description <span className="font-normal text-mist">(optional)</span>
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder="A sentence about what this project will do."
                  className="w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                />
              </div>

              {error ? (
                <p role="alert" className="text-[13px] text-rose">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <Button type="submit" size="lg" disabled={creating || name.trim() === ""}>
                  {creating ? "Creating…" : "Create project"}
                  {!creating ? <IconArrowRight size={16} /> : null}
                </Button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-60"
                >
                  <IconChevronLeft size={14} />
                  Back
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {step === 1 ? (
          <p className="mt-10 text-[13px] text-mist">
            Not sure yet? Browse <ButtonLink variant="ghost" size="sm" href="/dashboard/templates" className="px-1">templates</ButtonLink> for inspiration.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Selectable project-type card for step 1. */
function TypeCard({
  title,
  description,
  icon,
  onSelect,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-line bg-card p-6 text-left transition-all hover:border-violet/50 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-deep/20 text-violet transition-colors group-hover:bg-violet-deep/30">
        {icon}
      </span>
      <span className="text-lg font-semibold tracking-tight">{title}</span>
      <span className="text-sm leading-6 text-fog">{description}</span>
      <span className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-violet">
        Choose {title.toLowerCase()}
        <IconArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

/** Selectable creation-method row for step 2. */
function MethodCard({
  title,
  description,
  icon,
  badge,
  enabled,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  enabled: boolean;
  selected?: boolean;
  onSelect: () => void;
}) {
  const interactive = enabled ? "hover:border-violet/50 hover:bg-surface" : "opacity-60";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!enabled}
      aria-pressed={selected}
      className={`flex items-center gap-4 rounded-2xl border border-line bg-card p-5 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${interactive}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-fog">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight">{title}</span>
          {badge ? (
            <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-mist">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[13px] leading-5 text-fog">{description}</span>
      </span>
      {enabled ? <IconArrowRight size={16} className="shrink-0 text-mist" /> : null}
    </button>
  );
}
