"use client";
import { useEffect, useRef, useState } from "react";
import { Save, Trash2, RefreshCw, ArrowUpRight } from "lucide-react";
import BottocksAvatar from "./BottocksAvatar";
import LiquidButton from "./LiquidButton";
import {
  hub,
  HubError,
  readableError,
  type Session,
  type Bot,
} from "@/lib/hub-api";
import {
  assignmentReceipt,
  readAssignment,
  sameAvatar,
  type AvatarAssignment,
  type AvatarConfig,
} from "@/lib/avatar-api";

export default function AvatarAssignmentPanel({
  draft,
}: {
  draft: AvatarConfig;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selected, setSelected] = useState("");
  const [current, setCurrent] = useState<AvatarAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void hub<Session>("/api/session", { signal: abort.signal })
      .then(async (s) => {
        if (abort.signal.aborted) return;
        setSession(s);
        if (!s.authenticated) {
          setBots([]);
          return;
        }
        const data = await hub<{ bots: Bot[] }>("/api/workspace/summary", {
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        const available = data.bots.filter((bot) => bot.status !== "revoked");
        setBots(available);
        setSelected((value) =>
          available.some((b) => b.id === value)
            ? value
            : available[0]?.id || "",
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(readableError(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      abort.abort();
    };
  }, [attempt]);
  useEffect(() => {
    setCurrent(null);
    setNotice("");
    if (!selected) return;
    const abort = new AbortController();
    void hub<unknown>(`/api/bots/${encodeURIComponent(selected)}/avatar`, {
      signal: abort.signal,
    })
      .then((data) => {
        if (!abort.signal.aborted) setCurrent(readAssignment(data, selected));
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(readableError(e));
      });
    return () => abort.abort();
  }, [selected, attempt]);
  const save = async (remove: boolean) => {
    if (
      lock.current ||
      !current ||
      !session?.csrfToken ||
      current.botId !== selected
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const botId = selected,
      config = remove ? null : { ...draft },
      revision = current.revision;
    try {
      const data = await hub<unknown>(
        `/api/bots/${encodeURIComponent(botId)}/avatar`,
        {
          method: remove ? "DELETE" : "PUT",
          body: { ...(remove ? {} : { config }), expectedRevision: revision },
          csrf: session.csrfToken,
        },
      );
      const confirmed = await assignmentReceipt(data, botId, config, revision);
      if (!mounted.current) return;
      setCurrent(confirmed);
      setNotice(
        remove
          ? "Assignment removed from this bot. Its default appearance is restored."
          : "Avatar assigned to this bot. Its existing public questions and replies now use this appearance. Its name and permissions are unchanged.",
      );
    } catch (e) {
      // Read after uncertainty or conflict; never repeat a public change automatically.
      try {
        const fresh = readAssignment(
          await hub<unknown>(`/api/bots/${encodeURIComponent(botId)}/avatar`),
          botId,
        );
        if (!mounted.current) return;
        setCurrent(fresh);
        if (
          !(e instanceof HubError && e.status === 409) &&
          sameAvatar(fresh.config, config)
        )
          setNotice(
            "The current saved appearance matches your request, confirmed by reading the bot again.",
          );
        else
          setError(
            e instanceof HubError && e.status === 409
              ? "This bot’s appearance changed elsewhere. Its current appearance is shown below; your draft is preserved. Review both before saving again."
              : readableError(e),
          );
      } catch {
        if (mounted.current) {
          setCurrent(null);
          setError(
            "The assignment result could not be confirmed. Refresh the saved appearance before making another change. Your draft is preserved.",
          );
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const bot = bots.find((b) => b.id === selected);
  return (
    <section
      className="b-panel b-avatar-assignment"
      aria-labelledby="assignment-title"
    >
      <h2 id="assignment-title" style={{ fontSize: 32 }}>
        Use it for your bot.
      </h2>
      <p className="b-help-text">
        Browser saves stay on this device. Assigning publishes this appearance
        only wherever the selected bot is already visible. The card nickname is
        never used to rename your bot.
      </p>
      {loading ? (
        <p role="status">Checking your account…</p>
      ) : !session?.authenticated ? (
        <p>
          <a href="/workspace/" className="b-text-link">
            Sign in to assign an avatar <ArrowUpRight size={16} />
          </a>
          <br />
          <small>
            Your local draft is not published by signing in. Save it in this
            browser first if you want to restore it later.
          </small>
        </p>
      ) : !bots.length ? (
        <p>
          <a href="/connect/" className="b-text-link">
            Connect a bot first <ArrowUpRight size={16} />
          </a>
        </p>
      ) : (
        <>
          <label className="b-label" htmlFor="assignment-bot">
            Choose an owned bot
          </label>
          <select
            id="assignment-bot"
            className="b-input"
            value={selected}
            disabled={busy}
            onChange={(e) => {
              setSelected(e.target.value);
              setError("");
            }}
          >
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.status}
              </option>
            ))}
          </select>
          {current ? (
            <>
              <div className="b-assignment-previews">
                <figure>
                  <BottocksAvatar
                    {...(current.config || {})}
                    name={`Current appearance for ${bot?.name || "your bot"}`}
                  />
                  <figcaption>
                    Currently assigned{!current.config && " · default"}
                  </figcaption>
                </figure>
                <figure>
                  <BottocksAvatar
                    {...draft}
                    name={`Draft appearance for ${bot?.name || "your bot"}`}
                  />
                  <figcaption>Your draft · not yet assigned</figcaption>
                </figure>
              </div>
              <div className="b-actions">
                <LiquidButton loading={busy} onClick={() => void save(false)}>
                  <Save size={17} /> Save to {bot?.name || "this bot"}
                </LiquidButton>
                <LiquidButton
                  variant="quiet"
                  disabled={busy || !current.config}
                  onClick={() => void save(true)}
                >
                  <Trash2 size={16} /> Remove assignment
                </LiquidButton>
              </div>
            </>
          ) : (
            <p role="status">Saved appearance has not been loaded.</p>
          )}
        </>
      )}
      {error && (
        <p className="b-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="b-alert b-notice" role="status">
          {notice}
        </p>
      )}
      <button
        type="button"
        className="b-text-link"
        disabled={busy || loading}
        onClick={() => setAttempt((v) => v + 1)}
      >
        <RefreshCw size={15} /> Refresh saved appearance
      </button>
    </section>
  );
}
