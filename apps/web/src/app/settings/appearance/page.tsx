import type { Metadata } from "next";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

export const metadata: Metadata = {
  title: "Settings — Appearance",
  robots: { index: false, follow: false },
};

export default function SettingsAppearancePage() {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">Appearance</h2>
      <p className="mt-1 mb-6 text-sm text-fog">
        One theme for the whole product — landing, dashboard, builder, and
        every studio surface. The choice is remembered on this device.
      </p>
      <AppearanceSettings />
    </section>
  );
}
