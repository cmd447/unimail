"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Short-lived GET cache — kills repeat Firestore round-trips on nav.
 *  Any non-GET api() call wipes it, so mutations always re-read fresh. */
const TTL_MS = 30_000;
const cache = new Map<string, { t: number; d: unknown }>();

export async function api<T = any>(path: string, opts?: RequestInit, fresh = false): Promise<T> {
  const isGet = !opts?.method || opts.method === "GET";

  if (isGet && !fresh) {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.t < TTL_MS) return hit.d as T;
  }

  const r = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);

  if (isGet) cache.set(path, { t: Date.now(), d });
  else cache.clear();

  return d as T;
}

/** JSON GET hook with optional polling (ms). */
export function useFetch<T = any>(path: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(
    async (fresh: boolean) => {
      if (!path) return;
      const n = ++seq.current;
      try {
        const d = await api<T>(path, undefined, fresh);
        if (seq.current === n) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (seq.current === n) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (seq.current === n) setLoading(false);
      }
    },
    [path],
  );

  // manual refresh + polls always bypass the 30s GET cache —
  // first paint still uses it so warm navigations stay instant
  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    setLoading(true);
    void load(false);
    if (!pollMs) return;
    const iv = setInterval(() => void load(true), pollMs);
    return () => clearInterval(iv);
  }, [load, pollMs]);

  return { data, error, loading, reload };
}
