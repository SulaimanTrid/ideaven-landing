import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Builder } from "./builder/builder";
import { API_BASE_URL } from "@/lib/api";
import { engineIdentityLabel } from "@/lib/project-meta";

/**
 * Open Project → Ideaven Builder. The builder fetches the project itself and
 * renders without the dashboard shell so the editor owns the whole screen.
 *
 * TASK 59 §31/§61: meaningful per-project metadata — the page title names the
 * actual engine ("IDEAVEN 3D Game Builder", "IDEAVEN 2D Game Builder",
 * "IDEAVEN App Builder") with a canonical URL. Auth failures fall back to the
 * generic builder title without blocking the editor.
 */

async function loadProject(id: string): Promise<{ type: string; name: string } | null> {
  try {
    const session = (await cookies()).get("ideaven_session")?.value;
    const res = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`, {
      headers: session ? { Cookie: `ideaven_session=${session}` } : undefined,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    const project = body?.project;
    if (!project || typeof project.type !== "string") return null;
    return { type: project.type, name: String(project.name ?? "") };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await loadProject(id);
  const engine = project ? engineIdentityLabel(project.type) : null;
  let builderName = "Builder";
  if (engine === "APP") builderName = "App Builder";
  else if (engine === "2D GAME") builderName = "2D Game Builder";
  else if (engine === "3D GAME") builderName = "3D Game Builder";
  const title = project && project.name
    ? `${project.name} — IDEAVEN ${builderName}`
    : "IDEAVEN Builder";

  return {
    title,
    alternates: { canonical: `/builder/${id}` },
    openGraph: { title, type: "website" },
    robots: { index: false },
  };
}

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Builder projectId={id} />;
}
