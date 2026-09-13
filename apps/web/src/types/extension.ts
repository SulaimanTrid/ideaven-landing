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
  /** Display name of the extension package (required by import validation). */
  name?: string;
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

// ---- build pipeline (Task 06) ----------------------------------------------------

/** Pipeline states, emitted by the build worker the moment each step runs. */
export type BuildState =
  | "idle"
  | "validating"
  | "source-validation"
  | "resolving-dependencies"
  | "compiling"
  | "packaging"
  | "verifying"
  | "success"
  | "failed"
  | "cancelled";

export interface BuildLogLine {
  step: string;
  level: string;
  message: string;
}

/** One streamed build event (SSE): state | log | result | conflict. */
export interface BuildEvent {
  type: "state" | "log" | "result" | "conflict";
  state?: BuildState;
  step?: string;
  level?: string;
  message?: string;
  buildId?: string;
  ok?: boolean;
  version?: string;
  checksum?: string;
  size?: number;
  error?: string;
  failedStep?: string;
  conflict?: VersionConflict;
}

/** Version-collision choices the backend actually supports. */
export interface VersionConflict {
  version: string;
  builtAt?: string;
  suggestions: Array<{
    action: "use-existing" | "change-version" | "bump-patch";
    label: string;
    version?: string;
  }>;
}

/** One real build run — the build history row. */
export interface BuildRecord {
  id: string;
  extensionId: string;
  version: string;
  status: "running" | "success" | "failed" | "cancelled";
  failedStep?: string;
  error?: string;
  logs: BuildLogLine[];
  checksum?: string;
  size?: number;
  changelog?: string;
  createdAt: string;
  finishedAt?: string;
}

/** Diff-based AI fix proposal for a failed build. */
export interface FixProposal {
  buildId: string;
  target: "source" | "manifest";
  explanation: string;
  diff: string;
  newContent: string;
  valid: boolean;
  problems?: Array<{ line: number; message: string }>;
  provider?: string;
  model?: string;
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
