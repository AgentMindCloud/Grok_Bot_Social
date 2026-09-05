"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { hub, HubError, readableError, type Session } from "@/lib/hub-api";
import type { WorkspaceSummary } from "../../../../hub/src/contracts";

function useWorkspaceState() {
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const epoch = useRef(0),
    summaryRead = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const controller = useRef<AbortController | null>(null);
  const logoutCsrf = useRef<string | null>(null);
  const logoutInFlight = useRef(false);
  const mounted = useRef(true);
  const workspaceEnabled =
    session?.workspaceEnabled ?? session?.privateBetaEnabled ?? false;
  const accessMessage = session?.accessDenied
    ? "This account cannot access the workspace right now. It may be suspended, closed or outside the current access policy. Contact info@grokbotsocial.com for help."
    : "";
  const invalidate = useCallback((accessDenied = false) => {
    epoch.current++;
    controller.current?.abort();
    summaryRead.current++;
    setLoading(false);
    setRefreshing(false);
    setSummary(null);
    setUpdatedAt(null);
    setNotice("");
    setError("");
    const current = sessionRef.current;
    const next = current
      ? {
          ...current,
          authenticated: false,
          accessDenied,
          owner: undefined,
          csrfToken: undefined,
        }
      : null;
    sessionRef.current = next;
    setSession(next);
  }, []);
  const refresh = useCallback(async () => {
    const currentEpoch = epoch.current,
      currentOwner = sessionRef.current?.owner?.id;
    const read = ++summaryRead.current;
    try {
      const next = await hub<WorkspaceSummary>("/api/workspace/summary");
      if (currentEpoch !== epoch.current || !mounted.current) return next;
      if (currentOwner && next.owner.id !== currentOwner) {
        invalidate();
        throw new HubError(
          "Your signed-in account changed. Sign in again to open the correct workspace.",
          401,
        );
      }
      if (read === summaryRead.current) {
        setSummary(next);
        setUpdatedAt(new Date().toISOString());
        setError("");
      }
      return next;
    } catch (failure) {
      if (currentEpoch === epoch.current && mounted.current) {
        if (failure instanceof HubError && failure.status === 403)
          invalidate(true);
        else if (failure instanceof HubError && failure.status === 401)
          invalidate();
      }
      throw failure;
    }
  }, [invalidate]);
  const load = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const currentEpoch = ++epoch.current;
    summaryRead.current++;
    setLoading(!summaryRef.current);
    setRefreshing(!!summaryRef.current);
    setError("");
    // Keep the current owner's rendered content while a recoverable refresh runs.
    // A confirmed account change or access failure clears it before any new data appears.
    try {
      const next = await hub<Session>("/api/session", { signal: abort.signal });
      if (!mounted.current || currentEpoch !== epoch.current) return;
      const sameOwner =
        next.authenticated && next.owner?.id === sessionRef.current?.owner?.id;
      if (!sameOwner) {
        setSummary(null);
        setUpdatedAt(null);
        setNotice("");
      }
      sessionRef.current = next;
      setSession(next);
      if (
        next.authenticated &&
        (next.workspaceEnabled ?? next.privateBetaEnabled)
      ) {
        const data = await hub<WorkspaceSummary>("/api/workspace/summary", {
          signal: abort.signal,
        });
        if (mounted.current && currentEpoch === epoch.current) {
          if (data.owner.id !== next.owner?.id) {
            invalidate();
            setError(
              "Your account changed during loading. Sign in again to continue.",
            );
            return;
          }
          setSummary(data);
          setUpdatedAt(new Date().toISOString());
        }
      }
    } catch (failure) {
      if (
        !abort.signal.aborted &&
        currentEpoch === epoch.current &&
        mounted.current
      ) {
        if (failure instanceof HubError && failure.status === 403)
          invalidate(true);
        else if (failure instanceof HubError && failure.status === 401)
          invalidate();
        else setError(readableError(failure));
      }
    } finally {
      if (mounted.current && currentEpoch === epoch.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [invalidate]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      epoch.current++;
      controller.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!session?.authenticated || !workspaceEnabled) return;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending || document.visibilityState !== "visible") return;
      const currentEpoch = epoch.current;
      pending = true;
      try {
        await refresh();
      } catch (failure) {
        if (currentEpoch !== epoch.current || !mounted.current) return;
        if (
          !(failure instanceof HubError && [401, 403].includes(failure.status))
        )
          setError(
            "Connection interrupted. Displayed work may be out of date. Your open form is preserved; refresh before making a decision.",
          );
      } finally {
        pending = false;
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [session?.authenticated, workspaceEnabled, refresh]);
  const mutate = useCallback(
    async <T,>(
      path: string,
      body: unknown = {},
      method: "POST" | "DELETE" = "POST",
    ): Promise<T> => {
      const currentEpoch = epoch.current;
      try {
        const result = await hub<T>(path, {
          method,
          body,
          csrf: sessionRef.current?.csrfToken,
        });
        if (currentEpoch !== epoch.current || !mounted.current)
          throw new HubError(
            "Your session changed. Sign in again to inspect the result before repeating the change.",
            401,
          );
        setRevision((value) => value + 1);
        try {
          await refresh();
        } catch (failure) {
          if (
            currentEpoch === epoch.current &&
            !(
              failure instanceof HubError && [401, 403].includes(failure.status)
            )
          )
            setNotice(
              "Saved, but the latest workspace could not load. Refresh to inspect the result; do not repeat the change.",
            );
        }
        return result;
      } catch (failure) {
        if (
          currentEpoch === epoch.current &&
          failure instanceof HubError &&
          failure.status === 401
        )
          invalidate();
        throw failure;
      }
    },
    [refresh, invalidate],
  );
  const logout = useCallback(async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    const csrf = logoutCsrf.current || sessionRef.current?.csrfToken;
    logoutCsrf.current = csrf || null;
    invalidate();
    setError("");
    setLogoutFailed(false);
    setLogoutPending(true);
    try {
      await hub("/api/auth/logout", { method: "POST", body: {}, csrf });
      logoutCsrf.current = null;
      if (mounted.current) setLogoutPending(false);
    } catch {
      if (mounted.current) {
        setLogoutPending(false);
        setLogoutFailed(true);
        setError(
          "Private data was cleared from this page. Sign-out could not be confirmed; retry before leaving a shared computer.",
        );
      }
    } finally {
      logoutInFlight.current = false;
    }
  }, [invalidate]);
  const localLogin = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await hub("/api/auth/local", { method: "POST", body: {} });
      await load();
    } catch (failure) {
      if (mounted.current) {
        setError(readableError(failure));
        setLoading(false);
      }
    }
  }, [load]);
  return {
    session,
    summary,
    loading,
    refreshing,
    workspaceEnabled,
    accessMessage,
    error,
    notice,
    revision,
    updatedAt,
    logoutPending,
    logoutFailed,
    refresh,
    load,
    mutate,
    logout,
    localLogin,
    invalidate,
    setError,
    setNotice,
  };
}
const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(
  null,
);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider required");
  return value;
}
