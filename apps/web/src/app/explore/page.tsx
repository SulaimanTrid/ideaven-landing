import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Explore",
  robots: { index: false, follow: false },
};

export default function ExplorePage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Explore"
      description="A public gallery of community projects is coming in a future phase. The examples on the landing page give a first taste of where this is going."
    />
  );
}
