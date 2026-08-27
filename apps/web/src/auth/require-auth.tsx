"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";

/**
 * Client-side guard for authenticated areas. While the session check is in
 * flight it renders a quiet branded shell; once unauthenticated it redirects
 * to /login with a safe `next` return path.
 */

function GuardSplash() {
  return (
    <div className="flex min-h-[72vh] items-center justify-center pt-16">
      <div className="flex flex-col items-center gap-4 text-mist">
        <Logo />
        <p className="font-mono text-xs tracking-[0.14em] uppercase">Checking your session…</p>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, pathname, router]);

  if (status === "loading") return <GuardSplash />;
  if (status === "unauthenticated") return null;
  return <>{children}</>;
}
