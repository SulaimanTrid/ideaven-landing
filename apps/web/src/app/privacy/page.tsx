import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Privacy"
      description="A full privacy policy will be published before any accounts or analytics exist. Today, this landing page collects nothing and tracks no one."
    />
  );
}
