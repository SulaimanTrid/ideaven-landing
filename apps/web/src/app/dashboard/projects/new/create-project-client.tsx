"use client";

import { useRef, useState } from "react";
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
  IconCube3D,
  IconGamepad,
  IconSparkle,
} from "@/components/visuals/icons";

/**
 * TASK 59 — the Creation Hub: ONE canonical entry flow for the three real
 * creation environments (Application / 2D Game / 3D Game). Choosing an
 * environment sets the CANONICAL project type; creation posts that exact
 * type to the API and routes into the existing builder for it. The 3D
 * status is honest (foundation available) without being apologetic.
 */

type CreationMethod = "blank" | "template";

interface EnvironmentCard {
  type: ProjectType;
  label: string;
  envLabel: string;
  title: string;
  description: string;
  chips: string[];
  action: string;
  icon: React.ReactNode;
  preview: React.ReactNode;
}

const ENVIRONMENTS: EnvironmentCard[] = [
  {
    type: "app",
    label: "CREATION ENVIRONMENT",
    envLabel: "App Builder",
    title: "Application",
    description:
      "Build interactive apps and tools with visual components, logic, blocks, and code.",
    chips: ["UI Components", "Blocks", "Code", "Navigation", "Device Preview"],
    action: "Start App",
    icon: <IconAppWindow size={24} />,
    preview: (
      <div aria-hidden="true" className="h-24 w-full overflow-hidden rounded-lg border border-line bg-white text-[#0b0e16]">
        <div className="flex items-center gap-1 border-b border-line bg-[#f3f5f9] px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c9cede]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#c9cede]" />
          <span className="ml-1 h-2 w-16 rounded-sm bg-[#e3e6ee]" />
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <span className="h-3 w-24 rounded-sm bg-[#5743d9]" />
          <span className="h-2 w-full rounded-sm bg-[#e3e6ee]" />
          <span className="h-2 w-4/5 rounded-sm bg-[#e3e6ee]" />
          <span className="mt-1 flex items-center gap-1.5">
            <span className="h-4 w-14 rounded-md bg-[#5743d9]/85" />
            <span className="h-4 w-10 rounded-md border border-[#c9cede] bg-white" />
          </span>
        </div>
      </div>
    ),
  },
  {
    type: "game",
    label: "2D GAME ENGINE · AVAILABLE",
    envLabel: "2D Game Engine",
    title: "2D Game",
    description:
      "Build playable 2D games with sprites, scenes, physics, animation, effects, and visual logic.",
    chips: ["Scenes", "Sprites", "Physics", "Animation", "Blocks"],
    action: "Start 2D Game",
    icon: <IconGamepad size={24} />,
    preview: (
      <div aria-hidden="true" className="relative h-24 w-full overflow-hidden rounded-lg border border-violet/30 bg-[#0c0f17] [background-image:radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.06)_1px,transparent_0)] [background-size:14px_14px]">
        <span className="absolute left-2 top-2 h-2 w-8 rounded-sm bg-[#46e3b4]/70" />
        <span className="absolute bottom-3 left-0 h-2.5 w-16 rounded-sm bg-[#2a3348]" />
        <span className="absolute bottom-6 left-14 h-2.5 w-12 rounded-sm bg-[#2a3348]" />
        <span className="absolute bottom-[38px] left-6 h-4 w-4 rounded-sm bg-[#46e3b4]" />
        <span className="absolute right-8 top-6 h-3.5 w-3.5 rotate-45 rounded-[3px] bg-[#f0b429]" />
        <span className="absolute left-2 top-2 rounded border border-violet/40 px-1 font-mono text-[7px] uppercase tracking-[0.14em] text-violet">
          scene
        </span>
      </div>
    ),
  },
  {
    type: "3d",
    label: "3D ENGINE · FOUNDATION AVAILABLE",
    envLabel: "3D Game Engine",
    title: "3D Game",
    description:
      "Build 3D scenes and playable experiences with real 3D objects, cameras, lighting, physics, transforms, and character control.",
    chips: ["3D Scene", "Cube / Sphere / Plane", "Camera", "Lighting", "Physics", "Controller"],
    action: "Start 3D Game",
    icon: <IconCube3D size={24} />,
    preview: (
      <div aria-hidden="true" className="relative h-24 w-full overflow-hidden rounded-lg border border-line bg-[#0c0f17]">
        <span className="absolute bottom-4 left-1/2 h-8 w-28 -translate-x-1/2 rounded-sm bg-[#2a3348]" />
        <span className="absolute bottom-[52px] left-1/2 h-7 w-7 -translate-x-1/2 rotate-12 rounded-[4px] bg-[#58c7f0]/85 shadow-[8px_6px_0_-1px_rgb(46_114_158/0.55)]" />
        <span className="absolute right-5 top-4 h-2 w-2 rounded-full bg-[#ffd9a0] shadow-[0_0_14px_4px_rgb(255_217_160/0.35)]" />
        <span aria-hidden className="absolute left-2 top-2 h-3 w-3 rounded-tl border-l border-t border-violet/40" />
        <span aria-hidden className="absolute bottom-2 right-2 h-3 w-3 rounded-br border-b border-r border-violet/40" />
      </div>
    ),
  },
];

