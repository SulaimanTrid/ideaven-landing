import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateProjectClient } from "./create-project-client";

export const metadata: Metadata = {
  title: "Create Project",
};

export default function CreateProjectPage() {
  // useSearchParams (the ?type= deep-link) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <CreateProjectClient />
    </Suspense>
  );
}
