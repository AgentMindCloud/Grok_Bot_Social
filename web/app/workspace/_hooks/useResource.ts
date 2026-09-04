"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { hub, HubError, readableError } from "@/lib/hub-api";
import type { Page } from "../../../../hub/src/contracts";
import { useWorkspace } from "./useWorkspace";

export function useResource<T>(path: string | null, poll = false) {
  const { invalidate, revision } = useWorkspace();
  const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(Boolean(path)), [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const lastPath = useRef<string | null>(null);
  const reload = useCallback(() => setReloadKey(value => value + 1), []);
  useEffect(() => {
    if (lastPath.current !== path) setData(null);
    lastPath.current = path;
    setError(""); if (!path) { setLoading(false); return; }
    let active = true, pending = false; const abort = new AbortController();
    const read = async () => {
      if (pending) return; pending = true; setLoading(true);
      try { const result = await hub<T>(path, { signal: abort.signal }); if (active) { setData(result); setError(""); } }
      catch (failure) { if (active) { setError(readableError(failure)); if (failure instanceof HubError && [401, 403, 404].includes(failure.status)) setData(null); if (failure instanceof HubError && failure.status === 401) invalidate(); } }
      finally { pending = false; if (active) setLoading(false); }
    };
    void read(); const timer = poll ? window.setInterval(() => { if (document.visibilityState === "visible") void read(); }, 15000) : undefined;
    return () => { active = false; abort.abort(); if (timer) window.clearInterval(timer); };
  }, [path, revision, reloadKey, invalidate, poll]);
  return { data, loading, error, reload };
}
export function usePages<T extends { id: string }>(path: string | null, poll = false) {
  const { invalidate, revision } = useWorkspace();
  const [items, setItems] = useState<T[]>([]), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(Boolean(path)), [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0); const generation = useRef(0); const pending = useRef(false); const controller = useRef<AbortController | null>(null);
  const reload = useCallback(() => setReloadKey(value => value + 1), []);
  const request = useCallback(async (next: string | null, append: boolean, current: number) => {
    if (!path || pending.current) return;
    pending.current = true; setLoading(true); setError(""); const abort = new AbortController(); controller.current = abort;
    try {
      const result = await hub<Page<T>>(path + (path.includes("?") ? "&" : "?") + "limit=20" + (next ? "&cursor=" + encodeURIComponent(next) : ""), { signal: abort.signal });
      if (current !== generation.current) return;
      setItems(old => append ? [...old, ...result.items.filter(item => !old.some(existing => existing.id === item.id))] : result.items); setCursor(result.nextCursor);
    } catch (failure) { if (current === generation.current && !abort.signal.aborted) { setError(readableError(failure)); if (failure instanceof HubError && [401, 403, 404].includes(failure.status)) { setItems([]); setCursor(null); } if (failure instanceof HubError && failure.status === 401) invalidate(); } }
    finally { if (current === generation.current) { pending.current = false; setLoading(false); } }
  }, [path, invalidate]);
  useEffect(() => {
    controller.current?.abort(); const current = ++generation.current; pending.current = false; setItems([]); setCursor(null); setError("");
    if (path) void request(null, false, current); else setLoading(false);
    const timer = path && poll ? window.setInterval(() => { if (document.visibilityState === "visible") void request(null, false, current); }, 15000) : undefined;
    return () => { generation.current++; controller.current?.abort(); pending.current = false; if (timer) window.clearInterval(timer); };
  }, [path, revision, reloadKey, request, poll]);
  return { items, loading, error, more: cursor !== null, reload, loadMore: () => { if (cursor) void request(cursor, true, generation.current); } };
}
