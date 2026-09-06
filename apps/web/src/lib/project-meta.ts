/**
 * Project metadata helpers shared by every surface that displays a project
 * kind (cards, explore, builder top-bar, public pages). One vocabulary, one
 * place — the old `type === "game" ? "Game" : "App"` ternaries collapsed
 * here when the universal type vocabulary landed (7.0 M7).
 */
import type { ProjectType } from "@/types/project";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  app: "App",
  game: "Game",
  website: "Website",
  backend: "Backend",
  api: "API",
  database: "Database",
  experience: "Experience",
  extension: "Extension",
  tool: "Tool",
  education: "Educational",
};

export const PROJECT_TYPES: ProjectType[] = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

export function projectTypeLabel(type: string): string {
  const known = PROJECT_TYPE_LABELS[type as ProjectType];
  if (known) return known;
  const first = type.charAt(0).toUpperCase();
  return first === "" ? "Project" : first + type.slice(1);
}

/** Whether the type has a guided creation card + templates today. */
export function isFlagshipType(type: string): boolean {
  return type === "app" || type === "game";
}
