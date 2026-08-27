import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Documentation",
  robots: { index: false, follow: false },
};

export default function DocsPage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Documentation"
      description="Documentation will grow alongside the editor, starting with the block reference and the TypeScript project model."
    />
  );
}
