import type { Metadata } from "next";
import { Suspense } from "react";
import { StartRedirect } from "@/components/auth/start-redirect";

export const metadata: Metadata = {
  title: "Start building",
  robots: { index: false, follow: false },
};

/**
 * TASK 65 §15/§32: every "Start Building" CTA lands here, and /start routes
 * into the ONE canonical creation flow: authenticated users go straight to
 * the Creation Hub (preserving a ?type= preselect); anonymous users go to
 * sign-up with a `next` return path — the hub itself stays protected by
 * RequireAuth, so there is no second creation implementation.
 */
export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartRedirect />
    </Suspense>
  );
}
