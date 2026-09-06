"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Renders its children only outside workspace routes. The dashboard and the
 * builder own their full-viewport chrome, so the marketing footer would only
 * clutter them.
 */
export function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/dashboard") || pathname?.startsWith("/builder")) return null;
  return <>{children}</>;
}
