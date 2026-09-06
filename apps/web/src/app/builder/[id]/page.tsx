import type { Metadata } from "next";
import { Builder } from "./builder/builder";

export const metadata: Metadata = {
  title: "Builder",
};

/**
 * Open Project → Ideaven Builder. The builder fetches the project itself and
 * renders without the dashboard shell so the editor owns the whole screen.
 */
export default async function BuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Builder projectId={id} />;
}
