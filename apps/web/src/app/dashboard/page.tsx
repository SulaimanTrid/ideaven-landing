import type { Metadata } from "next";
import { RequireAuth } from "@/auth/require-auth";
import { DashboardContent } from "@/components/auth/dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Ideaven account dashboard.",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
