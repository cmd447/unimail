"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Short-lived GET cache — kills repeat Firestore round-trips on nav.
 *  Any non-GET api() call wipes it, so mutations always re-read fresh. */
const TTL_MS = 30_000;
const cache = new Map<string, { t: number; d: unknown }>();

export async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const isGet = !opts?.method || opts.method === "GET";

  if (isGet) {
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

  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    try {
      const d = await api<T>(path);
      if (seq.current === n) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (seq.current === n) setError(e instanceof Error ? e.message : "Failed");
    } finally {
      if (seq.current === n) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!pollMs) return;
    const iv = setInterval(reload, pollMs);
    return () => clearInterval(iv);
  }, [reload, pollMs]);

  return { data, error, loading, reload };
}
