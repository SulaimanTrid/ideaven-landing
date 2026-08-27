import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Terms",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Terms"
      description="Terms of service will arrive together with accounts, saving, and publishing in a future phase."
    />
  );
}