export function CreateProjectClient() {
  const router = useRouter();
  /** `creatingRef` guards double activation (click + Enter) at the source. */
  const creatingRef = useRef(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [method, setMethod] = useState<"blank" | "template" | null>(null);
  const [templates, setTemplates] = useState<TemplateBrief[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateBrief | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const environment = ENVIRONMENTS.find((e) => e.type === projectType);

  const create = async () => {
    if (!projectType || creatingRef.current) return;
    creatingRef.current = true;
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
      creatingRef.current = false;
      setCreating(false);
      if (err instanceof ApiError) {
        const fieldMessage = err.fieldError("name") ?? err.fieldError("type");
        if (fieldMessage) setFieldError(fieldMessage);
        else setError(err.message);
      } else {
        setError("Could not create the project. Check your connection and try again.");
      }
    }
  };

  const chooseEnvironment = (type: ProjectType) => {
    setProjectType(type);
    setMethod(null);
    setSelectedTemplate(null);
    setStep(2);
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl px-4 pt-10 pb-24 sm:px-6 lg:pt-14">
      <div
        aria-hidden="true"
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:radial-gradient(70%_100%_at_50%_0%,black,transparent)]"
      />

      <div className="relative">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          <IconChevronLeft size={14} />
          All projects
        </Link>

        {step === 1 ? (
          <section aria-labelledby="create-hub" className="mt-8">
            <Chip tone="violet">Create Project</Chip>
            <h1 id="create-hub" className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Choose your creation environment
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-lg leading-8 text-fog">
              Three real engines, one workflow. Each opens its own builder — the
              project you create keeps that environment.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {ENVIRONMENTS.map((env) => (
                <EnvironmentCardView
                  key={env.type}
                  env={env}
                  onStart={() => chooseEnvironment(env.type)}
                />
              ))}
            </div>

            <div className="mt-8">
              <p className="font-mono text-[10px] tracking-[0.14em] text-mist uppercase">More kinds</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROJECT_TYPES.filter((t) => !isFlagshipType(t) && t !== "3d").map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => chooseEnvironment(t)}
                    className="rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] text-fog transition-colors hover:border-violet/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                  >
                    {projectTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-10 text-[13px] text-mist">
              Not sure yet? Browse <ButtonLink variant="ghost" size="sm" href="/dashboard/templates" className="px-1">templates</ButtonLink> for inspiration.
            </p>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="create-how" className="mt-8">
            <Chip tone="violet">New {projectType ? projectTypeLabel(projectType) : "Project"}</Chip>
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
                      start blank and it works the same.
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
              Change environment
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
                  placeholder={projectType === "3d" ? "e.g. Cube Runner" : projectType === "game" ? "e.g. Sky Jumper" : "e.g. Habit Tracker"}
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
                  {creating
                    ? `Creating ${environment ? environment.title.toLowerCase() : "project"}…`
                    : "Create project"}
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
      </div>
    </div>
  );
}

/** One creation-environment card: icon, honest env label, capability chips,
 * a preview derived from the real system, and the Start action. */
function EnvironmentCardView({ env, onStart }: { env: EnvironmentCard; onStart: () => void }) {
  return (
    <article
      aria-label={`${env.title} creation environment`}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-violet/40"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-deep/20 text-violet">
          {env.icon}
        </span>
        <span className="font-mono text-[9px] tracking-[0.16em] text-mist uppercase">{env.label}</span>
      </div>

      {env.preview}

      <div>
        <h2 className="text-xl font-semibold tracking-tight">{env.title}</h2>
        <p className="mt-1.5 text-[13.5px] leading-6 text-fog">{env.description}</p>
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label={`${env.title} capabilities`}>
        {env.chips.map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-fog"
          >
            {chip}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onStart}
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet/40 bg-violet/10 px-4 py-2.5 text-[13.5px] font-medium text-violet transition-colors hover:bg-violet/20 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        {env.action}
        <IconArrowRight size={15} />
      </button>
    </article>
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
      className={`flex items-center gap-4 rounded-2xl border border-line bg-card p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${interactive}`}
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
