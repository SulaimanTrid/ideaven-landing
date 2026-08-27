import { Container } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";

function BlockSeparator({ color }: { color: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 28 28"
      aria-hidden="true"
      className="mx-1 inline-block align-middle"
    >
      <path
        d="M7 0 H9 a5 4 0 0 0 10 0 H21 A7 7 0 0 1 28 7 V21 A7 7 0 0 1 21 28 H19 a5 4 0 0 1 -10 0 H7 A7 7 0 0 1 0 21 V7 A7 7 0 0 1 7 0 Z"
        fill={color}
      />
    </svg>
  );
}

export function Philosophy() {
  return (
    <section
      aria-labelledby="philosophy-title"
      className="relative overflow-hidden border-b border-line py-28 sm:py-36"
    >
      <div
        aria-hidden="true"
        className="bg-dots absolute inset-0 [mask-image:radial-gradient(60%_50%_at_50%_50%,black,transparent)]"
      />
      <Container className="relative text-center">
        <Reveal>
          <p className="font-mono text-[11px] tracking-[0.3em] text-mist uppercase">
            <span className="text-violet">09</span>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            Philosophy
          </p>
          <h2
            id="philosophy-title"
            className="mx-auto mt-6 max-w-3xl text-balance text-4xl leading-[1.12] font-semibold tracking-tight sm:text-5xl"
          >
            Every idea deserves <span className="text-mint">a way to exist.</span>
          </h2>
          <p className="mt-6 text-pretty text-lg text-fog">
            Technology should expand imagination, not limit it.
          </p>
        </Reveal>

        <Reveal delay={150}>
          <p className="mt-16 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 font-mono text-sm tracking-[0.35em] text-ink uppercase sm:text-base">
            <span>Imagine</span>
            <BlockSeparator color="var(--color-violet)" />
            <span>Build</span>
            <BlockSeparator color="var(--color-mint)" />
            <span>Share</span>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
