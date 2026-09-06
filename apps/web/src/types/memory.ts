/**
 * Project Memory (roadmap 5.0 M5): durable per-project rules the user writes
 * for the AI planner. Shapes mirror apps/api/internal/project/memory.go.
 */

export type MemoryCategory =
  | "coding"
  | "ui"
  | "architecture"
  | "naming"
  | "ai-instruction"
  | "forbidden"
  | "preferred"
  | "goal"
  | "legacy";

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  coding: "Coding rules",
  ui: "UI rules",
  architecture: "Architecture",
  naming: "Naming",
  "ai-instruction": "AI instructions",
  forbidden: "Forbidden changes",
  preferred: "Preferred technologies",
  goal: "Project goals",
  legacy: "Known legacy areas",
};

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
}
