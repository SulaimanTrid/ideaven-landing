import {
  ApiError,
  type AuthResponse,
  type ChangePasswordRequest,
  type LoginRequest,
  type MessageResponse,
  type RegisterRequest,
  type UpdateProfileRequest,
  type User,
} from "@/types/auth";
import type { ProjectIntelligence } from "@/types/intelligence";
import type { DNAReport } from "@/types/dna";
import type { PublicExtension } from "@/types/extension";
import type { MemoryItem, MemoryCategory } from "@/types/memory";
import type { ProjectIntent, IntentInput } from "@/types/intent";
import type {
  CreateExtensionRequest,
  Extension,
  ExtensionManifest,
  ExtensionVersion,
  UpdateExtensionRequest,
} from "@/types/extension";
import type {
  AIOperation,
  CreateProjectRequest,
  Project,
  ProjectListResponse,
  ProjectModel,
  ProjectResponse,
  ProjectStatusFilter,
  ProjectSort,
  ProjectSummary,
  UpdateProjectRequest,
} from "@/types/project";

/**
 * Thin fetch wrapper for the Ideaven API. Sessions ride an HttpOnly cookie,
 * so every call sends credentials and no token is ever stored in JavaScript.
 */

// Empty = same-origin: in production the API service lives behind /api/* on
// the same domain (Vercel services), so no host is prepended. Local dev sets
// NEXT_PUBLIC_API_URL in .env.local (e.g. http://localhost:8081).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Cannot reach the Ideaven service. Check your connection and try again.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string; details?: [] } } | null)
      ?.error;
    throw new ApiError(
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? "Something went wrong. Try again shortly.",
      response.status,
      err?.details,
    );
  }
  return payload as T;
}

