import { ButtonLink, Chip, Container } from "@ideaven/ui";

/**
 * Shared shell for routes that belong to future phases. Every future link on
 * the landing page resolves here instead of dead-ending.
 */
export function PlaceholderPage({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex min-h-[72vh] items-center justify-center overflow-hidden pt-16 pb-24">
      <div
        aria-hidden="true"
        className="bg-dots absolute inset-0 [mask-image:radial-gradient(50%_40%_at_50%_45%,black,transparent)]"
      />
      <Container className="relative max-w-xl text-center">
        <Chip tone="violet" className="mx-auto">
          {kicker}
        </Chip>
        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-pretty text-lg leading-8 text-fog">
          {description}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/" size="lg">
            Back to home
          </ButtonLink>
          <ButtonLink href="/#explore" variant="secondary" size="lg">
            See example projects
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
