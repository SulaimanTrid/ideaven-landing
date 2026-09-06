import type { ProjectModelComponent } from "./project";

/**
 * Project Intelligence (roadmap 3.0 M1): the derived-only report served by
 * GET /api/projects/{id}/intelligence. Shapes mirror the Go structs.
 */

export type IntelSeverity = "critical" | "attention" | "info";
export type IntelDimension =
  | "build"
  | "architecture"
  | "performance"
  | "accessibility"
  | "security"
  | "dependency"
  | "runtime";
export type IntelHealth = "healthy" | "attention" | "critical";

export interface IntelIssue {
  severity: IntelSeverity;
  dimension: IntelDimension;
  message: string;
  screenId?: string;
  screenName?: string;
  componentId?: string;
  handlerId?: string;
  blockId?: string;
}

export interface IntelEdge {
  from: string;
  to: string;
  kind: "navigation" | "event" | "dependency" | "asset";
  /** Provenance: which handler/block produced this edge. */
  handlerId?: string;
  blockId?: string;
}

export interface ProjectIntelligence {
  counts: {
    screens: number;
    components: number;
    byType: Record<string, number>;
    handlers: number;
    blocks: number;
    variables: number;
    assets: number;
    assetBytes: number;
    handlersWired: number;
  };
  navigation: IntelEdge[];
  issues: IntelIssue[];
  health: Record<
    | "build"
    | "architecture"
    | "performance"
    | "accessibility"
    | "security"
    | "dependency"
    | "runtime",
    IntelHealth
  >;
  generatedAt: string;
}

export type { ProjectModelComponent };
