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
  BuildEvent,
  BuildRecord,
  CreateExtensionRequest,
  Extension,
  ExtensionManifest,
  ExtensionVersion,
  FixProposal,
  UpdateExtensionRequest,
  VersionConflict,
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
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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

  build(id: string, body: { version?: string; changelog?: string }): Promise<{ build: { ok: boolean; version: string; logs: Array<{ step: string; level: string; message: string }>; checksum?: string; size?: number; error?: string; failedStep?: string; conflict?: VersionConflict } }> {
    return request<{ build: { ok: boolean; version: string; logs: Array<{ step: string; level: string; message: string }>; checksum?: string; size?: number; error?: string; failedStep?: string; conflict?: VersionConflict } }>(
      `/api/extensions/${encodeURIComponent(id)}/build`,
      { method: "POST", body },
    );
  },

  /**
   * The same pipeline over Server-Sent Events: every real worker state and
   * log line arrives onEvent the moment it happens, ending with one
   * terminal result or conflict event. The returned promise settles when
   * the stream ends (or errors). Aborting the signal cancels the build —
   * the server kills the worker and records the run as cancelled.
   */
  async buildStream(
    id: string,
    body: { version?: string; changelog?: string },
    onEvent: (event: BuildEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(
        `${API_BASE_URL}/api/extensions/${encodeURIComponent(id)}/build/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(body),
          credentials: "include",
          signal,
        },
      );
    } catch (err) {
      if (signal?.aborted) return; // client-side cancel — expected
      throw err instanceof ApiError
        ? err
        : new ApiError("NETWORK_ERROR", "Cannot reach the Ideaven service. Check your connection and try again.");
    }
    if (!response.ok || !response.body) {
      // Errors before the stream starts arrive as the normal JSON envelope.
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(
        err?.code ?? "INTERNAL_ERROR",
        err?.message ?? "Could not run the build. Try again shortly.",
        response.status,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            onEvent(JSON.parse(line.slice(6)) as BuildEvent);
          } catch {
            // A malformed frame never fakes progress — skip it.
          }
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  },

  /** Real build history: every run with its outcome. */
  builds(id: string): Promise<{ builds: BuildRecord[] }> {
    return request<{ builds: BuildRecord[] }>(
      `/api/extensions/${encodeURIComponent(id)}/builds`,
    );
  },

  /** Diff-based AI fix proposal for one failed build. */
  fix(id: string, buildId: string): Promise<{ fix: FixProposal }> {
    return request<{ fix: FixProposal }>(`/api/extensions/${encodeURIComponent(id)}/fix`, {
      method: "POST",
      body: { buildId },
    });
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
  thumbnail?: string;
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

// ---- Community (TASK 07) ------------------------------------------------------

export const COMMUNITY_CHANNELS = [
  "general",
  "help",
  "showcase",
  "game-dev",
  "app-dev",
  "extensions",
  "beginner-zone",
] as const;

export type CommunityChannel = (typeof COMMUNITY_CHANNELS)[number];

export const CHANNEL_LABELS: Record<CommunityChannel, string> = {
  general: "General",
  help: "Help",
  showcase: "Showcase",
  "game-dev": "Game Dev",
  "app-dev": "App Dev",
  extensions: "Extensions",
  "beginner-zone": "Beginner Zone",
};

export interface CommunityPost {
  id: string;
  kind: "question" | "discussion";
  channel: CommunityChannel;
  title: string;
  body: string;
  tags: string[];
  author: string;
  authorName?: string;
  projectSlug?: string;
  projectName?: string;
  projectType?: string;
  acceptedReplyId?: string;
  createdAt: string;
  replyCount: number;
  upvotes: number;
  viewerVoted: boolean;
  viewerIsAuthor: boolean;
}

export interface CommunityReply {
  id: string;
  postId: string;
  body: string;
  author: string;
  authorName?: string;
  createdAt: string;
  upvotes: number;
  viewerVoted: boolean;
  viewerIsAuthor: boolean;
  accepted: boolean;
}

export interface CommunitySummary {
  trendingTags: { tag: string; count: number }[];
  helpfulCreators: { username: string; displayName?: string; acceptedAnswers: number }[];
  channels: { channel: CommunityChannel; count: number }[];
  questionCount: number;
  answerCount: number;
}

export interface CommunityFeedFilter {
  channel?: string;
  kind?: string;
  tag?: string;
  q?: string;
  sort?: string;
  projectSlug?: string;
  hasProject?: boolean;
  limit?: number;
}

/**
 * The creator community surface. Reads are public; writes ride the session
 * cookie through the standard request() path.
 */
export const communityApi = {
  async feed(filter: CommunityFeedFilter = {}): Promise<CommunityPost[]> {
    const params = new URLSearchParams();
    if (filter.channel) params.set("channel", filter.channel);
    if (filter.kind) params.set("kind", filter.kind);
    if (filter.tag) params.set("tag", filter.tag);
    if (filter.q) params.set("q", filter.q);
    if (filter.sort) params.set("sort", filter.sort);
    if (filter.projectSlug) params.set("projectSlug", filter.projectSlug);
    if (filter.hasProject) params.set("hasProject", "1");
    if (filter.limit) params.set("limit", String(filter.limit));
    const query = params.toString();
    try {
      const data = await request<{ posts: CommunityPost[] }>(
        `/api/community/feed${query ? `?${query}` : ""}`,
      );
      return data.posts ?? [];
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return [];
      throw error;
    }
  },

  async post(id: string): Promise<{ post: CommunityPost; replies: CommunityReply[] }> {
    return request(`/api/community/posts/${encodeURIComponent(id)}`);
  },

  async createPost(input: {
    kind: string;
    channel: string;
    title: string;
    body: string;
    tags?: string[];
    projectSlug?: string;
  }): Promise<CommunityPost> {
    const data = await request<{ post: CommunityPost }>("/api/community/posts", {
      method: "POST",
      body: input,
    });
    return data.post;
  },

  async deletePost(id: string): Promise<void> {
    await request(`/api/community/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async createReply(postId: string, body: string): Promise<CommunityReply> {
    const data = await request<{ reply: CommunityReply }>(
      `/api/community/posts/${encodeURIComponent(postId)}/replies`,
      { method: "POST", body: { body } },
    );
    return data.reply;
  },

  async deleteReply(id: string): Promise<void> {
    await request(`/api/community/replies/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async votePost(id: string): Promise<CommunityPost> {
    const data = await request<{ post: CommunityPost }>(
      `/api/community/posts/${encodeURIComponent(id)}/vote`,
      { method: "POST", body: {} },
    );
    return data.post;
  },

  async voteReply(id: string): Promise<CommunityReply> {
    const data = await request<{ reply: CommunityReply }>(
      `/api/community/replies/${encodeURIComponent(id)}/vote`,
      { method: "POST", body: {} },
    );
    return data.reply;
  },

  async acceptReply(postId: string, replyId: string): Promise<CommunityPost> {
    const data = await request<{ post: CommunityPost }>(
      `/api/community/posts/${encodeURIComponent(postId)}/accept`,
      { method: "POST", body: { replyId } },
    );
    return data.post;
  },

  async report(input: { postId?: string; replyId?: string; reason: string; note?: string }): Promise<void> {
    await request("/api/community/report", { method: "POST", body: input });
  },

  async summary(): Promise<CommunitySummary | null> {
    try {
      const data = await request<{ summary: CommunitySummary }>("/api/community/summary");
      return data.summary;
    } catch {
      return null;
    }
  },
};

/** The deterministic preview thumbnail rendered from a published project's own model. */
export function publicationThumbnailUrl(slug: string): string {
  return `${API_BASE_URL}/api/public/projects/${encodeURIComponent(slug)}/thumbnail.svg`;
}

/** Built-in starting points (roadmap 4/32). */
/** 6J portability: package backup download URL (owner-only zip). */
export function projectPackageUrl(id: string): string {
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(id)}/package`;
}

/** 6J portability: import a project package zip as a new owned project. */
export async function importProjectPackage(
  file: File,
): Promise<{ project: { id: string; name: string; slug: string } }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/projects/import`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as
    | { project?: { id: string; name: string; slug: string }; error?: { code?: string; message?: string } }
    | null;
  if (!response.ok || !payload?.project) {
    throw new ApiError(
      payload?.error?.code ?? "INTERNAL_ERROR",
      payload?.error?.message ?? "The import failed. Try again shortly.",
      response.status,
    );
  }
  return { project: payload.project };
}

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
   * M30 asset intelligence: derived dimensions, memory estimate, usage
   * counts, orphans, and hints for one project's stored media.
   */
  intelligence(projectId: string): Promise<{
    intelligence: {
      assets: {
        assetId: string;
        name: string;
        mime: string;
        size: number;
        width?: number;
        height?: number;
        decodedMemory?: number;
        uses: number;
        orphan: boolean;
        hints?: string[];
      }[];
      totalCount: number;
      orphanCount: number;
      totalSize: number;
      totalDecodedMemory: number;
    };
  }> {
    return request(
      `/api/projects/${encodeURIComponent(projectId)}/asset-intelligence`,
    );
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