export const authApi = {
  register(input: RegisterRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/register", { method: "POST", body: input });
  },

  login(input: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", { method: "POST", body: input });
  },

  logout(): Promise<{ ok: true }> {
    // No body: the backend clears the session cookie regardless.
    return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  },

  me(): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/me");
  },

  forgotPassword(email: string): Promise<MessageResponse> {
    return request<MessageResponse>("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  },

  validateResetToken(token: string): Promise<{ valid: true }> {
    return request<{ valid: true }>("/api/auth/validate-reset-token", {
      method: "POST",
      body: { token },
    });
  },

  resetPassword(token: string, password: string): Promise<MessageResponse> {
    return request<MessageResponse>("/api/auth/reset-password", {
      method: "POST",
      body: { token, password },
    });
  },

  verifyEmail(token: string): Promise<MessageResponse> {
    return request<MessageResponse>("/api/auth/verify-email", { method: "POST", body: { token } });
  },

  resendVerification(email: string): Promise<MessageResponse> {
    return request<MessageResponse>("/api/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
  },

  /**
   * Rewrites the editable profile of the session's user. The API derives
   * identity from the session cookie — no user ID travels in the body.
   */
  updateProfile(input: UpdateProfileRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/api/profile", { method: "PATCH", body: input });
  },

  /** Verifies the current password; the API signs out all other devices. */
  changePassword(input: ChangePasswordRequest): Promise<MessageResponse> {
    return request<MessageResponse>("/api/auth/change-password", {
      method: "POST",
      body: input,
    });
  },
};

export const projectApi = {
  list(options: {
    q?: string;
    status?: ProjectStatusFilter;
    sort?: ProjectSort;
    limit?: number;
    offset?: number;
  } = {}): Promise<ProjectListResponse> {
    const params = new URLSearchParams();
    if (options.q) params.set("q", options.q);
    if (options.status) params.set("status", options.status);
    if (options.sort) params.set("sort", options.sort);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    if (options.offset !== undefined) params.set("offset", String(options.offset));
    const encoded = params.toString();
    return request<ProjectListResponse>(`/api/projects${encoded ? `?${encoded}` : ""}`);
  },

  get(id: string): Promise<ProjectResponse> {
    return request<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}`);
  },

  create(input: CreateProjectRequest): Promise<ProjectResponse> {
    return request<ProjectResponse>("/api/projects", { method: "POST", body: input });
  },

  update(id: string, input: UpdateProjectRequest): Promise<{ project: ProjectSummary }> {
    return request<{ project: ProjectSummary }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    });
  },

  duplicate(id: string): Promise<{ project: ProjectSummary }> {
    return request<{ project: ProjectSummary }>(`/api/projects/${encodeURIComponent(id)}/duplicate`, {
      method: "POST",
    });
  },

  open(id: string): Promise<ProjectResponse> {
    return request<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}/open`, {
      method: "POST",
    });
  },

  /**
   * Replaces the canonical model document (the builder's save path). An
   * "ai" origin labels the resulting server snapshot as an applied AI
   * changeset so History can point at the pre-AI state.
   */
  updateModel(id: string, model: ProjectModel, origin?: "ai"): Promise<{ project: ProjectSummary }> {
    return request<{ project: ProjectSummary }>(`/api/projects/${encodeURIComponent(id)}/model`, {
      method: "PUT",
      body: origin ? { model, origin } : { model },
    });
  },

  intelligence(id: string): Promise<{ intelligence: ProjectIntelligence }> {
    return request<{ intelligence: ProjectIntelligence }>(
      `/api/projects/${encodeURIComponent(id)}/intelligence`,
    );
  },

  dna(id: string): Promise<{ dna: DNAReport }> {
    return request<{ dna: DNAReport }>(
      `/api/projects/${encodeURIComponent(id)}/dna`,
    );
  },

  intentGet(id: string): Promise<{ intent: ProjectIntent }> {
    return request<{ intent: ProjectIntent }>(
      `/api/projects/${encodeURIComponent(id)}/intent`,
    );
  },

  intentSet(id: string, body: IntentInput): Promise<{ intent: ProjectIntent }> {
    return request<{ intent: ProjectIntent }>(
      `/api/projects/${encodeURIComponent(id)}/intent`,
      { method: "PUT", body },
    );
  },

  memoryList(id: string): Promise<{ memory: MemoryItem[] }> {
    return request<{ memory: MemoryItem[] }>(
      `/api/projects/${encodeURIComponent(id)}/memory`,
    );
  },

  memoryAdd(id: string, body: { category: MemoryCategory; content: string }): Promise<{ memory: MemoryItem }> {
    return request<{ memory: MemoryItem }>(
      `/api/projects/${encodeURIComponent(id)}/memory`,
      { method: "POST", body },
    );
  },

  memoryRemove(id: string, memoryId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(id)}/memory/${encodeURIComponent(memoryId)}`,
      { method: "DELETE" },
    );
  },

  remove(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  /**
   * Snapshots the current model server-side and opens the public page.
   * Republishing replaces the snapshot.
   */
  publish(id: string): Promise<{ project: Project; publicPath: string }> {
    return request<{ project: Project; publicPath: string }>(
      `/api/projects/${encodeURIComponent(id)}/publish`,
      { method: "POST" },
    );
  },

  /** Removes the public snapshot and returns the project to draft. */
  unpublish(id: string): Promise<{ project: Project }> {
    return request<{ project: Project }>(
      `/api/projects/${encodeURIComponent(id)}/unpublish`,
      { method: "POST" },
    );
  },

  /**
   * Copies a published project's snapshot into the caller's account as a
   * fresh draft (the community remix loop).
   */
  remix(slug: string): Promise<{ project: Project }> {
    return request<{ project: Project }>(
      `/api/public/projects/${encodeURIComponent(slug)}/remix`,
      { method: "POST" },
    );
  },

  /** Owner-only export downloads; the browser streams the attachment. */
  exportHTMLUrl(id: string): string {
    return `${API_BASE_URL}/api/projects/${encodeURIComponent(id)}/export/html`;
  },
  exportAndroidUrl(id: string, format: "apk" | "aab" = "apk"): string {
    return `${API_BASE_URL}/api/projects/${encodeURIComponent(id)}/export/android?format=${format}`;
  },
  exportWindowsUrl(id: string): string {
    return `${API_BASE_URL}/api/projects/${encodeURIComponent(id)}/export/windows`;
  },
};

export const extensionApi = {
  list(): Promise<{ extensions: Extension[]; total: number }> {
    return request<{ extensions: Extension[]; total: number }>("/api/extensions");
  },
  create(body: CreateExtensionRequest): Promise<{ extension: Extension }> {
    return request<{ extension: Extension }>("/api/extensions", { method: "POST", body });
  },
  get(id: string): Promise<{ extension: Extension }> {
    return request<{ extension: Extension }>(`/api/extensions/${encodeURIComponent(id)}`);
  },
  update(id: string, body: UpdateExtensionRequest): Promise<{ extension: Extension }> {
    return request<{ extension: Extension }>(`/api/extensions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
    });
  },
  remove(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/extensions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  build(id: string, body: { version?: string; changelog?: string }): Promise<{ build: { ok: boolean; version: string; logs: Array<{ step: string; level: string; message: string }>; checksum?: string; size?: number; error?: string } }> {
    return request<{ build: { ok: boolean; version: string; logs: Array<{ step: string; level: string; message: string }>; checksum?: string; size?: number; error?: string } }>(
      `/api/extensions/${encodeURIComponent(id)}/build`,
      { method: "POST", body },
    );
  },

  publish(id: string): Promise<{ extension: Extension }> {
    return request<{ extension: Extension }>(`/api/extensions/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    });
  },

  /** Owner-only download URL for a built .AIX package (cookie rides the
   * top-level navigation, SameSite=Lax). */
  aixUrl(id: string, version: string): string {
    return `${API_BASE_URL}/api/extensions/${encodeURIComponent(id)}/aix?version=${encodeURIComponent(version)}`;
  },
  listPublic(): Promise<{ extensions: PublicExtension[]; total: number }> {
    return request<{ extensions: PublicExtension[]; total: number }>("/api/public/extensions");
  },

  install(id: string): Promise<{ extension: Extension; installedVersion: string }> {
    return request<{ extension: Extension; installedVersion: string }>(
      `/api/extensions/${encodeURIComponent(id)}/install`,
      { method: "POST" },
    );
  },

  uninstall(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/extensions/${encodeURIComponent(id)}/install`, { method: "DELETE" });
  },

  installed(): Promise<{ extensions: Extension[]; total: number }> {
    return request<{ extensions: Extension[]; total: number }>("/api/me/extensions");
  },
  versions(id: string): Promise<{ versions: ExtensionVersion[] }> {
    return request<{ versions: ExtensionVersion[] }>(`/api/extensions/${encodeURIComponent(id)}/versions`);
  },
  saveVersion(id: string, body: { version: string; manifest?: ExtensionManifest; changelog: string }): Promise<{ extension: Extension }> {
    return request<{ extension: Extension }>(`/api/extensions/${encodeURIComponent(id)}/versions`, {
      method: "POST",
      body,
    });
  },
};

