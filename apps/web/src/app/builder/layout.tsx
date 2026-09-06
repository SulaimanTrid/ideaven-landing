import type { Metadata } from "next";
import { RequireAuth } from "@/auth/require-auth";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Builder",
  robots: { index: false, follow: false },
};

/**
 * Layout for the Ideaven Builder: session protection without the workspace
 * chrome — the builder is a full-viewport professional environment.
 */
export default function BuilderLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
