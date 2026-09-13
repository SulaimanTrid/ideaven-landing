"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "@/lib/api";
import type { AuthStatus, LoginRequest, RegisterRequest, User } from "@/types/auth";

/**
 * Single source of truth for authentication state. Mounts once in the root
 * layout; every consumer (header, guards, pages) reads the same context so
 * state is never duplicated across components.
 */

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Internal: updates the cached user after in-place profile changes. */
  setUser: (user: User) => void;
  /** Re-runs GET /auth/me — used after out-of-band changes (verify page). */
  refresh: () => Promise<void>;
  login: (input: LoginRequest) => Promise<User>;
  register: (input: RegisterRequest) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  // On mount: restore the session from the HttpOnly cookie, if any.
  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(user);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const { user } = await authApi.login(input);
    setUser(user);
    setStatus("authenticated");
    return user;
  }, []);

  const register = useCallback(async (input: RegisterRequest) => {
    const { user } = await authApi.register(input);
    setUser(user);
    setStatus("authenticated");
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Optimistic: even if the network blipped, the cookie is what matters
      // and the next me() will correct any drift.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, setUser, refresh, login, register, logout }),
    [status, user, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
