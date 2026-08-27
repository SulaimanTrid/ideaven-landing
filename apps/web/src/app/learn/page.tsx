import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Learn",
  robots: { index: false, follow: false },
};

export default function LearnPage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Learn"
      description="Guides, tutorials, and a hands-on learning path will arrive together with the Ideaven editor."
    />
  );
}