export const aiApi = {
  /**
   * Sends a user request plus structured context to the server. The server
   * validates the returned changeset; the client decides whether to apply it.
   */
  command(
    projectId: string,
    prompt: string,
    context: { kind: string; data?: unknown }[],
  ): Promise<{ explanation: string; operations: AIOperation[] }> {
    return request<{ explanation: string; operations: AIOperation[] }>("/api/ai/command", {
      method: "POST",
      body: { projectId, prompt, context },
    });
  },

  /**
   * The session user's derived AI credit balance (used today, the daily
   * free allowance, pack credits, and when it resets).
   */
  credits(): Promise<{ credits: AICredits }> {
    return request<{ credits: AICredits }>("/api/ai/credits");
  },

  /**
   * The merged credit ledger feed: credit awards and per-day usage,
   * newest first. This is the account-settings balance history.
   */
  creditActivity(): Promise<{ entries: AICreditActivityEntry[] }> {
    return request<{ entries: AICreditActivityEntry[] }>("/api/ai/credits/activity");
  },
};

export interface AICredits {
  usedToday: number;
  dailyLimit: number;
  freeRemaining: number;
  packBalance: number;
  remaining: number;
  resetsAt: string;
}

export interface AICreditActivityEntry {
  /** "grant" (credits awarded) or "usage" (a day's pack-credit draw). */
  kind: "grant" | "usage";
  at: string;
  /** Grants: credits awarded. Usage: pack credits drawn that day. */
  amount: number;
  detail: string;
  expiresAt?: string;
}

export interface PublicationSummary {
  slug: string;
  name: string;
  description: string;
  type: string;
  author: string;
  authorName?: string;
  publishedAt: string;
}

export interface PlatformStats {
  creators: number;
  projects: number;
  publications: number;
}

export interface TemplateBrief {
  id: string;
  name: string;
  description: string;
  type: string;
  screens: number;
}

export interface Publication extends PublicationSummary {
  model: ProjectModel;
}

/**
 * The anonymous publishing surface (roadmap 19). These fetches carry no
 * session on purpose: the server answers from the stored snapshot only.
 * Safe to call from server components (absolute API base) and the browser.
 */
