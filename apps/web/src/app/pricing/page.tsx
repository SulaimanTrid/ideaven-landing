import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Pricing",
  robots: { index: false, follow: false },
};

export default function PricingPage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Pricing"
      description="Ideaven is in early development. Pricing will be published when the product approaches launch."
    />
  );
}
