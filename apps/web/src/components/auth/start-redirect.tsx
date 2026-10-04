"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Logo } from "@ideaven/ui";
import { useAuth } from "@/auth/auth-provider";

/**
 * TASK 65: the /start router. Uses the session truth the app already has
 * (useAuth → /api/me): signed-in visitors continue into the Creation Hub
 * with an optional ?type= environment preselect; everyone else continues to
 * sign-up with `next` pointing back at the hub. A quiet branded splash
 * covers the check the same way <RequireAuth> does.
 */
export function StartRedirect() {
  const { status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (status === "loading") return;
    const type = params.get("type");
    const safeType = type === "app" || type === "game" || type === "3d" ? `?type=${type}` : "";
    const hub = `/dashboard/projects/new${safeType}`;
    if (status === "authenticated") {
      router.replace(hub);
    } else {
      router.replace(`/register?next=${encodeURIComponent(hub)}`);
    }
  }, [status, params, router]);

  return (
    <div className="flex min-h-[72vh] items-center justify-center pt-16">
      <div className="flex flex-col items-center gap-4 text-mist">
        <Logo />
        <p className="font-mono text-xs tracking-[0.14em] uppercase">Opening your workspace…</p>
      </div>
    </div>
  );
}
