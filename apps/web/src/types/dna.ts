/**
 * Project DNA (roadmap 4.0 M3): the derived understanding document served by
 * GET /api/projects/{id}/dna. Shapes mirror the Go structs in
 * apps/api/internal/project/dna.go — every field is derived from real model
 * data, never invented.
 */

export interface DNAVariable {
  name: string;
  type: string;
  writes: number;
  reads: number;
}

export interface DNAAsset {
  name: string;
  kind: string;
  usedBy: number;
  orphan: boolean;
}

export interface DNAReport {
  purpose: { name: string; description: string; type: string; visibility: string };
  architecture: {
    screens: number;
    components: number;
    byType: Record<string, number>;
    handlers: number;
    blocks: number;
    startScreen: string;
    emptyScreens: string[];
    navigation: Record<string, string>;
  };
  state: { variables: DNAVariable[] };
  assets: DNAAsset[];
  logic: { eventsUsed: Record<string, number> };
  extensions: string[];
  health: {
    critical: number;
    attention: number;
    info: number;
    dimensions: Record<string, "healthy" | "attention" | "critical">;
  };
  generatedAt: string;
}
