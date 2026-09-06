import type { Metadata } from "next";
import { RequireAuth } from "@/auth/require-auth";
import { ProfileContent } from "@/components/profile/profile-content";

export const metadata: Metadata = {
  title: "Your profile",
  description: "Your Ideaven profile — how you appear across the platform.",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}
