import type { Metadata } from "next";
import { RequireAuth } from "@/auth/require-auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CommandPalette } from "@/components/command-palette/command-palette";

export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

/**
 * Layout for the authenticated workspace: route protection plus the sidebar
 * chrome. Every /dashboard/* page renders inside this shell.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <DashboardShell>{children}</DashboardShell>
      <CommandPalette />
    </RequireAuth>
  );
}
