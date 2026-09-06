"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { projectApi } from "@/lib/api";
import { ApiError } from "@/types/auth";
import type { ProjectStatusFilter, ProjectSort, ProjectSummary } from "@/types/project";

/**
 * Fetches one page of the project library. Debounces the search query,
 * ignores stale responses, and exposes loading/error/reload so pages render
 * proper states instead of blank panels.
 */
export function useProjects(options: {
  q: string;
  status?: ProjectStatusFilter;
  sort?: ProjectSort;
  limit?: number;
}) {
  const { q, status, sort, limit } = options;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 300 ms debounce keeps typing from hammering the API.
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const seqRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await projectApi.list({ q: debouncedQ, status, sort, limit });
      if (seq !== seqRef.current) return;
      setProjects(result.projects);
      setTotal(result.total);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setProjects([]);
      setTotal(0);
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load your projects. Check your connection and try again.",
      );
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [debouncedQ, status, sort, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { projects, total, loading, error, reload: load };
}
