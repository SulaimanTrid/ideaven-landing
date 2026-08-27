import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Community",
  robots: { index: false, follow: false },
};

export default function CommunityPage() {
  return (
    <PlaceholderPage
      kicker="Future phase"
      title="Community"
      description="Profiles, sharing, and community features arrive after the editor ships. There are no user accounts yet — by design."
    />
  );
}
