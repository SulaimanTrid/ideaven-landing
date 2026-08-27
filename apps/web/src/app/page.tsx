import { Hero } from "@/components/hero/hero";
import { CoreIdea } from "@/components/sections/core-idea";
import { Journey } from "@/components/sections/journey";
import { AiSection } from "@/components/sections/ai";
import { Creations } from "@/components/sections/creations";
import { LoopSection } from "@/components/sections/loop";
import { Showcase } from "@/components/sections/showcase";
import { Philosophy } from "@/components/sections/philosophy";
import { WhyIdeaven } from "@/components/sections/why";
import { FinalCta } from "@/components/sections/final-cta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <CoreIdea />
      <Journey />
      <AiSection />
      <Creations />
      <LoopSection />
      <Showcase />
      <Philosophy />
      <WhyIdeaven />
      <FinalCta />
    </>
  );
}
