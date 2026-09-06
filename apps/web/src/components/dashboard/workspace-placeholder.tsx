import { ButtonLink, Chip } from "@ideaven/ui";

/**
 * Shared placeholder for workspace routes whose feature ships in a later
 * phase. Nav items must never dead-end; this keeps them honest about what
 * exists today.
 */
export function WorkspacePlaceholder({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <div
        aria-hidden="true"
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-72 [mask-image:radial-gradient(60%_100%_at_50%_0%,black,transparent)]"
      />
      <div className="relative flex flex-col items-center">
        <Chip tone="violet">{kicker}</Chip>
        <h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-fog sm:text-lg sm:leading-8">
          {description}
        </p>
        <ButtonLink href="/dashboard" variant="secondary" className="mt-8">
          Back to Home
        </ButtonLink>
      </div>
    </div>
  );
}
