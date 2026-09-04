"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hub, HubError, readableError, type Session } from "@/lib/hub-api";
import type { WorkspaceSummary } from "../../../../hub/src/contracts";

function useWorkspaceState() {
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const epoch = useRef(0);
  const summaryRead = useRef(0);
  const sessionRef = useRef(session); sessionRef.current = session;
  const controller = useRef<AbortController | null>(null);
  const logoutCsrf = useRef<string | null>(null);
  const mounted = useRef(true);
  const invalidate = useCallback((invitationRequired = false) => {
    epoch.current++; controller.current?.abort();
    summaryRead.current++; setLoading(false); setSummary(null); setUpdatedAt(null); setNotice(""); setError("");
    setSession(current => {
      const next = current ? { ...current, authenticated: false, accessDenied: invitationRequired, owner: undefined, csrfToken: undefined } : null;
      sessionRef.current = next; return next;
    });
  }, []);
  const refresh = useCallback(async () => {
    const currentEpoch = epoch.current;
    const read = ++summaryRead.current;
    try {
      const next = await hub<WorkspaceSummary>("/api/workspace/summary");
      if (mounted.current && currentEpoch === epoch.current && read === summaryRead.current) { setSummary(next); setUpdatedAt(new Date().toISOString()); setError(""); }
      return next;
    } catch (failure) {
      if (failure instanceof HubError && failure.status === 403) invalidate(true);
      else if (failure instanceof HubError && failure.status === 401) invalidate();
      throw failure;
    }
  }, [invalidate]);
  const load = useCallback(async () => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const currentEpoch = ++epoch.current; setLoading(true); setError(""); setSummary(null);
    try {
      const next = await hub<Session>("/api/session", { signal: abort.signal });
      if (!mounted.current || currentEpoch !== epoch.current) return;
      setSession(next);
      if (next.authenticated && next.privateBetaEnabled) {
        const data = await hub<WorkspaceSummary>("/api/workspace/summary", { signal: abort.signal });
        if (mounted.current && currentEpoch === epoch.current) { setSummary(data); setUpdatedAt(new Date().toISOString()); }
      }
    } catch (failure) {
      if (!abort.signal.aborted && currentEpoch === epoch.current) {
        if (failure instanceof HubError && failure.status === 403) invalidate(true);
        else if (failure instanceof HubError && failure.status === 401) invalidate();
        else setError(readableError(failure));
      }
    }
    finally { if (mounted.current && currentEpoch === epoch.current) setLoading(false); }
  }, [invalidate]);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; epoch.current++; controller.current?.abort(); }; }, [load]);
  useEffect(() => {
    if (!session?.authenticated || !session.privateBetaEnabled) return;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending || document.visibilityState !== "visible") return;
      const currentEpoch = epoch.current;
      pending = true;
      try { await refresh(); }
      catch (failure) { if (currentEpoch !== epoch.current) return; if (failure instanceof HubError && failure.status === 403) invalidate(true); else if (failure instanceof HubError && failure.status === 401) invalidate(); else if (mounted.current) setError("Connection interrupted. Displayed work may be out of date. Refresh before making a decision."); }
      finally { pending = false; }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [session?.authenticated, session?.privateBetaEnabled, refresh, invalidate]);
  const mutate = useCallback(async <T,>(path: string, body: unknown = {}): Promise<T> => {
    const currentEpoch = epoch.current;
    try {
      const result = await hub<T>(path, { method: "POST", body, csrf: sessionRef.current?.csrfToken });
      if (currentEpoch !== epoch.current || !mounted.current) throw new HubError("Your session changed. Sign in again to inspect the result.", 401);
      setRevision(value => value + 1);
      try { await refresh(); } catch (failure) { if (!(failure instanceof HubError && [401, 403].includes(failure.status))) setNotice("Saved, but the latest workspace could not load. Refresh to inspect the result; do not repeat the change."); }
      return result;
    } catch (failure) { if (failure instanceof HubError && failure.status === 401) invalidate(); throw failure; }
  }, [refresh, invalidate]);
  const logout = useCallback(async () => {
    if (logoutPending) return;
    const csrf = logoutCsrf.current || sessionRef.current?.csrfToken;
    logoutCsrf.current = csrf || null;
    invalidate(); setError("");
    setLogoutFailed(false); setLogoutPending(true);
    try { await hub("/api/auth/logout", { method: "POST", body: {}, csrf }); logoutCsrf.current = null; setLogoutPending(false); }
    catch { setLogoutPending(false); setLogoutFailed(true); setError("Local private data was cleared. Sign-out could not be confirmed; retry before leaving a shared computer."); }
  }, [invalidate, logoutPending]);
  const localLogin = useCallback(async () => {
    setError(""); setLoading(true);
    try { await hub("/api/auth/local", { method: "POST", body: {} }); await load(); }
    catch (failure) { setError(readableError(failure)); setLoading(false); }
  }, [load]);
  return { session, summary, loading, error, notice, revision, updatedAt, logoutPending, logoutFailed, refresh, load, mutate, logout, localLogin, invalidate, setError, setNotice };
}
const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) { const value = useWorkspaceState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error("Workspace provider required"); return value; }
