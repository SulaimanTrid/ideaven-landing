"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectApi } from "@/lib/api";
import { useAuth } from "@/auth/auth-provider";
import { ApiError } from "@/types/auth";
import { IconSparkle } from "@/components/visuals/icons";

/**
 * Compact remix affordance for community surfaces: copies the published
 * snapshot into the signed-in visitor's account and opens the builder.
 * Anonymous visitors go to sign-in first — never a fake remix.
 */
export function CompactRemixButton({ slug, next }: { slug: string; next?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remix = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(next ?? `/community`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project } = await projectApi.remix(slug);
      router.push(`/builder/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remix. Try again shortly.");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void remix()}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[12px] font-medium text-fog transition-colors hover:border-violet/50 hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
      >
        <IconSparkle size={13} />
        {busy ? "Remixing…" : "Remix"}
      </button>
      {error ? <span className="mt-1 text-[11px] text-rose">{error}</span> : null}
    </span>
  );
}
