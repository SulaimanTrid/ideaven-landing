"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";

/**
 * Client-side guard for authenticated areas. While the session check is in
 * flight it renders a quiet branded shell; once unauthenticated it redirects
 * to /login with a safe `next` return path (path + query — TASK 65: a
 * deep-link like /dashboard/projects/new?type=game survives the login stop).
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

function RequireAuthInner({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (status === "unauthenticated") {
      const query = params.toString();
      const target = pathname && pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
      const next = query ? `${target}?${query}` : target;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, pathname, params, router]);

  if (status === "loading") return <GuardSplash />;
  if (status === "unauthenticated") return null;
  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  // The inner guard reads search params — keep it under a Suspense boundary.
  return (
    <Suspense fallback={<GuardSplash />}>
      <RequireAuthInner>{children}</RequireAuthInner>
    </Suspense>
  );
}
