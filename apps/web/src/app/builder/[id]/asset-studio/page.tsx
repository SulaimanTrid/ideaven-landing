"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SpriteEditor } from "@/components/asset-studio/sprite-editor";

/**
 * The 2D Asset Studio (TASK 09): a dedicated sprite/tile/animation-frame
 * creator scoped to this project. Saved work lands in the project's real
 * asset library as PNG.
 */
export default function AssetStudioPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  return (
    <Suspense fallback={null}>
      <SpriteEditor projectId={projectId} />
    </Suspense>
  );
}
