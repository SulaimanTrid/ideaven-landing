import { ButtonLink, Container } from "@ideaven/ui";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[72vh] items-center justify-center overflow-hidden pt-16 pb-24">
      <div
        aria-hidden="true"
        className="bg-dots absolute inset-0 [mask-image:radial-gradient(50%_40%_at_50%_45%,black,transparent)]"
      />
      <Container className="relative max-w-xl text-center">
        <p className="font-mono text-[11px] tracking-[0.3em] text-mist uppercase">
          Error 404
        </p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          This block isn&rsquo;t connected.
        </h1>
        <p className="mt-4 text-pretty text-lg leading-8 text-fog">
          The page you&rsquo;re looking for doesn&rsquo;t exist — or hasn&rsquo;t
          been built yet.
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/" size="lg">
            Back to home
          </ButtonLink>
        </div>
      </Container>
    </div>
  );
}