export const publicApi = {
  async project(slug: string): Promise<Publication> {
    const response = await fetch(
      `${API_BASE_URL}/api/public/projects/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      const error: unknown = new Error(
        response.status === 404 ? "This project is not published." : "Could not load this project.",
      );
      (error as { status?: number }).status = response.status;
      throw error;
    }
    const data = (await response.json()) as { publication: Publication };
    return data.publication;
  },

  async list(limit = 24): Promise<PublicationSummary[]> {
    const response = await fetch(`${API_BASE_URL}/api/public/projects?limit=${limit}`, {
      cache: "no-store",
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { publications: PublicationSummary[] };
    return data.publications ?? [];
  },

  /** One creator's public identity plus their published projects. */
  async creator(username: string): Promise<{
    creator: { username: string; displayName: string };
    publications: PublicationSummary[];
  } | null> {
    const response = await fetch(
      `${API_BASE_URL}/api/public/creators/${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as {
      creator: { username: string; displayName: string };
      publications: PublicationSummary[];
    };
  },

  /** Honest platform counters, derived from real rows. */
  async stats(): Promise<PlatformStats | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/public/stats`, { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { stats: PlatformStats };
      return data.stats;
    } catch {
      return null;
    }
  },
};

/** Built-in starting points (roadmap 4/32). */
export const templateApi = {
  async list(): Promise<TemplateBrief[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates`, { cache: "no-store" });
      if (!response.ok) return [];
      const data = (await response.json()) as { templates: TemplateBrief[] };
      return data.templates ?? [];
    } catch {
      return [];
    }
  },
};

export interface ProjectAsset {
  id: string;
  projectId: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

export const assetApi = {
  /**
   * Lists a project's assets (metadata only — bytes are served by rawUrl).
   */
  list(projectId: string): Promise<{ assets: ProjectAsset[] }> {
    return request<{ assets: ProjectAsset[] }>(`/api/projects/${encodeURIComponent(projectId)}/assets`);
  },

  /**
   * Uploads one image file. Multipart is its own request path — never JSON.
   */
  async upload(projectId: string, file: File): Promise<{ asset: ProjectAsset }> {
    const form = new FormData();
    form.append("file", file);
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/assets`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
    } catch {
      throw new ApiError("NETWORK_ERROR", "Cannot reach the Ideaven service. Check your connection and try again.");
    }
    const payload = (await response.json().catch(() => null)) as
      | { asset?: ProjectAsset; error?: { code?: string; message?: string } }
      | null;
    if (!response.ok || !payload?.asset) {
      throw new ApiError(
        payload?.error?.code ?? "INTERNAL_ERROR",
        payload?.error?.message ?? "The upload failed. Try again shortly.",
        response.status,
      );
    }
    return { asset: payload.asset };
  },

  /**
   * Removes an asset. Components still referencing it show a broken-source
   * state — the same as a dead external URL.
   */
  remove(assetId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  },
};

export interface ProjectVersion {
  id: string;
  projectId: string;
  /** "edit" (normal save) | "ai" (applied AI changeset). */
  origin: string;
  size: number;
  createdAt: string;
}

export const versionApi = {
  /**
   * Lists a project's model snapshots, newest first (metadata only).
   */
  list(projectId: string): Promise<{ versions: ProjectVersion[] }> {
    return request<{ versions: ProjectVersion[] }>(`/api/projects/${encodeURIComponent(projectId)}/versions`);
  },

  /**
   * Fetches one snapshot with its full model document — the restore source.
   */
  get(projectId: string, versionId: string): Promise<{ version: ProjectVersion & { model: ProjectModel } }> {
    return request<{ version: ProjectVersion & { model: ProjectModel } }>(
      `/api/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
    );
  },
};

/**
 * Resolves an image component's src. "asset:<id>" points at the project's
 * own stored media and renders through the authenticated raw endpoint; the
 * browser carries the session cookie (same-site) so private projects stay
 * private. Anything else is used as-is (external URL).
 */
export function imageUrl(src: string): string {
  if (src.startsWith("asset:")) {
    return `${API_BASE_URL}/api/assets/${encodeURIComponent(src.slice(6))}/raw`;
  }
  return src;
}

export type {
  Project,
  ProjectSummary,
  User,
  ProjectModel,
  AIOperation,
};
