import type { ThemePreference } from "@/theme/theme-provider";

/**
 * Extension registry types (roadmap 2.0-B). The manifest contract mirrors
 * the platform's block/component definitions so the Studio and the block
 * canvas can consume extension packages without new vocabulary types.
 */

export interface ExtensionPropSpec {
  key: string;
  type: "text" | "number" | "boolean" | "color" | "select";
  default?: unknown;
  required?: boolean;
}

export interface ExtensionParamSpec {
  key: string;
  type: "text" | "number" | "boolean";
}

export interface ExtensionComponentSpec {
  id: string;
  label: string;
  props?: ExtensionPropSpec[];
}

export interface ExtensionMethodSpec {
  id: string;
  label: string;
  params?: ExtensionParamSpec[];
}

export interface ExtensionEventSpec {
  id: string;
  label: string;
}

export interface ExtensionBlockSpec {
  type: string;
  kind: "statement" | "expression";
  category: string;
  label: string;
  inputs?: Array<{ key: string; kind: string }>;
  slots?: string[];
  container?: boolean;
}

export interface ExtensionDependencySpec {
  slug: string;
  version: string;
}

export interface ExtensionManifest {
  format: number;
  components?: ExtensionComponentSpec[];
  methods?: ExtensionMethodSpec[];
  events?: ExtensionEventSpec[];
  blocks?: ExtensionBlockSpec[];
  dependencies?: ExtensionDependencySpec[];
}

export type ExtensionKind = "component" | "blocks" | "mixed";
export type ExtensionStatus = "draft" | "published";

export interface Extension {
  id: string;
  slug: string;
  name: string;
  summary: string;
  kind: ExtensionKind;
  status: ExtensionStatus;
  manifest: ExtensionManifest;
  docs: string;
  /** Authored source (e.g. Java) edited in the Studio's Source tab. */
  source: string;
  currentVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExtensionRequest {
  name: string;
  summary?: string;
  kind?: ExtensionKind;
  manifest?: ExtensionManifest;
  docs?: string;
}

export interface UpdateExtensionRequest {
  name?: string;
  summary?: string;
  manifest?: ExtensionManifest;
  docs?: string;
  source?: string;
}

export interface ExtensionVersion {
  version: string;
  manifest: ExtensionManifest;
  source: Record<string, unknown>;
  changelog: string;
  createdAt: string;
}

export type { ThemePreference };

/** A published extension as shown in the public explore list. */
export interface PublicExtension {
  id: string;
  slug: string;
  name: string;
  summary: string;
  kind: ExtensionKind;
  version: string;
  creator: string;
  installs: number;
  updatedAt: string;
}
