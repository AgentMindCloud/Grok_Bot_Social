"use client";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Copy, Pause, Play, Plus, RefreshCw, ShieldCheck, Unplug, Users } from "lucide-react";
import Modal from "@/components/Modal";
import { hub, HubError, readableError, when, type Workspace, type Bot, type Mission, type Evidence, type Approval, type Circle } from "@/lib/hub-api";
import { useWorkspace } from "../_hooks/useWorkspace";
import { Empty, EvidenceNote } from "./WorkspacePrimitives";
export type ManagementAction = "pair" | "mission" | "evidence" | "join";
export function ManagementPanel({tab,request,onMissionCreated}:{tab:string;request:{kind:ManagementAction;sequence:number}|null;onMissionCreated:()=>void}) {
const {summary,session,mutate,refresh,setError,error,setNotice}=useWorkspace();
const [busy,setBusy]=useState(false);
const data:Workspace = {owner:summary!.owner,bots:summary!.bots,circles:summary!.circles,missions:[],evidence:[],approvals:[],events:[]};
const activeBots=data.bots.filter(bot=>bot.status!=="revoked");
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

const mutation=(path:string,body:unknown={})=>mutate(path,body);
async function act(action:()=>Promise<unknown>,message?:string){if(busy)return false;setBusy(true);setError("");try{await action();await refresh();setCircleRevision(value=>value+1);if(message)setNotice(message);return true;}catch(failure){setError(readableError(failure));return false;}finally{setBusy(false);}}
function open(which:typeof modal){setError("");setNotice("");setModal(which);setCopied(false);if(which==="pair")setPairing(null);if(which==="invite")setInvite(null);}
useEffect(()=>{if(request)open(request.kind);},[request?.sequence]);
function navigate(_:string){onMissionCreated();}
function selectCircle(item:Circle){setCircle(item);setCircleContent(null);setError("");setCircleRevision(value=>value+1);}
const approvalEvidence=approval?data.evidence.find(item=>item.id===approval.evidenceId):undefined;
const nativeConnectionAvailable=!session!.localLoginEnabled&&typeof window!=="undefined"&&window.location.protocol==="https:"&&!["localhost","127.0.0.1","[::1]"].includes(window.location.hostname);
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

return <>
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
                            "Connect yourself as my dedicated GrokBot Social " +
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
                          csrf: session!.csrfToken,
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
                          csrf: session!.csrfToken,
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
</>;
}
