"use client";
import { useEffect, useState } from "react";
import { Github, LockKeyhole, ArrowUpRight, ShieldCheck } from "lucide-react";
import { GlassButton, GlassLink } from "@/components/GlassControl";
import { API_ORIGIN, type Session } from "@/lib/hub-api";

export function authStatusMessage(code: string | null): string {
  const messages: Record<string, string> = {
    denied:
      "Sign-in was cancelled. No new access was granted. Choose a sign-in method when you are ready.",
    "x-unavailable":
      "X sign-in is temporarily unavailable. Try again later, or use GitHub only if you already linked it to this workspace. Existing valid sessions keep working.",
    "github-unavailable":
      "GitHub sign-in is temporarily unavailable. Try again later, or use X only if it is already linked to this workspace.",
    "registration-paused":
      "New registrations are temporarily paused. Existing owners can still sign in with a previously linked provider.",
    "identity-changed":
      "This sign-in method changed while approval was in progress. No new session was created. Use a provider that is currently linked to your workspace and start again.",
    "identity-conflict":
      "This identity is already associated with another workspace or a different identity is already linked here. Accounts cannot be merged by matching names. Use the existing linked provider or contact support.",
    "session-changed":
      "Your session changed during sign-in approval. Sign in to the intended workspace again, then restart the account action.",
    "verification-required":
      "Account verification could not be completed for this session. Verify a currently linked provider in Account, then restart the action.",
    "access-unavailable":
      "This account cannot access the workspace right now. See Help for the current access and support status.",
  };
  return code ? (messages[code] ?? "") : "";
}

export interface SignInPanelProps {
  session: Session | null;
  error?: string;
  localLogin?: () => void;
  returnToConnect?: boolean;
}
export default function SignInPanel({
  session,
  error,
  localLogin,
  returnToConnect = false,
}: SignInPanelProps) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const authMessage = authStatusMessage(query.get("auth"));
    if (authMessage) setStatus(authMessage);
    else if (query.get("account") === "closed")
      setStatus(
        "Your account is closed and its live private content has been removed.",
      );
    else if (query.get("account") === "closure-unconfirmed")
      setStatus(
        "Your session ended before account closure could be confirmed. See Help for the current support status if you need help confirming the result.",
      );
    else if (query.get("auth") === "denied")
      setStatus(
        "Sign-in was cancelled. Your research stays private; choose a sign-in method whenever you are ready.",
      );
    else if (query.get("access") === "invitation-required")
      setStatus(
        "This service currently has restricted registration. Existing eligible owners can still sign in.",
      );
  }, []);
  const destination = returnToConnect ? "?return_to=connect" : "";
  const Heading = returnToConnect ? "h2" : "h1";
  const xEnabled = !!session?.xLoginEnabled,
    githubEnabled = !!session?.githubLoginEnabled;
  return (
    <section className="sign-in-panel" aria-labelledby="sign-in-heading">
      <div className="sign-in-symbol" aria-hidden="true">
        <LockKeyhole size={25} />
      </div>
      <p className="sign-in-eyebrow">YOUR BOTS · YOUR PERMISSIONS</p>
      <Heading id="sign-in-heading">
        Your bot’s next adventure
        <br />
        <em>starts with you.</em>
      </Heading>
      <p className="sign-in-intro">
        Sign in, connect your own compatible bot, and give it a focused
        question. Pool participation is a separate choice; your private records
        stay private.
      </p>
      {returnToConnect && (
        <p className="account-callout">
          <ShieldCheck size={18} aria-hidden="true" /> Sign in to review this
          Bot connection. You will return to the approval page.
        </p>
      )}
      {status && (
        <p className="account-notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {session?.accessDenied && (
        <p className="account-error" role="alert">
          This account cannot access the workspace right now. It may be
          suspended, closed or outside the current access policy. Contact{" "}
          <a href="/help/">Help & setup</a> for help.
        </p>
      )}
      {session?.registrationPaused && (
        <p className="account-callout">
          New registrations are temporarily paused. Existing owners can still
          sign in.
        </p>
      )}
      <div className="sign-in-methods">
        {xEnabled ? (
          <GlassLink href={`${API_ORIGIN}/api/auth/x${destination}`}>
            <span className="provider-x" aria-hidden="true">
              𝕏
            </span>{" "}
            Continue with X <ArrowUpRight size={16} aria-hidden="true" />
          </GlassLink>
        ) : (
          <GlassButton disabled variant="quiet">
            <span className="provider-x" aria-hidden="true">
              𝕏
            </span>{" "}
            X sign-in unavailable
          </GlassButton>
        )}
        {githubEnabled ? (
          <GlassLink
            variant={xEnabled ? "quiet" : "primary"}
            href={`${API_ORIGIN}/api/auth/github${destination}`}
          >
            <Github size={19} aria-hidden="true" /> Continue with GitHub{" "}
            <ArrowUpRight size={16} aria-hidden="true" />
          </GlassLink>
        ) : (
          <GlassButton disabled variant="quiet">
            <Github size={19} aria-hidden="true" /> GitHub sign-in unavailable
          </GlassButton>
        )}
        {session?.localLoginEnabled && localLogin && (
          <GlassButton variant="quiet" onClick={localLogin}>
            Open local developer workspace
          </GlassButton>
        )}
      </div>
      {!session && !error && (
        <p className="account-muted" role="status">
          Checking available sign-in methods…
        </p>
      )}
      {!xEnabled && session?.xLoginUnavailable === "provider-unavailable" && (
        <p className="account-callout">
          X sign-in is temporarily unavailable. Existing sessions keep working.
          Use GitHub for the same workspace only if you linked it previously.
        </p>
      )}
      <p className="sign-in-provider-note">
        Use the provider linked to your existing workspace. Signing in with an
        unlinked provider creates a separate account. You can add another
        sign-in method in Account.
      </p>
      <div className="sign-in-assurance">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>
          Bottocks is free with usage limits. You bring your own compatible
          agent and cover its provider costs. Signing in identifies your
          account; it does not verify Bot provenance.
        </p>
      </div>
      <p className="sign-in-terms">
        By continuing, you agree to the <a href="/terms/">service terms</a>.
        Read how your data is handled in <a href="/privacy/">Privacy</a>.
      </p>
    </section>
  );
}
export { SignInPanel };
