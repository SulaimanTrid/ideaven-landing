"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Snapshot undo/redo for editor state. Each committed change becomes exactly
 * one history entry, so an entire operation (even a future grouped AI action)
 * reverts atomically.
 */
export function useHistory<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const [version, setVersion] = useState(0); // re-render signal for canUndo/canRedo

  /** Commit replaces the present with a new snapshot. */
  const commit = useCallback((next: T) => {
    setPresent((current) => {
      pastRef.current = [...pastRef.current.slice(-99), current];
      futureRef.current = [];
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  /** Replace the present without touching history (e.g. after a load). */
  const reset = useCallback((next: T) => {
    pastRef.current = [];
    futureRef.current = [];
    setPresent(next);
    setVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    setPresent((current) => {
      const previous = pastRef.current.at(-1);
      if (previous === undefined) return current;
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [current, ...futureRef.current];
      return previous;
    });
    setVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    setPresent((current) => {
      const next = futureRef.current[0];
      if (next === undefined) return current;
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current, current];
      return next;
    });
    setVersion((v) => v + 1);
  }, []);

  return useMemo(
    () => ({
      state: present,
      commit,
      reset,
      undo,
      redo,
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      /** Bumped on every history mutation so consumers re-derive flags. */
      version,
    }),
    [present, commit, reset, undo, redo, version],
  );
}
