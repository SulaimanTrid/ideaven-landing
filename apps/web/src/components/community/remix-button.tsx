"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectApi } from "@/lib/api";
import { useAuth } from "@/auth/auth-provider";
import { ApiError } from "@/types/auth";
import { IconSparkle } from "@/components/visuals/icons";

/**
 * The remix button on a public project page: copies the snapshot into the
 * signed-in visitor's account as a fresh draft and opens the builder.
 * Anonymous visitors are sent to sign in first.
 */
export function RemixButton({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remix = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/p/${slug}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { project } = await projectApi.remix(slug);
      router.push(`/builder/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remix this project. Try again shortly.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void remix()}
        disabled={busy}
        className="flex h-10 items-center gap-2 rounded-lg border border-violet/50 bg-violet/10 px-5 text-[13px] font-medium text-violet transition-colors hover:bg-violet/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40"
      >
        <IconSparkle size={15} />
        {busy ? "Remixing…" : user ? "Remix into my account" : "Sign in to remix"}
      </button>
      {error ? <p className="text-[12px] text-rose">{error}</p> : null}
    </div>
  );
}
