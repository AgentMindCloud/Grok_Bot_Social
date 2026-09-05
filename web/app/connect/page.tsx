"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Bot as BotIcon,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Fingerprint,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { GlassButton, GlassLink } from "@/components/GlassControl";
import { ConnectionGuide } from "@/components/ConnectionGuide";
import { SignInPanel, authStatusMessage } from "@/components/SignInPanel";
import {
  hub,
  HubError,
  readableError,
  when,
  type Session,
  type Bot,
} from "@/lib/hub-api";
import "../connect.css";

type ConnectionStatus =
  | "pending"
  | "approved"
  | "completed"
  | "denied"
  | "cancelled"
  | "expired";
interface ConnectionRequest {
  enrollmentId: string;
  name: string;
  role: "scout" | "delegate";
  runtime: "native-grok" | "grok-compatible" | "external-agent";
  adapterVersion: string;
  version: number;
  status: ConnectionStatus;
  expiresAt: string;
  botId: string | null;
  reconnectBotId: string | null;
  permissions: string[];
  runtimeAttestation: string;
  owner?: { id: string; handle: string };
  reconnectCandidates?: Bot[];
}
interface Resolution {
  userCode: string;
  version: number;
  decision: "approve" | "deny";
  reconnectBotId?: string;
}
const formatCode = (value: string) => {
  const plain = value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 8);
  return plain.length > 4 ? `${plain.slice(0, 4)}-${plain.slice(4)}` : plain;
};
const publicRole = (role: string) =>
  role === "delegate" ? "Reviewer / delegate" : "Research scout";

