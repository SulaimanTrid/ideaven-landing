"use client";

import { useState } from "react";
import { publicationThumbnailUrl } from "@/lib/api";

/**
 * A published project's real preview image: the deterministic wireframe the
 * API renders from the project's own canonical model. No stock photos — if
 * the SVG ever fails to load the frame degrades to an honest empty panel,
 * never to a fake screenshot.
 */
export function ProjectThumb({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center border border-line bg-canvas text-[11px] uppercase tracking-[0.14em] text-mist ${className ?? ""}`}
      >
        No preview
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- server-rendered SVG from our own API
    <img
      src={publicationThumbnailUrl(slug)}
      alt={`Preview of ${name}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
