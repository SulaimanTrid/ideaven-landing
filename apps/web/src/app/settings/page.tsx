import type { Metadata } from "next";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = {
  title: "Settings — Profile",
  robots: { index: false, follow: false },
};

export default function SettingsProfilePage() {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <p className="mt-1 mb-6 text-sm text-fog">
        How you appear across Ideaven. Your email and account ID stay fixed.
      </p>
      <ProfileForm />
    </section>
  );
}
