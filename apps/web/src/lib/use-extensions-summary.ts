"use client";

import { useEffect, useState } from "react";
import { extensionApi } from "@/lib/api";

/**
 * Dashboard-home extension counters (yours / installed / published). Fails
 * soft: null counts render as "…" and never block the dashboard.
 */
export function useExtensionsSummary() {
  const [yours, setYours] = useState<number | null>(null);
  const [installed, setInstalled] = useState<number | null>(null);
  const [published, setPublished] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    extensionApi.list().then((r) => alive && setYours(r.total ?? r.extensions.length)).catch(() => alive && setYours(0));
    extensionApi.installed().then((r) => alive && setInstalled(r.total ?? r.extensions.length)).catch(() => alive && setInstalled(0));
    extensionApi.listPublic().then((r) => alive && setPublished(r.total)).catch(() => alive && setPublished(0));
    return () => {
      alive = false;
    };
  }, []);

  return { yours, installed, published };
}
