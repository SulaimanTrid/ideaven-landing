/**
 * Authentication wire types. Mirrors the Go API's shapes exactly — see
 * apps/api/internal/auth/handler.go (SafeUser) and internal/httpx.
 */

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/** loading → the initial /auth/me check has not answered yet. */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface AuthResponse {
  user: User;
}

export interface MessageResponse {
  message: string;
}

/** Machine-readable codes produced by the API (subset used by the UI). */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST_BODY"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | (string & {});

/** Typed error thrown by the API client for every failure mode. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: FieldError[];

  constructor(code: ApiErrorCode, message: string, status = 0, details?: FieldError[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Field-level message from validation details, if present. */
  fieldError(field: string): string | undefined {
    return this.details?.find((detail) => detail.field === field)?.message;
  }
}
