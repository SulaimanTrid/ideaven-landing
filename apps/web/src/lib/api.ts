import {
  ApiError,
  type AuthResponse,
  type LoginRequest,
  type MessageResponse,
  type RegisterRequest,
  type User,
} from "@/types/auth";

/**
 * Thin fetch wrapper for the Ideaven API. Sessions ride an HttpOnly cookie,
 * so every call sends credentials and no token is ever stored in JavaScript.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface RequestOptions {
  method?: "GET" | "POST";
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
};

export type { User };
