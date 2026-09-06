import { RequireAuth } from "@/auth/require-auth";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * Settings shell: guard once here, then every section page renders inside.
 * The grid collapses to a horizontal section switcher on small screens.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="mx-auto w-full max-w-4xl px-4 pt-28 pb-20 sm:px-6">
        <header className="mb-8">
          <p className="font-mono text-xs tracking-[0.14em] text-mist uppercase">Account</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
        </header>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
          <SettingsNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </RequireAuth>
  );
}
