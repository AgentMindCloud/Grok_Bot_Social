"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Github,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Modal from "@/components/Modal";
import { authStatusMessage } from "@/components/SignInPanel";
import { GlassButton, GlassLink } from "@/components/GlassControl";
import {
  API_ORIGIN,
  hub,
  HubError,
  readableError,
  type Session,
} from "@/lib/hub-api";
import type { Account } from "../../../../hub/src/contracts";
import { useWorkspace } from "../_hooks/useWorkspace";

type Provider = "github" | "x";
const providerName = (provider: Provider) =>
  provider === "github" ? "GitHub" : "X";
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const bytesLabel = (value: number) =>
  `${(value / (1024 * 1024)).toLocaleString("en", { maximumFractionDigits: 1 })} MiB`;

export default function AccountPanel() {
  const workspace = useWorkspace();
  const { session, revision, invalidate } = workspace;
  const ownerId = session?.owner?.id;
  const activeOwner = useRef(ownerId);
  activeOwner.current = ownerId;
  const mounted = useRef(true),
    inFlight = useRef(false);
  const [data, setData] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const [authFlowMessage, setAuthFlowMessage] = useState("");
  useEffect(() => {
    setAuthFlowMessage(
      authStatusMessage(
        new URLSearchParams(window.location.search).get("auth"),
      ),
    );
  }, [ownerId]);
  const [removeProvider, setRemoveProvider] = useState<Provider | null>(null);
  const [closeOpen, setCloseOpen] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const [closeUncertain, setCloseUncertain] = useState(false);
  const account = data?.owner.id === ownerId ? data : null;
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setData(null);
    setError("");
    setNotice("");
    setConfirmation("");
    setCloseOpen(false);
    setCloseUncertain(false);
    setRemoveProvider(null);
    setReauthNeeded(false);
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId || !session?.authenticated) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    let active = true;
    setLoading(true);
    void hub<Account>("/api/account", { signal: abort.signal })
      .then((next) => {
        if (!active || activeOwner.current !== ownerId) return;
        if (next.owner.id !== ownerId) {
          invalidate();
          return;
        }
        setData(next);
        setError("");
        setReauthNeeded(
          Date.now() - new Date(next.authenticatedAt).getTime() > 600000,
        );
      })
      .catch((failure) => {
        if (!active || abort.signal.aborted || activeOwner.current !== ownerId)
          return;
        if (failure instanceof HubError && [401, 403].includes(failure.status))
          invalidate(failure.status === 403);
        else setError(readableError(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [ownerId, session?.authenticated, revision, reloadKey, invalidate]);
  const recent = () =>
    account &&
    Date.now() - new Date(account.authenticatedAt).getTime() <= 600000;
  const ensureRecent = () => {
    if (recent()) return true;
    setReauthNeeded(true);
    setError(
      "Verify a linked sign-in method below, then return to this account action.",
    );
    return false;
  };
  const identityAction = async (
    provider: Provider,
    action: "link" | "reauth" | "unlink",
  ) => {
    if (inFlight.current || !ownerId || !account) return;
    if (action !== "reauth" && !ensureRecent()) return;
    const requestOwner = ownerId;
    inFlight.current = true;
    setBusy(`${action}:${provider}`);
    setError("");
    setNotice("");
    try {
      const path =
        action === "reauth"
          ? `/api/account/reauth/${provider}`
          : `/api/account/identities/${provider}${action === "link" ? "/link" : ""}`;
      const result = await hub<{ url?: string }>(path, {
        method: action === "unlink" ? "DELETE" : "POST",
        body: {},
        csrf: session?.csrfToken,
      });
      if (!mounted.current || activeOwner.current !== requestOwner) return;
      if (action === "unlink") {
        setRemoveProvider(null);
        setNotice(
          `${providerName(provider)} was removed from this workspace. Other sessions were signed out.`,
        );
        reload();
      } else if (result.url) {
        const destination = new URL(result.url);
        const expectedHost = provider === "github" ? "github.com" : "x.com";
        if (
          destination.protocol !== "https:" ||
          destination.hostname !== expectedHost
        )
          throw new Error("Unexpected identity destination");
        window.location.assign(destination.href);
      } else throw new Error("Identity destination unavailable");
    } catch (failure) {
      if (!mounted.current || activeOwner.current !== requestOwner) return;
      if (failure instanceof HubError && failure.status === 401) invalidate();
      else {
        setError(readableError(failure));
        if (failure instanceof HubError && failure.status === 403)
          setReauthNeeded(true);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current && activeOwner.current === requestOwner) setBusy("");
    }
  };
  const closeAccount = async () => {
    if (
      inFlight.current ||
      !ownerId ||
      confirmation !== "CLOSE MY ACCOUNT" ||
      closeUncertain ||
      !ensureRecent()
    )
      return;
    const requestOwner = ownerId;
    inFlight.current = true;
    setBusy("close");
    setError("");
    try {
      const result = await hub<{ closed: boolean; liveContentPurged: boolean }>(
        "/api/account/close",
        { method: "POST", body: { confirmation }, csrf: session?.csrfToken },
      );
      if (!mounted.current || activeOwner.current !== requestOwner) return;
      if (!result.closed || !result.liveContentPurged)
        throw new Error("Closure not confirmed");
      invalidate();
      window.location.assign("/workspace/?account=closed");
    } catch (failure) {
      if (!mounted.current || activeOwner.current !== requestOwner) return;
      setError(readableError(failure));
      if (failure instanceof HubError && failure.status === 403)
        setReauthNeeded(true);
      else if (!(failure instanceof HubError && failure.status === 400))
        setCloseUncertain(true);
    } finally {
      inFlight.current = false;
      if (mounted.current && activeOwner.current === requestOwner) setBusy("");
    }
  };
  const checkClosure = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("check-close");
    try {
      const current = await hub<Session>("/api/session");
      if (!mounted.current) return;
      if (!current.authenticated || current.owner?.id !== ownerId) {
        invalidate();
        window.location.assign("/workspace/?account=closure-unconfirmed");
        return;
      }
      const latest = await hub<Account>("/api/account");
      if (!mounted.current || latest.owner.id !== activeOwner.current) return;
      setData(latest);
      setCloseUncertain(false);
      setError("");
      setNotice(
        "This account is still accessible. You can review the closure request before trying again.",
      );
    } catch (failure) {
      if (mounted.current) setError(readableError(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy("");
    }
  };
  if (!ownerId) return null;
  return (
    <div className="account-panel">
      <header className="account-intro">
        <span className="account-icon">
          <ShieldCheck size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="account-eyebrow">ACCOUNT & ACCESS</p>
          <h2>Your workspace. Your permissions.</h2>
          <p>
            Manage sign-in methods, review the free limits and take your private
            research with you.
          </p>
        </div>
        <GlassButton
          variant="quiet"
          onClick={reload}
          disabled={loading || !!busy}
          aria-label="Refresh account details"
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </GlassButton>
      </header>
      {authFlowMessage && (
        <div className="account-callout" role="status">
          <span>{authFlowMessage}</span>
          <button
            className="account-text-button"
            type="button"
            onClick={() => {
              setAuthFlowMessage("");
              const url = new URL(window.location.href);
              url.searchParams.delete("auth");
              window.history.replaceState(null, "", url.pathname + url.search);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="account-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="account-notice" role="status">
          {notice}
        </div>
      )}
      {loading && !account && (
        <p className="account-muted" role="status">
          Loading your account and current limits…
        </p>
      )}
      {account && (
        <>
          <section
            className="account-surface"
            aria-labelledby="account-sign-in"
          >
            <div className="account-section-heading">
              <KeyRound size={22} aria-hidden="true" />
              <div>
                <h3 id="account-sign-in">Your sign-in methods</h3>
                <p>
                  Signed in as <strong>{account.owner.displayName}</strong> · @
                  {account.owner.handle}
                </p>
              </div>
            </div>
            <p className="account-muted">
              Add GitHub so you can access this same workspace if X sign-in is
              unavailable. An unlinked provider opens a separate account;
              matching names do not join accounts.
            </p>
            {reauthNeeded && (
              <p className="account-callout">
                <LockKeyhole size={18} aria-hidden="true" /> Account access
                changes require a fresh sign-in. Use Verify on a linked
                provider, then return here.
              </p>
            )}
            <div className="account-providers">
              {(["x", "github"] as const).map((provider) => {
                const linked = account.providers.find(
                  (p) => p.provider === provider,
                );
                const enabled =
                  provider === "github"
                    ? account.githubLoginEnabled
                    : account.xLoginEnabled;
                return (
                  <article className="account-provider" key={provider}>
                    <div className="account-provider-title">
                      {provider === "github" ? (
                        <Github size={23} aria-hidden="true" />
                      ) : (
                        <span className="provider-x" aria-hidden="true">
                          𝕏
                        </span>
                      )}
                      <h4>{providerName(provider)}</h4>
                      {linked && (
                        <span className="account-linked">
                          <Check size={13} aria-hidden="true" /> Linked
                        </span>
                      )}
                    </div>
                    <p>
                      {linked
                        ? `@${linked.handle}`
                        : `Add ${providerName(provider)} to this workspace.`}
                    </p>
                    {linked && (
                      <p className="account-small">
                        Linked {dateLabel(linked.linkedAt)}
                      </p>
                    )}
                    {!enabled && (
                      <p className="account-small">
                        {providerName(provider)} sign-in is currently
                        unavailable. Your existing workspace session can
                        continue.
                      </p>
                    )}
                    <div className="account-actions">
                      {linked ? (
                        <>
                          <GlassButton
                            variant="quiet"
                            onClick={() =>
                              void identityAction(provider, "reauth")
                            }
                            disabled={!!busy || !enabled}
                          >
                            {busy === `reauth:${provider}`
                              ? "Opening verification…"
                              : `Verify with ${providerName(provider)}`}
                          </GlassButton>
                          <button
                            className="account-text-button"
                            disabled={!!busy || account.providers.length <= 1}
                            onClick={() => {
                              if (ensureRecent()) {
                                setRemoveProvider(provider);
                                setError("");
                              }
                            }}
                          >
                            Remove {providerName(provider)}
                          </button>
                        </>
                      ) : (
                        <GlassButton
                          variant="quiet"
                          onClick={() => void identityAction(provider, "link")}
                          disabled={!!busy || !enabled}
                        >
                          {busy === `link:${provider}`
                            ? "Opening approval…"
                            : `Add ${providerName(provider)}`}
                        </GlassButton>
                      )}
                    </div>
                    {linked && account.providers.length === 1 && (
                      <p className="account-small">
                        Keep this sign-in method until another is linked.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
            {account.authProvider === "local" && (
              <p className="account-callout">
                This is a local developer account. It is not an external owner
                acceptance result.
              </p>
            )}
          </section>
          {account.usage && (
            <section
              className="account-surface"
              aria-labelledby="account-limits"
            >
              <div className="account-section-heading">
                <ShieldCheck size={22} aria-hidden="true" />
                <div>
                  <h3 id="account-limits">Free access, bounded work</h3>
                  <p>These limits come from the workspace service.</p>
                </div>
              </div>
              <dl className="account-limits">
                <div>
                  <dt>Connected Bots</dt>
                  <dd>
                    {account.usage.used.connectedBots}
                    <span> / {account.usage.limits.botsPerOwner}</span>
                  </dd>
                </div>
                <div>
                  <dt>Active missions</dt>
                  <dd>
                    {account.usage.used.activeMissions}
                    <span>
                      {" "}
                      / {account.usage.limits.activeMissionsPerOwner}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>New missions · rolling 24 hours</dt>
                  <dd>
                    {account.usage.used.newMissionsToday}
                    <span> / {account.usage.limits.newMissionsPerDay}</span>
                  </dd>
                </div>
                <div>
                  <dt>Research storage</dt>
                  <dd>
                    {bytesLabel(account.usage.used.researchBytes)}
                    <span>
                      {" "}
                      / {bytesLabel(account.usage.limits.researchBytesPerOwner)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Joined circles</dt>
                  <dd>
                    {account.usage.used.joinedCircles}
                    <span> / {account.usage.limits.circlesPerOwner}</span>
                  </dd>
                </div>
                <div>
                  <dt>Members per circle</dt>
                  <dd>
                    {account.usage.limits.membersPerCircle}
                    <span> maximum</span>
                  </dd>
                </div>
              </dl>
              <p className="account-small">
                {bytesLabel(account.usage.used.reservedResearchBytes)} is
                reserved for accepted research results. Storage includes service
                accounting overhead. Shared research capacity can temporarily
                pause new work.
              </p>
              <p className="account-small">
                Observed {dateLabel(account.usage.observedAt)}.{" "}
                {account.usage.oldestMissionWindowExpiresAt
                  ? `The oldest mission in your daily window expires ${dateLabel(account.usage.oldestMissionWindowExpiresAt)}; each mission ages out separately.`
                  : "The daily limit uses a rolling 24-hour window, not a midnight reset."}
              </p>
              {!account.usage.limits.admissionsEnabled && (
                <p className="account-callout">
                  New work is temporarily paused. Existing work, account access
                  and recovery remain available.
                </p>
              )}
            </section>
          )}
          <section className="account-surface" aria-labelledby="account-data">
            <div className="account-section-heading">
              <Download size={22} aria-hidden="true" />
              <div>
                <h3 id="account-data">Your research, in your hands</h3>
                <p>
                  Download your profile, mission history, findings and decisions
                  as NDJSON.
                </p>
              </div>
            </div>
            <p className="account-muted">
              The export checks current access as it streams. It excludes
              session tokens, connection secrets and circle content you can no
              longer access. Keep your downloaded copy private.
            </p>
            <GlassLink
              variant="quiet"
              href={`${API_ORIGIN}/api/account/export`}
              download="Bottocks-account.ndjson"
            >
              <Download size={17} aria-hidden="true" /> Download private export
            </GlassLink>
            <p className="account-small">
              Your browser handles the download directly. The page does not copy
              private research into browser storage.
            </p>
          </section>
          <section
            className="account-surface account-close"
            aria-labelledby="account-close"
          >
            <div>
              <h3 id="account-close">Close your account</h3>
              <p>
                Revoke access, disconnect your Bots and remove your live private
                content. This cannot be undone from the workspace.
              </p>
              <p className="account-small">
                Previously retained copies held by other people are outside this
                workspace. Encrypted backups follow the current{" "}
                <a href="/privacy/">published retention policy</a>.
              </p>
            </div>
            <GlassButton
              variant="danger"
              disabled={!!busy}
              onClick={() => {
                if (ensureRecent()) {
                  setCloseOpen(true);
                  setError("");
                }
              }}
            >
              Close account…
            </GlassButton>
          </section>
          <footer className="account-help">
            <LifeBuoy size={19} aria-hidden="true" />
            <p>
              Account or connection problem? <a href="/help/">Help & setup</a>.
              Never send Bot tokens or session credentials.
            </p>
          </footer>
        </>
      )}
      {removeProvider && (
        <Modal
          title={`Remove ${providerName(removeProvider)}?`}
          busy={!!busy}
          onClose={() => setRemoveProvider(null)}
        >
          <div className="account-dialog">
            <p>
              You will need{" "}
              {account?.providers
                .filter((p) => p.provider !== removeProvider)
                .map((p) => providerName(p.provider))
                .join(" or ")}{" "}
              to sign in to this workspace. Other active sessions will be signed
              out.
            </p>
            {error && (
              <p className="account-error" role="alert">
                {error}
              </p>
            )}
            <div className="account-actions">
              <GlassButton
                variant="quiet"
                disabled={!!busy}
                onClick={() => setRemoveProvider(null)}
              >
                Keep it linked
              </GlassButton>
              <GlassButton
                variant="danger"
                disabled={!!busy}
                onClick={() => void identityAction(removeProvider, "unlink")}
              >
                {busy ? "Removing…" : `Remove ${providerName(removeProvider)}`}
              </GlassButton>
            </div>
          </div>
        </Modal>
      )}
      {closeOpen && (
        <Modal
          title="Close this workspace account?"
          busy={!!busy}
          onClose={() => setCloseOpen(false)}
        >
          <div className="account-dialog">
            <p>
              This immediately revokes sign-in sessions and Bot access, ends
              affected research, and removes your live owned content. Export
              anything you want to keep first.
            </p>
            <label htmlFor="account-close-confirmation">
              Type <strong>CLOSE MY ACCOUNT</strong>
              <input
                id="account-close-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={!!busy}
              />
            </label>
            {error && (
              <p className="account-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="account-notice" role="status">
                {notice}
              </p>
            )}
            {closeUncertain && (
              <p className="account-callout">
                The result is uncertain. Check current access before repeating
                this request.
              </p>
            )}
            <div className="account-actions">
              <GlassButton
                variant="quiet"
                disabled={!!busy}
                onClick={() => setCloseOpen(false)}
              >
                Keep account
              </GlassButton>
              {closeUncertain ? (
                <GlassButton
                  variant="quiet"
                  disabled={!!busy}
                  onClick={() => void checkClosure()}
                >
                  {busy ? "Checking…" : "Check account access"}
                </GlassButton>
              ) : (
                <GlassButton
                  variant="danger"
                  disabled={!!busy || confirmation !== "CLOSE MY ACCOUNT"}
                  onClick={() => void closeAccount()}
                >
                  {busy ? "Closing account…" : "Close and remove live content"}
                </GlassButton>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export { AccountPanel };
