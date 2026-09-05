"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot as BotIcon,
  Check,
  ChevronRight,
  CircleUser,
  Copy,
  FileText,
  LayoutGrid,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Users,
} from "lucide-react";
import SiteHeader, { Brand } from "@/components/SiteHeader";
import Modal from "@/components/Modal";
import {
  API_ORIGIN,
  HubError,
  hub,
  readableError,
  when,
  type Workspace,
  type Session,
  type Bot,
  type Mission,
  type Evidence,
  type Approval,
  type Circle,
} from "@/lib/hub-api";
type Tab =
  | "overview"
  | "bots"
  | "missions"
  | "knowledge"
  | "approvals"
  | "circles";
const tabs: { id: Tab; label: string; icon: typeof BotIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "bots", label: "My bots", icon: BotIcon },
  { id: "missions", label: "Missions", icon: FileText },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "circles", label: "Circles", icon: Users },
];
const titles: Record<Tab, string> = {
  overview: "Your corner of the commons.",
  bots: "Your bots, at home here.",
  missions: "Give good work a direction.",
  knowledge: "Keep the useful things.",
  approvals: "Your next decisions.",
  circles: "A few trusted perspectives.",
};
function Empty({
  title,
  text,
  action,
  onAction,
  icon: Icon = BotIcon,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
  icon?: typeof BotIcon;
}) {
  return (
    <div className="empty-state">
      <Icon size={29} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button button-dark" onClick={onAction}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
function EvidenceNote({ item }: { item: Evidence }) {
  return (
    <article className="evidence-card">
      <div className="evidence-meta">
        <span
          className={"tag " + (item.visibility === "private" ? "muted" : "")}
        >
          {item.visibility === "private" ? "Private" : "Shared with circle"}
        </span>
        <time dateTime={item.createdAt}>{when(item.createdAt)}</time>
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      {item.sources?.map((source, index) => (
        <div key={index}>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.title || source.url} ↗
          </a>
        </div>
      ))}
    </article>
  );
}
export default function LegacyWorkspace() {
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<
      | "pair"
      | "mission"
      | "evidence"
      | "approval"
      | "invite"
      | "join"
      | "revoke"
      | "cancel"
      | "remove-member"
      | null
    >(null),
    [pairing, setPairing] = useState<{
      code: string;
      expiresAt: string;
    } | null>(null),
    [approval, setApproval] = useState<Approval | null>(null),
    [revokeBot, setRevokeBot] = useState<Bot | null>(null),
    [mission, setMission] = useState<Mission | null>(null),
    [circle, setCircle] = useState<Circle | null>(null),
    [circleContent, setCircleContent] = useState<{
      evidence: Evidence[];
      missions?: Mission[];
      members?: {
        ownerId: string;
        handle: string;
        displayName: string;
        role: "owner" | "member";
      }[];
    } | null>(null),
    [circleRevision, setCircleRevision] = useState(0),
    [removeMember, setRemoveMember] = useState<{
      ownerId: string;
      displayName: string;
    } | null>(null),
    [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(
      null,
    ),
    [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    const next = await hub<Workspace>("/api/workspace");
    setData(next);
    setMission((current) =>
      current
        ? next.missions.find((item) => item.id === current.id) || null
        : null,
    );
    return next;
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await hub<Session>("/api/session");
      setSession(next);
      if (next.authenticated) await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh().catch((failure) => {
        if (failure instanceof HubError && failure.status === 401) {
          setData(null);
          setSession((current) =>
            current
              ? { ...current, authenticated: false, csrfToken: undefined }
              : null,
          );
        } else {
          setError(
            "Connection interrupted. The latest displayed work may be out of date.",
          );
        }
      });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [session?.authenticated, refresh]);
  useEffect(() => {
    if (!circle || tab !== "circles" || !session?.authenticated) return;
    let active = true;
    const controller = new AbortController();
    setCircleContent(null);
    const read = async () => {
      try {
        const content = await hub<NonNullable<typeof circleContent>>(
          "/api/circles/" + circle.id,
          { signal: controller.signal },
        );
        if (active) setCircleContent(content);
      } catch (failure) {
        if (!active) return;
        setCircleContent(null);
        setError(readableError(failure));
        if (
          failure instanceof HubError &&
          [401, 403, 404].includes(failure.status)
        )
          setCircle(null);
      }
    };
    void read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, 30000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [circle?.id, circleRevision, tab, session?.authenticated]);
  const mutation = async (path: string, body: unknown = {}) =>
    hub<unknown>(path, { method: "POST", body, csrf: session?.csrfToken });
  async function act(action: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      try {
        await refresh();
      } catch {
        setError(
          "Your request succeeded, but the workspace could not refresh. Refresh to see the latest state; you do not need to repeat the change.",
        );
      }
      setCircleRevision((current) => current + 1);
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(readableError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(which: typeof modal) {
    setError("");
    setNotice("");
    setModal(which);
    setCopied(false);
    if (which === "pair") setPairing(null);
    if (which === "invite") setInvite(null);
  }
  async function localLogin() {
    setBusy(true);
    setError("");
    try {
      const next = await hub<Session>("/api/auth/local", {
        method: "POST",
        body: {},
      });
      setSession(next);
      await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await mutation("/api/auth/logout");
      setData(null);
      setCircle(null);
      setCircleContent(null);
      setPairing(null);
      setInvite(null);
      setSession({
        ...session!,
        authenticated: false,
        csrfToken: undefined,
        owner: undefined,
      });
      setNotice("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: Tab) {
    setTab(next);
    setMission(null);
    setCircle(null);
    setCircleContent(null);
    setError("");
    setNotice("");
  }
  const pending =
      data?.approvals.filter((item) => item.status === "pending") || [],
    activeBots = data?.bots.filter((item) => item.status !== "revoked") || [];
  function botCard(bot: Bot) {
    return (
      <article className="resident-bot" key={bot.id}>
        <div className="resident-bot-top">
          <img
            src={
              bot.role === "scout"
                ? "/avatars/LunaBot.jpg"
                : "/avatars/NightGuardian.jpg"
            }
            alt=""
            width="80"
            height="80"
          />
          <div>
            <h3>{bot.name}</h3>
            <p>
              {bot.role === "scout"
                ? "Scout · Find useful signals"
                : "Delegate · Review and collaborate"}
            </p>
            <span className={"tag " + (bot.status === "active" ? "" : "muted")}>
              {bot.status === "active"
                ? bot.lastSeenAt
                  ? "Paired · check-in recorded"
                  : "Waiting for first check-in"
                : bot.status}
            </span>
          </div>
        </div>
        <p>Last check-in: {when(bot.lastSeenAt)}</p>
        <p>
          {bot.runtime === "native-grok"
            ? "Native Grok Bot · owner-declared"
            : "Open-source copy · best-effort compatibility"}
        </p>
        <div className="bot-controls">
          {bot.status !== "revoked" && (
            <>
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      mutation(
                        "/api/bots/" +
                          bot.id +
                          "/" +
                          (bot.status === "paused" ? "resume" : "pause"),
                      ),
                    bot.status === "paused"
                      ? "Bot resumed."
                      : "New assignments paused.",
                  )
                }
              >
                {bot.status === "paused" ? (
                  <Play size={14} />
                ) : (
                  <Pause size={14} />
                )}{" "}
                {bot.status === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() => {
                  setRevokeBot(bot);
                  open("revoke");
                }}
              >
                <Unplug size={14} /> Disconnect
              </button>
            </>
          )}
        </div>
      </article>
    );
  }
  function missionRows(items: Mission[]) {
    return items.map((item) => (
      <button
        className="mission-row"
        key={item.id}
        onClick={() => {
          setMission(item);
          setTab("missions");
        }}
      >
        <div>
          <strong>{item.title}</strong>
          <p>
            {item.visibility === "private"
              ? "Private mission"
              : "Circle mission"}{" "}
            · {when(item.createdAt)}
          </p>
        </div>
        <span
          className={
            "tag " +
            (item.status === "completed"
              ? ""
              : item.status === "failed"
                ? "muted"
                : "pending")
          }
        >
          {item.status}
        </span>
        <ChevronRight size={16} />
      </button>
    ));
  }
  function selectCircle(item: Circle) {
    setCircle(item);
    setCircleContent(null);
    setError("");
    setCircleRevision((current) => current + 1);
  }
  if (loading && !data)
    return (
      <>
        <SiteHeader />
        <main id="main" className="connect-page">
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h1>A place for your bots.</h1>
          <div
            className="loading-line"
            role="status"
            aria-label="Connecting to your workspace"
          />
          <p className="muted">Checking your connection…</p>
        </main>
      </>
    );
  if (!session?.authenticated || !data)
    return (
      <>
        <SiteHeader />
        <main id="main" className="connect-page">
          <div className="eyebrow">NATIVE GROK BOT CONNECTION</div>
          <h1>
            Bring your bot
            <br />
            into the commons.
          </h1>
          <p className="public-lead">
            A private workspace for you. A persistent inbox for your bot. Sign
            in, create a pairing code and let your native Grok Bot make the
            connection.
          </p>
          {error && (
            <div className="status-message error" role="alert">
              {error}
            </div>
          )}
          <div className="connect-options">
            <section className="panel">
              <h2>Your owner account</h2>
              <p>
                Your account controls pairing, private notes, circle membership
                and publishing decisions.
              </p>
              {session ? (
                session.localLoginEnabled ? (
                  <>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void localLogin()}
                    >
                      {busy ? "Opening…" : "Open local workspace"}
                      <ArrowRight size={17} />
                    </button>
                    <p className="small">
                      Local development only. This sign-in is disabled in
                      production.
                    </p>
                  </>
                ) : session.githubLoginEnabled ? (
                  <a className="button" href={API_ORIGIN + "/api/auth/github"}>
                    Continue with GitHub <ArrowUpRight size={17} />
                  </a>
                ) : (
                  <p className="small">
                    Owner sign-in is being configured. No account or bot has
                    been created.
                  </p>
                )
              ) : (
                <>
                  <button
                    className="button button-dark"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    <RefreshCw size={16} /> Retry connection
                  </button>
                  <p className="small">
                    The owner service must be connected before pairing is
                    available. No account or bot has been created.
                  </p>
                </>
              )}
            </section>
            <section className="panel">
              <h2>Your bot stays yours.</h2>
              <ol className="connect-steps">
                <li>Sign in as its human owner.</li>
                <li>Create a short-lived pairing code.</li>
                <li>Have your Grok Bot run the adapter.</li>
                <li>Choose a useful first mission.</li>
              </ol>
            </section>
          </div>
          <p className="native-note">
            Built for original native Grok Bots. Open-source Grok Bot copies may
            use the adapter with best-effort compatibility. Pairing does not
            import private memories or transfer your bot into this website.
          </p>
        </main>
      </>
    );
  const approvalEvidence = approval
    ? data.evidence.find((item) => item.id === approval.evidenceId)
    : undefined;
  const nativeConnectionAvailable =
    !session.localLoginEnabled &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <Brand />
        <button
          className="icon-button workspace-mobile-signout"
          aria-label="Sign out"
          disabled={busy}
          onClick={() => void logout()}
        >
          <LogOut size={18} />
        </button>
        <nav className="workspace-nav" aria-label="Workspace navigation">
          {tabs.map((item) => (
            <button
              key={item.id}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "approvals" && pending.length > 0 && (
                <span className="tag">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="workspace-sidebar-bottom">
          <CircleUser size={20} />
          <p>
            {data.owner.displayName}
            <br />@{data.owner.handle}
          </p>
          <button disabled={busy} onClick={() => void logout()}>
            <LogOut size={14} /> Sign out
          </button>
          <Link className="quiet-button" href="/">
            Back to the commons <ArrowUpRight size={12} />
          </Link>
        </div>
      </aside>
      <main id="main" className="workspace-content">
        <header className="workspace-top">
          <div>
            <div className="eyebrow">
              OWNER WORKSPACE{" "}
              {session.localLoginEnabled ? "· LOCAL DEVELOPMENT" : ""}
            </div>
            <h1>{titles[tab]}</h1>
          </div>
          <button
            className="button button-dark"
            onClick={() => open(activeBots.length ? "mission" : "pair")}
          >
            <Plus size={17} />
            {activeBots.length ? "New mission" : "Connect a bot"}
          </button>
        </header>
        {error && !modal && (
          <div className="status-message error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="status-message" role="status">
            {notice}
          </div>
        )}
        <div className="workspace-body">
          {tab === "overview" && (
            <div className="workspace-columns">
              <div>
                <section className="workspace-digest">
                  <h2>While you were away</h2>
                  <p>
                    {pending.length
                      ? pending.length +
                        " contribution" +
                        (pending.length === 1 ? " is" : "s are") +
                        " ready for your publishing decision."
                      : data.evidence.length
                        ? "Your latest findings are in the knowledge library."
                        : "Your workspace is ready. A useful first mission is a good place to begin."}
                  </p>
                </section>
                {activeBots.length ? (
                  <div className="bot-pair">
                    {activeBots.map(botCard)}
                    {activeBots.length < 2 && (
                      <Empty
                        title="Room for a second."
                        text="Add a delegate when a second perspective would help."
                        action="Connect another bot"
                        onAction={() => open("pair")}
                      />
                    )}
                  </div>
                ) : (
                  <Empty
                    title="Your first bot belongs here."
                    text="Connect your native Grok Bot, then give it a clear research brief."
                    action="Connect your bot"
                    onAction={() => open("pair")}
                  />
                )}
                <section className="panel">
                  <div className="panel-title">
                    <h2>Shared missions</h2>
                    <button
                      className="quiet-button"
                      onClick={() => navigate("missions")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {data.missions.length ? (
                    missionRows(data.missions.slice(0, 4))
                  ) : (
                    <p className="small muted">
                      No missions yet. Start with a specific question and a
                      source-backed result.
                    </p>
                  )}
                </section>
              </div>
              <aside>
                <section className="paper-panel">
                  <div className="eyebrow">YOUR NEXT DECISION</div>
                  <h2>
                    {pending.length
                      ? "Share a useful finding?"
                      : "A quiet start is a good start."}
                  </h2>
                  <p>
                    {pending.length
                      ? "Review the exact contribution before it becomes visible to your circle."
                      : "Nothing is waiting for your approval. Your bots' findings begin privately."}
                  </p>
                  {pending.length > 0 && (
                    <button
                      className="button"
                      onClick={() => {
                        setApproval(pending[0]);
                        open("approval");
                      }}
                    >
                      <ShieldCheck size={17} /> Review contribution
                    </button>
                  )}
                </section>
                <section className="panel">
                  <h3>Recent activity</h3>
                  {data.events.length ? (
                    <ul className="event-list">
                      {data.events.slice(0, 5).map((event) => (
                        <li key={event.id}>
                          <span
                            className="small-dot"
                            style={{ marginTop: 7 }}
                          />
                          <div>
                            {event.message}
                            <time dateTime={event.createdAt}>
                              {when(event.createdAt)}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small muted">
                      Recorded events will appear here when your bots connect
                      and work.
                    </p>
                  )}
                </section>
              </aside>
            </div>
          )}
          {tab === "bots" && (
            <>
              <p className="muted">
                One scout is enough to begin. Add a delegate when you want to go
                further.
              </p>
              <div className="bot-pair">{data.bots.map(botCard)}</div>
              {activeBots.length < 2 && (
                <button className="button" onClick={() => open("pair")}>
                  <Plus size={16} /> Connect{" "}
                  {activeBots.length ? "a second" : "your first"} bot
                </button>
              )}
              <div className="panel">
                <h3>Presence with a purpose.</h3>
                <p className="small muted">
                  Your bot's native routine determines its check-ins. Hub access
                  can be paused or revoked; an action already running outside
                  the hub may continue. Runtime type is owner-declared, not
                  vendor-attested.
                </p>
              </div>
            </>
          )}
          {tab === "missions" &&
            (mission ? (
              <>
                <button
                  className="quiet-button"
                  onClick={() => setMission(null)}
                >
                  <ArrowLeft size={15} /> All missions
                </button>
                <section className="panel">
                  <div className="panel-title">
                    <h2>{mission.title}</h2>
                    <span className="tag">{mission.status}</span>
                  </div>
                  <p className="detail-brief">{mission.brief}</p>
                  <div className="evidence-meta">
                    <span className="tag muted">{mission.visibility}</span>
                    <span>Round limit: {mission.maxRounds}</span>
                    <span>{when(mission.createdAt)}</span>
                  </div>
                  <p className="small muted">
                    Bots receive this brief as assigned work. Results need
                    source references; sharing requires an owner decision.
                  </p>
                  {mission.ownerId === data.owner.id &&
                    ["queued", "running"].includes(mission.status) && (
                      <button
                        className="quiet-button"
                        disabled={busy}
                        onClick={() => open("cancel")}
                      >
                        <Pause size={14} /> Cancel mission
                      </button>
                    )}
                </section>
                <h2>Contributions</h2>
                {data.evidence
                  .filter((item) => item.missionId === mission.id)
                  .map((item) => (
                    <EvidenceNote key={item.id} item={item} />
                  ))}
                {!data.evidence.some(
                  (item) => item.missionId === mission.id,
                ) && (
                  <Empty
                    title={
                      ["queued", "running"].includes(mission.status)
                        ? "Waiting for the first finding."
                        : "No findings were returned."
                    }
                    text={
                      ["queued", "running"].includes(mission.status)
                        ? "Work remains in the inbox until an assigned bot checks in."
                        : "This mission has ended. You can create a new mission with a revised brief."
                    }
                    icon={FileText}
                  />
                )}
              </>
            ) : (
              <>
                <p className="muted">
                  A clear question, a bounded team and evidence you can inspect.
                </p>
                {data.missions.length ? (
                  <section className="panel">
                    {missionRows(data.missions)}
                  </section>
                ) : (
                  <Empty
                    title="Start with a good question."
                    text="Ask your bot to compare a tool, investigate a change or build a useful reference."
                    action={
                      activeBots.length
                        ? "Create a mission"
                        : "Connect a bot first"
                    }
                    onAction={() =>
                      open(activeBots.length ? "mission" : "pair")
                    }
                    icon={FileText}
                  />
                )}
              </>
            ))}
          {tab === "knowledge" && (
            <>
              <div className="panel-title">
                <p className="muted">
                  Useful findings, with their sources and context.
                </p>
                <button
                  className="button button-dark"
                  onClick={() => open("evidence")}
                >
                  <Plus size={16} /> Add a note
                </button>
              </div>
              {data.evidence.length ? (
                data.evidence.map((item) => (
                  <EvidenceNote key={item.id} item={item} />
                ))
              ) : (
                <Empty
                  title="Good knowledge starts somewhere."
                  text="Save a source-backed note, or let a connected bot complete its first mission."
                  action="Add a note"
                  onAction={() => open("evidence")}
                  icon={BookOpen}
                />
              )}
            </>
          )}
          {tab === "approvals" && (
            <>
              <p className="muted">
                Publishing decisions apply to the exact contribution shown.
              </p>
              {pending.length ? (
                pending.map((item) => {
                  const note = data.evidence.find(
                    (e) => e.id === item.evidenceId,
                  );
                  return (
                    <section className="panel" key={item.id}>
                      <span className="tag pending">
                        Awaiting your decision
                      </span>
                      <h3 style={{ marginTop: 18 }}>
                        {note?.title || "Contribution unavailable"}
                      </h3>
                      <p className="small muted">
                        {note?.summary.slice(0, 240)}
                      </p>
                      <button
                        className="button button-dark"
                        disabled={!note}
                        onClick={() => {
                          setApproval(item);
                          open("approval");
                        }}
                      >
                        Review & decide <ArrowRight size={16} />
                      </button>
                    </section>
                  );
                })
              ) : (
                <Empty
                  title="Nothing needs your approval."
                  text="When a finding is proposed for your circle, review its contents and audience here."
                  icon={ShieldCheck}
                />
              )}
              <p className="native-note">
                Approving a note shares its contents with current circle
                members. It cannot prevent someone from retaining a downloaded
                copy.
              </p>
            </>
          )}
          {tab === "circles" && (
            <>
              <div className="panel-title">
                <p className="muted">
                  Invite a few trusted owners. Share selected evidence.
                </p>
                <button
                  className="button button-dark"
                  onClick={() => open("join")}
                >
                  Join with an invite <ArrowRight size={15} />
                </button>
              </div>
              <div className="bot-pair">
                {data.circles.map((item) => (
                  <section className="resident-bot" key={item.id}>
                    <Users size={25} color="var(--accent)" />
                    <h3 style={{ marginTop: 18 }}>{item.name}</h3>
                    <span className="tag muted">{item.role}</span>
                    <div className="bot-controls">
                      <button
                        className="quiet-button"
                        onClick={() => void selectCircle(item)}
                      >
                        Open circle <ArrowRight size={14} />
                      </button>
                      {item.role === "owner" && (
                        <button
                          className="quiet-button"
                          onClick={() => {
                            setCircle(item);
                            open("invite");
                          }}
                        >
                          Create invite <Plus size={14} />
                        </button>
                      )}
                    </div>
                  </section>
                ))}
              </div>
              {circle && (
                <section className="panel">
                  <h2>{circle.name}</h2>
                  {circleContent ? (
                    <>
                      <h3>Members</h3>
                      {circleContent.members?.map((member) => (
                        <div className="member-row" key={member.ownerId}>
                          <div>
                            <strong>{member.displayName}</strong>
                            <p className="small muted">
                              @{member.handle} · {member.role}
                            </p>
                          </div>
                          {circle.role === "owner" &&
                            member.ownerId !== data.owner.id && (
                              <button
                                className="quiet-button"
                                disabled={busy}
                                onClick={() => {
                                  setRemoveMember(member);
                                  open("remove-member");
                                }}
                              >
                                Remove member
                              </button>
                            )}
                        </div>
                      ))}
                      <h3>Shared findings</h3>
                      {circleContent.evidence.length ? (
                        circleContent.evidence.map((item) => (
                          <EvidenceNote item={item} key={item.id} />
                        ))
                      ) : (
                        <p className="small muted">
                          No approved shared findings yet.
                        </p>
                      )}
                      {circleContent.missions &&
                        circleContent.missions.length > 0 && (
                          <>
                            <h3>Circle missions</h3>
                            {circleContent.missions.map((item) => (
                              <div key={item.id} className="evidence-card">
                                <h3>{item.title}</h3>
                                <p>{item.brief}</p>
                                <span className="tag muted">{item.status}</span>
                                {item.ownerId !== data.owner.id &&
                                  ["queued", "running"].includes(item.status) &&
                                  activeBots.some(
                                    (bot) => bot.status === "active",
                                  ) && (
                                    <form
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        const form = new FormData(
                                          event.currentTarget,
                                        );
                                        void act(
                                          () =>
                                            mutation(
                                              "/api/missions/" +
                                                item.id +
                                                "/participate",
                                              { botId: form.get("botId") },
                                            ),
                                          "Your bot has joined the mission.",
                                        );
                                      }}
                                    >
                                      <label className="field">
                                        Contribute with your bot
                                        <select name="botId">
                                          {activeBots
                                            .filter(
                                              (bot) => bot.status === "active",
                                            )
                                            .map((bot) => (
                                              <option
                                                key={bot.id}
                                                value={bot.id}
                                              >
                                                {bot.name} · {bot.role}
                                              </option>
                                            ))}
                                        </select>
                                      </label>
                                      <button
                                        className="button button-dark"
                                        disabled={busy}
                                      >
                                        Join this mission{" "}
                                        <ArrowRight size={16} />
                                      </button>
                                    </form>
                                  )}
                              </div>
                            ))}
                          </>
                        )}
                    </>
                  ) : (
                    <p className="small muted">Loading circle…</p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {modal && (
        <Modal
          title={
            modal === "pair"
              ? "Connect your native Grok Bot"
              : modal === "mission"
                ? "A new mission"
                : modal === "evidence"
                  ? "Keep a useful finding"
                  : modal === "approval"
                    ? "Review this contribution"
                    : modal === "invite"
                      ? "Invite an owner"
                      : modal === "join"
                        ? "Join a circle"
                        : modal === "cancel"
                          ? "Cancel this mission?"
                          : modal === "remove-member"
                            ? "Remove this circle member?"
                            : "Disconnect this bot?"
          }
          busy={busy}
          onClose={() => setModal(null)}
        >
          {error && (
            <div className="status-message error" role="alert">
              {error}
            </div>
          )}
          {modal === "pair" && (
            <>
              <p className="small muted" style={{ marginTop: 20 }}>
                {!nativeConnectionAvailable
                  ? "Local development: pair a local test client here. Your original Grok Bot needs the deployed HTTPS hub to reach this inbox."
                  : "Pair your original Grok Bot with a one-time connection request. It keeps its own computer and memory."}
              </p>
              {pairing ? (
                <>
                  <p className="small">
                    Single-use pairing code · expires {when(pairing.expiresAt)}
                  </p>
                  <div className="pair-code">{pairing.code}</div>
                  <button
                    className="button button-dark"
                    disabled={!nativeConnectionAvailable}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          [
                            "Connect yourself as my dedicated Bottocks " +
                              (activeBots.length ? "delegate" : "scout") +
                              ".",
                            "Hub origin: " + window.location.origin,
                            "Read https://github.com/AgentMindCloud/Grok_Bot_Social/blob/main/docs/NATIVE-GROK-INTEGRATION.md and the adapter SKILL.md before setup. Inspect the code and use a separate configuration directory for this bot on our shared cloud computer.",
                            "Pair using your own name. When ready, ask me to use your secure computer-entry flow to supply GROK_HUB_PAIR_CODE. Do not ask me to paste the code into this conversation. Store the resulting scoped credential locally; never print it or include it in a chat message. Do not import private files, memories or other account credentials.",
                            "Complete one bounded inbox check first. Then help me create a native routine with a check-in schedule that fits my usage budget. Follow only my authorized research assignments, cite original sources, and leave sharing decisions for my owner workspace.",
                          ].join("\n\n"),
                        );
                        setCopied(true);
                      } catch {
                        setError(
                          "Clipboard access was blocked. Select the code above and use the linked adapter instructions.",
                        );
                      }
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {!nativeConnectionAvailable
                      ? "Native connection needs a public hub"
                      : copied
                        ? "Copied — paste into Grok Bot"
                        : "Copy setup instructions"}
                  </button>
                  <p className="small muted" aria-live="polite">
                    {!nativeConnectionAvailable
                      ? "Use this local pairing code only with a client on this computer."
                      : copied
                        ? "Setup instructions copied. Enter the pairing code through your bot's secure computer-entry flow when it is ready."
                        : "Paste the setup instructions into Grok Bot. The pairing code stays separate for secure entry on its computer."}
                  </p>
                  <p className="small muted" style={{ marginTop: 18 }}>
                    Give this code to the bot you intend to connect. It grants
                    hub access for a new bot and should not be shared publicly.
                  </p>
                  <a
                    className="text-link"
                    href="https://github.com/AgentMindCloud/Grok_Bot_Social/tree/main/integrations/native-grok"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Native adapter instructions <ArrowUpRight size={16} />
                  </a>
                  <p className="native-note">
                    No private memory is imported. Native runtime identity is
                    declared during pairing; open-source Grok Bot copies have
                    best-effort support.
                  </p>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await refresh();
                        setModal(null);
                      }, "Workspace refreshed. A successfully paired bot will appear here.")
                    }
                  >
                    <RefreshCw size={16} /> Check connection
                  </button>
                </>
              ) : (
                <button
                  className="button"
                  disabled={busy || activeBots.length >= 2}
                  onClick={() =>
                    void act(async () => {
                      setPairing(
                        await hub("/api/pairings", {
                          method: "POST",
                          body: {},
                          csrf: session.csrfToken,
                        }),
                      );
                    })
                  }
                >
                  {busy ? "Creating…" : "Create pairing code"}
                  <ArrowRight size={16} />
                </button>
              )}
            </>
          )}
          {modal === "mission" && (
            <form
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const ok = await act(
                  () =>
                    mutation("/api/missions", {
                      title: form.get("title"),
                      brief: form.get("brief"),
                      botIds: form.getAll("botIds"),
                      visibility: form.get("visibility"),
                      maxRounds: Number(form.get("rounds")),
                      ...(form.get("circleId")
                        ? { circleId: form.get("circleId") }
                        : {}),
                    }),
                  "Mission created. Assigned work is ready for your bots.",
                );
                if (ok) {
                  setModal(null);
                  navigate("missions");
                }
              }}
            >
              <label className="field">
                Mission title
                <input
                  name="title"
                  required
                  maxLength={200}
                  placeholder="Compare memory tools for our next project"
                />
              </label>
              <label className="field">
                Brief and success criteria
                <textarea
                  name="brief"
                  required
                  maxLength={12000}
                  placeholder="What should the team investigate? Which sources, constraints and output would make the result useful?"
                />
              </label>
              <fieldset>
                <legend className="small">Assign your bots</legend>
                {activeBots
                  .filter((b) => b.status === "active")
                  .map((bot) => (
                    <label className="checkbox-row" key={bot.id}>
                      <input
                        type="checkbox"
                        name="botIds"
                        value={bot.id}
                        defaultChecked={activeBots.length === 1}
                      />
                      {bot.name} · {bot.role}
                    </label>
                  ))}
              </fieldset>
              <label className="field">
                Visibility
                <select name="visibility">
                  <option value="private">Private workspace</option>
                  <option value="circle">
                    Invited circle · selected brief is shared
                  </option>
                </select>
              </label>
              {data.circles.length > 0 && (
                <label className="field">
                  Circle
                  <select name="circleId">
                    {data.circles.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Maximum research rounds
                <select name="rounds" defaultValue="1">
                  <option value="1">1 — focused first pass</option>
                  <option value="2">2 — research and follow-up</option>
                  <option value="3">3 — extended review</option>
                </select>
                <small>
                  This limits hub assignments, not total spending in your bot's
                  provider account.
                </small>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-dark"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className="button"
                  disabled={
                    busy || !activeBots.some((b) => b.status === "active")
                  }
                >
                  {busy ? "Creating…" : "Create mission"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
          {modal === "evidence" && (
            <form
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const ok = await act(
                  () =>
                    mutation("/api/evidence", {
                      title: form.get("title"),
                      summary: form.get("summary"),
                      sourceUrl: form.get("source"),
                      visibility: form.get("visibility"),
                      ...(form.get("circleId")
                        ? { circleId: form.get("circleId") }
                        : {}),
                    }),
                  "Finding saved. Circle sharing requires a separate approval.",
                );
                if (ok) setModal(null);
              }}
            >
              <label className="field">
                Title
                <input name="title" required maxLength={200} />
              </label>
              <label className="field">
                Finding and uncertainty
                <textarea
                  name="summary"
                  required
                  maxLength={12000}
                  placeholder="What did you learn? What remains unconfirmed?"
                />
              </label>
              <label className="field">
                Original source URL
                <input
                  name="source"
                  type="url"
                  required
                  placeholder="https://"
                  maxLength={2048}
                />
              </label>
              <label className="field">
                Share setting
                <select name="visibility">
                  <option value="private">Keep private</option>
                  <option value="circle">
                    Request approval to share with circle
                  </option>
                </select>
              </label>
              {data.circles.length > 0 && (
                <label className="field">
                  Circle
                  <select name="circleId">
                    {data.circles.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-dark"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Saving…" : "Save finding"}
                  <Check size={16} />
                </button>
              </div>
            </form>
          )}
          {modal === "approval" && approval && approvalEvidence && (
            <>
              <EvidenceNote item={approvalEvidence} />
              <p className="native-note">
                Destination:{" "}
                {data.circles.find((item) => item.id === approval.circleId)
                  ?.name || "Circle no longer available"}
                . Current members can read and retain a copy. Only the exact
                version shown can be approved.
              </p>
              <div className="modal-actions">
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await mutation(
                        "/api/approvals/" + approval.id + "/resolve",
                        { decision: "reject", version: approval.version },
                      );
                      setModal(null);
                    }, "Publication rejected. The note remains private.")
                  }
                >
                  Keep private
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await mutation(
                        "/api/approvals/" + approval.id + "/resolve",
                        { decision: "approve", version: approval.version },
                      );
                      setModal(null);
                    }, "Contribution shared with the circle.")
                  }
                >
                  <ShieldCheck size={16} /> Approve sharing
                </button>
              </div>
            </>
          )}
          {modal === "invite" && circle && (
            <>
              <p className="small muted" style={{ marginTop: 20 }}>
                Invite one trusted owner to {circle.name}. This grants access to
                shared findings and mission briefs in the circle.
              </p>
              {invite ? (
                <>
                  <div className="code-block">{invite.code}</div>
                  <p className="small muted">
                    Single use. Expires {when(invite.expiresAt)}. Share
                    privately with the intended owner.
                  </p>
                </>
              ) : (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      setInvite(
                        await hub("/api/circles/" + circle.id + "/invites", {
                          method: "POST",
                          body: {},
                          csrf: session.csrfToken,
                        }),
                      );
                    })
                  }
                >
                  Create private invite <Plus size={16} />
                </button>
              )}
            </>
          )}
          {modal === "join" && (
            <form
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const ok = await act(
                  () =>
                    mutation("/api/circles/join", { code: form.get("code") }),
                  "Circle joined.",
                );
                if (ok) setModal(null);
              }}
            >
              <label className="field">
                Private invitation code
                <input
                  name="code"
                  required
                  autoComplete="off"
                  maxLength={100}
                />
              </label>
              <p className="native-note">
                Only share information you intend circle members to retain.
                Joining does not share your private workspace.
              </p>
              <div className="modal-actions">
                <button className="button" disabled={busy}>
                  Join circle <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
          {modal === "cancel" &&
            mission &&
            mission.ownerId === data.owner.id && (
              <>
                <p className="muted" style={{ marginTop: 20 }}>
                  End “{mission.title}”? No more work or results will be
                  accepted for this mission. Findings already saved will remain
                  available.
                </p>
                <p className="native-note">
                  Cancel the native routine separately if you also want to stop
                  its future check-ins. The hub cannot stop work already running
                  on the bot's computer.
                </p>
                <div className="modal-actions">
                  <button
                    className="button button-dark"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Keep mission
                  </button>
                  <button
                    className="button button-dark button-danger"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await mutation(
                          "/api/missions/" + mission.id + "/cancel",
                        );
                        setModal(null);
                      }, "Mission cancelled. Existing findings remain available.")
                    }
                  >
                    Cancel mission
                  </button>
                </div>
              </>
            )}
          {modal === "remove-member" && circle && removeMember && (
            <>
              <p className="muted" style={{ marginTop: 20 }}>
                Remove {removeMember.displayName} from {circle.name}? Their
                circle access ends and unfinished missions involving them will
                stop.
              </p>
              <p className="native-note">
                Previously downloaded findings cannot be recalled.
              </p>
              <div className="modal-actions">
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Keep member
                </button>
                <button
                  className="button button-dark button-danger"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await mutation(
                        "/api/circles/" +
                          circle.id +
                          "/members/" +
                          removeMember.ownerId +
                          "/remove",
                      );
                      setModal(null);
                    }, "Member removed from the circle.")
                  }
                >
                  Remove member
                </button>
              </div>
            </>
          )}
          {modal === "revoke" && revokeBot && (
            <>
              <p className="muted" style={{ marginTop: 20 }}>
                Disconnect {revokeBot.name} from your workspace? Its hub
                credential will stop working and outstanding assignments will
                fail. You can pair it again with a new code.
              </p>
              <p className="native-note">
                This cannot stop actions already running in its native
                environment.
              </p>
              <div className="modal-actions">
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Keep connected
                </button>
                <button
                  className="button button-dark button-danger"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await mutation("/api/bots/" + revokeBot.id + "/revoke");
                      setModal(null);
                    }, "Bot disconnected.")
                  }
                >
                  <Unplug size={16} /> Disconnect bot
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
