import { Container, SectionHeader } from "@ideaven/ui";
import { Reveal } from "@/components/reveal";
import { AiDemo } from "./ai-demo";

export function AiSection() {
  return (
    <section aria-labelledby="ai-title" className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <SectionHeader
            index="05"
            kicker="Contextual AI"
            title={<span id="ai-title">AI that understands what you&rsquo;re building.</span>}
            lead="Ideaven's future AI assistant won't just answer questions. It will understand the project you're working on and help you change it."
          />
        </Reveal>
        <AiDemo />
        <p className="mt-6 text-center text-[13px] text-mist">
          Product concept — Ideaven&rsquo;s contextual AI is a future feature.
        </p>
      </Container>
    </section>
  );
}
