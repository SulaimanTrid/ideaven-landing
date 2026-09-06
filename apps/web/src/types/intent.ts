/**
 * Project Intent (roadmap 7.0 M11): the user's structured statement of what
 * the project is for. Mirrors apps/api/internal/project/intent.go.
 */
export interface ProjectIntent {
  projectId: string;
  goal: string;
  audience: string;
  platforms: string;
  constraints: string;
  success: string;
  updatedAt: string;
}

export interface IntentInput {
  goal: string;
  audience: string;
  platforms: string;
  constraints: string;
  success: string;
}