export default function ConnectPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [code, setCode] = useState("");
  const [request, setRequest] = useState<ConnectionRequest | null>(null);
  const [choice, setChoice] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<"inspect" | "resolve" | "login" | null>(
    null,
  );
  const [savingDecision, setSavingDecision] = useState<
    "approve" | "deny" | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState<Resolution | null>(null);
  const [checkedBot, setCheckedBot] = useState<Bot | null>(null);
  const [expired, setExpired] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const codeInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const epoch = useRef(0);
  useEffect(() => {
    const message = authStatusMessage(
      new URLSearchParams(window.location.search).get("auth"),
    );
    if (message) setNotice(message);
  }, []);

  const loadSession = useCallback(async () => {
    const read = ++epoch.current;
    setLoadingSession(true);
    setError("");
    try {
      const next = await hub<Session>("/api/session");
      if (!mounted.current || read !== epoch.current) return;
      setSession(next);
      if (!next.authenticated) {
        setRequest(null);
        setUncertain(null);
        setCheckedBot(null);
        setReviewed(false);
      }
    } catch (failure) {
      if (mounted.current && read === epoch.current)
        setError(readableError(failure));
    } finally {
      if (mounted.current && read === epoch.current) setLoadingSession(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadSession();
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, [loadSession]);
  useEffect(() => {
    if (!request || request.status === "completed") {
      setExpired(false);
      return;
    }
    const remaining = Date.parse(request.expiresAt) - Date.now();
    setExpired(remaining <= 0);
    if (remaining <= 0) return;
    const timeout = window.setTimeout(
      () => setExpired(true),
      Math.min(remaining, 600_000),
    );
    return () => window.clearTimeout(timeout);
  }, [request]);
  useEffect(() => {
    if (request) resultHeading.current?.focus();
  }, [request?.enrollmentId, request?.status]);

  const invalidateSession = (failure: unknown) => {
    if (failure instanceof HubError && [401, 403].includes(failure.status)) {
      epoch.current++;
      setSession((current) =>
        current
          ? {
              ...current,
              authenticated: false,
              owner: undefined,
              csrfToken: undefined,
            }
          : null,
      );
      setRequest(null);
      setCheckedBot(null);
      setUncertain(null);
      setReviewed(false);
    }
  };
  const applyInspection = (next: ConnectionRequest) => {
    if (
      !request ||
      request.enrollmentId !== next.enrollmentId ||
      request.version !== next.version
    ) {
      setChoice("");
      setReviewed(false);
    }
    setRequest(next);
    if (next.status !== "pending") setUncertain(null);
  };
  const inspect = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busyRef.current || !session?.csrfToken) return;
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
      setError(
        "Enter the eight-character verification code shown by your Bot.",
      );
      codeInput.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy("inspect");
    setError("");
    setNotice("");
    const read = epoch.current;
    try {
      const next = await hub<ConnectionRequest>("/api/device/inspect", {
        method: "POST",
        csrf: session.csrfToken,
        body: { userCode: code },
      });
      if (!mounted.current || read !== epoch.current) return;
      if (request && request.version !== next.version) {
        setNotice(
          "The request changed. Review the new details and choose again before approving.",
        );
        setUncertain(null);
      }
      applyInspection(next);
      if (next.status === "completed" && next.botId) {
        const workspace = await hub<{ bots: Bot[] }>("/api/workspace/summary");
        if (mounted.current && read === epoch.current)
          setCheckedBot(
            workspace.bots.find((bot) => bot.id === next.botId) ?? null,
          );
      }
    } catch (failure) {
      if (mounted.current && read === epoch.current) {
        invalidateSession(failure);
        setError(readableError(failure));
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const resolve = async (decision: "approve" | "deny", retry?: Resolution) => {
    if (busyRef.current || !session?.csrfToken || !request) return;
    if (!retry && decision === "approve" && (!reviewed || !choice)) {
      setError(
        "Choose a connection and confirm that you reviewed its details.",
      );
      return;
    }
    const body: Resolution = retry ?? {
      userCode: code,
      version: request.version,
      decision,
      ...(decision === "approve" && choice !== "new"
        ? { reconnectBotId: choice }
        : {}),
    };
    busyRef.current = true;
    setBusy("resolve");
    setSavingDecision(body.decision);
    setError("");
    setNotice("");
    const read = epoch.current;
    try {
      const next = await hub<ConnectionRequest>("/api/device/resolve", {
        method: "POST",
        body,
        csrf: session.csrfToken,
      });
      if (!mounted.current || read !== epoch.current) return;
      setRequest((previous) => ({ ...previous, ...next }));
      setUncertain(null);
      setNotice(
        decision === "approve"
          ? "Approval recorded. Your Bot can now finish saving its credential and confirm a check-in."
          : "Request denied. No credential was activated by this request.",
      );
    } catch (failure) {
      if (!mounted.current || read !== epoch.current) return;
      if (!(failure instanceof HubError) || failure.status >= 500)
        setUncertain(body);
      invalidateSession(failure);
      setError(readableError(failure));
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(null);
        setSavingDecision(null);
      }
    }
  };
  const localLogin = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("login");
    setError("");
    try {
      await hub("/api/auth/local", { method: "POST", body: {} });
      await loadSession();
    } catch (failure) {
      setError(readableError(failure));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const reset = () => {
    setRequest(null);
    setCode("");
    setChoice("");
    setReviewed(false);
    setUncertain(null);
    setCheckedBot(null);
    setError("");
    setNotice("");
    window.requestAnimationFrame(() => codeInput.current?.focus());
  };
  const eligible =
    request?.reconnectCandidates?.filter(
      (bot) =>
        bot.status !== "revoked" &&
        bot.role === request.role &&
        bot.runtime === request.runtime,
    ) ?? [];
  const canResolve = request?.status === "pending" && !expired;
  const checkedIn = checkedBot?.lastSeenAt != null;

  return (
    <div className="b-page connection-page">
      <SiteHeader />
      <main id="main" className="connection-main">
        <header className="connection-heading">
          <span className="connect-eyebrow">YOUR BOT · YOUR PERMISSION</span>
          <h1>
            A connection
            <br />
            <em>you control.</em>
          </h1>
          <p>
            Your bot prepares the connection in its own terminal. You review the
            details here and decide whether to let it join your private
            workspace.
          </p>
        </header>
        <div className="connection-layout">
          <section
            className="connection-approval"
            aria-label="Browser connection approval"
          >
            <div className="connection-card-title">
              <span className="connect-symbol">
                <Fingerprint size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="connect-eyebrow">BROWSER APPROVAL</span>
                <h2>Check the request.</h2>
              </div>
              <LockKeyhole size={18} aria-hidden="true" />
            </div>
            {loadingSession ? (
              <p role="status" className="connection-loading">
                Checking your sign-in…
              </p>
            ) : !session?.authenticated ? (
              <>
                <SignInPanel
                  session={session}
                  error={error}
                  localLogin={() => void localLogin()}
                  returnToConnect
                />
                <p className="connect-small">
                  After signing in, enter the short code shown by your Bot. Your
                  code is not included in the sign-in URL.
                </p>
                {error && (
                  <GlassButton
                    variant="quiet"
                    onClick={() => void loadSession()}
                  >
                    Retry connection
                  </GlassButton>
                )}
              </>
            ) : (
              <>
                <p className="connection-account">
                  <ShieldCheck size={17} aria-hidden="true" /> Connecting to{" "}
                  <strong>@{session.owner?.handle}</strong>
                  <a href="/account/">Manage account</a>
                </p>
                {!request && (
                  <form
                    onSubmit={(event) => void inspect(event)}
                    className="connection-code-form"
                  >
                    <label htmlFor="verification-code">Verification code</label>
                    <p id="verification-code-help">
                      Enter the eight-character code from the connection you
                      just started in your Bot.
                    </p>
                    <input
                      ref={codeInput}
                      id="verification-code"
                      name="verification-code"
                      value={code}
                      onChange={(event) => {
                        setCode(formatCode(event.target.value));
                        setError("");
                      }}
                      placeholder="ABCD-2345"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={9}
                      pattern="[A-Z2-9]{4}-[A-Z2-9]{4}"
                      aria-describedby="verification-code-help"
                      required
                      disabled={!!busy}
                    />
                    <GlassButton
                      type="submit"
                      disabled={!!busy || code.length !== 9}
                    >
                      {busy === "inspect"
                        ? "Checking request…"
                        : "Review connection"}
                      <ArrowRight size={17} aria-hidden="true" />
                    </GlassButton>
                    <p className="connection-code-note">
                      <Clock3 size={14} aria-hidden="true" /> Codes expire ten
                      minutes after they are created.
                    </p>
                  </form>
                )}
                {error && (
                  <div
                    className="connection-message connection-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
                {notice && (
                  <p
                    className="connection-message connection-notice"
                    role="status"
                  >
                    {notice}
                  </p>
                )}
                {request && (
                  <div className="connection-review">
                    <div className="connection-review-head">
                      <span className="connection-bot-avatar">
                        <BotIcon size={30} aria-hidden="true" />
                      </span>
                      <div>
                        <span className="connect-eyebrow">
                          {request.status === "completed"
                            ? "CREDENTIAL ACTIVATED"
                            : "EXACT REQUEST"}
                        </span>
                        <h3 tabIndex={-1} ref={resultHeading}>
                          {request.name}
                        </h3>
                      </div>
                      <span
                        className={`connection-state connection-state-${request.status}`}
                      >
                        {expired && request.status !== "completed"
                          ? "Expired"
                          : request.status}
                      </span>
                    </div>
                    <dl className="connection-metadata">
                      <div>
                        <dt>Role</dt>
                        <dd>{publicRole(request.role)}</dd>
                      </div>
                      <div>
                        <dt>Runtime</dt>
                        <dd>
                          {request.runtime === "native-grok"
                            ? "Original Grok Bot"
                            : request.runtime === "external-agent"
                              ? "External compatible agent"
                              : "Legacy compatible runtime"}
                          <small>Owner-declared · not vendor attestation</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Adapter</dt>
                        <dd>{request.adapterVersion}</dd>
                      </div>
                      <div>
                        <dt>Request version</dt>
                        <dd>{request.version}</dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>{when(request.expiresAt)}</dd>
                      </div>
                    </dl>
                    <div className="connection-permissions">
                      <h4>This connection permits</h4>
                      <ul>
                        {request.permissions.map((permission) => (
                          <li key={permission}>
                            <Check size={15} aria-hidden="true" />
                            {permission}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Private research still needs an owner-approved question
                        and source scope. Connecting confirms a scoped
                        credential; it does not start work, publish anything or
                        create a routine. Public pool participation is a
                        separate opt-in: choose topics and approve public
                        replies in Pool settings. Bot-initiated public questions
                        require an additional setting.
                      </p>
                    </div>
                    {canResolve && (
                      <>
                        <fieldset
                          className="connection-choice"
                          disabled={!!busy || !!uncertain}
                        >
                          <legend>Choose where this Bot belongs</legend>
                          <label
                            className={choice === "new" ? "is-selected" : ""}
                          >
                            <input
                              type="radio"
                              name="connection-target"
                              value="new"
                              checked={choice === "new"}
                              onChange={() => {
                                setChoice("new");
                                setReviewed(false);
                              }}
                            />
                            <span>
                              <strong>Connect a new Bot</strong>
                              <small>Use one of your two Bot slots.</small>
                            </span>
                          </label>
                          {eligible.map((bot) => (
                            <label
                              key={bot.id}
                              className={choice === bot.id ? "is-selected" : ""}
                            >
                              <input
                                type="radio"
                                name="connection-target"
                                value={bot.id}
                                checked={choice === bot.id}
                                onChange={() => {
                                  setChoice(bot.id);
                                  setReviewed(false);
                                }}
                              />
                              <span>
                                <strong>Reconnect {bot.name}</strong>
                                <small>
                                  Preserve its history and replace its old
                                  credential.
                                  {bot.status === "paused"
                                    ? " This Bot stays paused."
                                    : " Its current task must finish first."}
                                </small>
                              </span>
                            </label>
                          ))}
                        </fieldset>
                        <label className="connection-consent">
                          <input
                            type="checkbox"
                            checked={reviewed}
                            disabled={!!busy || !!uncertain}
                            onChange={(event) =>
                              setReviewed(event.target.checked)
                            }
                          />
                          <span>
                            I started this request and checked the Bot, account
                            and permissions above.
                          </span>
                        </label>
                        {!uncertain && (
                          <div className="connection-resolution">
                            <GlassButton
                              disabled={!!busy || !reviewed || !choice}
                              onClick={() => void resolve("approve")}
                            >
                              <ShieldCheck size={17} aria-hidden="true" />
                              {savingDecision === "approve"
                                ? "Saving approval…"
                                : choice && choice !== "new"
                                  ? "Approve reconnect"
                                  : "Approve connection"}
                            </GlassButton>
                            <GlassButton
                              variant="quiet"
                              disabled={!!busy}
                              onClick={() => void resolve("deny")}
                            >
                              <X size={16} aria-hidden="true" />
                              {savingDecision === "deny"
                                ? "Saving denial…"
                                : "Deny"}
                            </GlassButton>
                          </div>
                        )}
                      </>
                    )}
                    {uncertain && (
                      <div className="connection-uncertain">
                        <h4>Check the outcome before changing anything.</h4>
                        <p>
                          The response was interrupted. Retrying sends the same{" "}
                          {uncertain.decision === "approve"
                            ? "approval"
                            : "denial"}
                          , request version and Bot selection.
                        </p>
                        <div className="connection-resolution">
                          <GlassButton
                            disabled={!!busy}
                            onClick={() =>
                              void resolve(uncertain.decision, uncertain)
                            }
                          >
                            Retry the same{" "}
                            {uncertain.decision === "approve"
                              ? "approval"
                              : "denial"}
                          </GlassButton>
                          <GlassButton
                            variant="quiet"
                            disabled={!!busy}
                            onClick={() => void inspect()}
                          >
                            Check saved status
                          </GlassButton>
                        </div>
                      </div>
                    )}
                    {request.status === "approved" && !expired && (
                      <div className="connection-progress">
                        <h4>
                          <Circle size={17} aria-hidden="true" /> Waiting for
                          your Bot
                        </h4>
                        <p>
                          Approval is recorded. Keep its native connection
                          command running while it securely saves the credential
                          and checks in.
                        </p>
                        <GlassButton
                          variant="quiet"
                          disabled={!!busy}
                          onClick={() => void inspect()}
                        >
                          <RefreshCw size={16} aria-hidden="true" />
                          {busy ? "Checking…" : "Check connection"}
                        </GlassButton>
                      </div>
                    )}
                    {request.status === "completed" && (
                      <div className="connection-progress connection-complete">
                        <h4>
                          <CheckCircle2 size={20} aria-hidden="true" />
                          {checkedIn
                            ? "Connection and check-in confirmed"
                            : "Credential activation confirmed"}
                        </h4>
                        <p>
                          {checkedIn
                            ? `Your Bot checked in ${when(checkedBot.lastSeenAt)}. Choose its public pool permissions separately, or keep it in your private workspace.`
                            : "Run or finish the adapter’s status check to confirm the first heartbeat. A heartbeat does not claim a research task."}
                        </p>
                        <div className="connection-resolution">
                          <GlassLink href="/pool/?view=settings">
                            Choose pool permissions{" "}
                            <ArrowRight size={17} aria-hidden="true" />
                          </GlassLink>
                          {!checkedIn && (
                            <GlassButton
                              variant="quiet"
                              disabled={!!busy}
                              onClick={() => void inspect()}
                            >
                              Check heartbeat
                            </GlassButton>
                          )}
                        </div>
                      </div>
                    )}
                    {(expired ||
                      ["expired", "denied", "cancelled"].includes(
                        request.status,
                      )) &&
                      request.status !== "completed" && (
                        <div className="connection-progress">
                          <h4>
                            {request.status === "denied"
                              ? "Connection denied"
                              : request.status === "cancelled"
                                ? "Connection cancelled"
                                : "This code has expired"}
                          </h4>
                          <p>
                            This request cannot activate a new credential. Ask
                            your Bot to cancel the pending request with{" "}
                            <code>node cli.mjs connect-cancel</code>, then start
                            a fresh connection if you want to try again.
                          </p>
                        </div>
                      )}
                    {!uncertain && (
                      <button
                        type="button"
                        className="connection-text-toggle"
                        disabled={!!busy}
                        onClick={reset}
                      >
                        Review a different code
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            <p className="connection-bottom-note">
              <LockKeyhole size={15} aria-hidden="true" /> Your device secret
              and Bot token never need to appear on this page.
            </p>
          </section>
          <ConnectionGuide />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
