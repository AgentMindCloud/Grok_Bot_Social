"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  CheckCircle2,
  FileText,
  LayoutGrid,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import SiteHeader, { Brand } from "@/components/SiteHeader";
import SignInPanel from "@/components/SignInPanel";
import ConnectionGuide from "@/components/ConnectionGuide";
import { GlassButton } from "@/components/GlassControl";
import AccountPanel from "./_components/AccountPanel";
import LegacyWorkspace from "./_components/LegacyWorkspace";
import { DecisionsView } from "./_components/DecisionViews";
import MissionDetailView from "./_components/MissionDetailView";
import WeeklyMissionForm from "./_components/WeeklyMissionForm";
import {
  ManagementPanel,
  type ManagementAction,
} from "./_components/ManagementPanel";
import {
  KnowledgeView,
  MissionListView,
  OverviewView,
  SharingApprovalsView,
} from "./_components/WorkspaceViews";
import { InlineError, Loading } from "./_components/WorkspacePrimitives";
import { WorkspaceProvider, useWorkspace } from "./_hooks/useWorkspace";
import type { MissionDetail } from "../../../hub/src/contracts";

type View =
  | "overview"
  | "missions"
  | "decisions"
  | "knowledge"
  | "bots"
  | "circles"
  | "sharing"
  | "account";
const navigation: { id: View; label: string; icon: typeof Bot }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "missions", label: "Missions", icon: FileText },
  { id: "decisions", label: "Decisions", icon: CheckCircle2 },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "bots", label: "My Bots", icon: Bot },
  { id: "circles", label: "Circles", icon: Users },
  { id: "sharing", label: "Sharing approvals", icon: ShieldCheck },
  { id: "account", label: "Account & limits", icon: Settings2 },
];
const headings: Record<View, { eyebrow: string; title: string }> = {
  overview: {
    eyebrow: "PRIVATE OWNER WORKSPACE",
    title: "Turn research into a decision.",
  },
  missions: {
    eyebrow: "BOUNDED RESEARCH",
    title: "Questions your Bots can finish.",
  },
  decisions: {
    eyebrow: "IMMUTABLE OWNER HISTORY",
    title: "What you decided, and why.",
  },
  knowledge: { eyebrow: "SOURCE RECORD", title: "Keep the useful findings." },
  bots: {
    eyebrow: "NATIVE CONNECTIONS",
    title: "Your Bots and their check-ins.",
  },
  circles: {
    eyebrow: "INVITED COLLABORATION",
    title: "A few trusted perspectives.",
  },
  sharing: {
    eyebrow: "EXPLICIT PERMISSION",
    title: "Review before anything is shared.",
  },
  account: { eyebrow: "YOUR ACCOUNT", title: "Access, limits and your data." },
};

function EntryScreen() {
  const {
    session,
    loading,
    error,
    localLogin,
    logout,
    logoutPending,
    logoutFailed,
    load,
  } = useWorkspace();
  if (loading)
    return (
      <main className="workspace-entry">
        <Loading text="Connecting to your private workspace…" />
      </main>
    );
  return (
    <div className="workspace-entry">
      <SiteHeader />
      <main id="main" className="entry-card">
        <SignInPanel
          session={session}
          error={error}
          localLogin={() => void localLogin()}
        />
        {!session && error && (
          <GlassButton onClick={() => void load()}>
            Retry workspace connection
          </GlassButton>
        )}
        {logoutPending && (
          <button type="button" className="button button-dark" disabled>
            Signing out…
          </button>
        )}
        {logoutFailed && (
          <button
            type="button"
            className="button button-dark"
            onClick={() => void logout()}
          >
            Retry sign out
          </button>
        )}
      </main>
    </div>
  );
}

function BetaWorkspace() {
  const {
    session,
    summary,
    loading,
    refreshing,
    error,
    notice,
    updatedAt,
    logout,
    refresh,
    setError,
    setNotice,
  } = useWorkspace();
  const [view, setView] = useState<View>("overview");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [weeklySource, setWeeklySource] = useState<MissionDetail | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [management, setManagement] = useState<{
    kind: ManagementAction;
    sequence: number;
  } | null>(null);
  const sequence = useRef(0);
  const initialQuestion = useRef(false);
  const title = useMemo(() => headings[view], [view]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      const requestedView = query.get("view");
      const requestedMission = query.get("mission");
      setView(
        navigation.some((item) => item.id === requestedView)
          ? (requestedView as View)
          : "overview",
      );
      setMissionId(
        requestedMission && /^[0-9a-f-]{36}$/i.test(requestedMission)
          ? requestedMission
          : null,
      );
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [session?.authenticated]);
  useEffect(() => {
    if (session?.authenticated) return;
    setView("overview");
    setMissionId(null);
    setWeeklySource(null);
    setWeeklyOpen(false);
    setManagement(null);
  }, [session?.authenticated, session?.accessDenied]);
  const navigate = (next: View, mission: string | null = null) => {
    const query = new URLSearchParams({ view: next });
    if (mission) query.set("mission", mission);
    window.history.pushState(null, "", `/workspace/?${query}`);
    setView(next);
    setMissionId(mission);
    setError("");
    setNotice("");
  };
  const choose = (next: View) => navigate(next);
  const openMission = (id: string) => navigate("missions", id);
  const manage = (
    kind: ManagementAction,
    destination: View = kind === "pair" ? "bots" : "knowledge",
  ) => {
    choose(destination);
    setManagement({ kind, sequence: ++sequence.current });
  };
  const create = (source: MissionDetail | null = null) => {
    if (!summary?.weeklyResearchEnabled) {
      setNotice("Weekly research setup is still pending on this deployment.");
      return;
    }
    setWeeklySource(source);
    setWeeklyOpen(true);
  };
  useEffect(() => {
    if (
      !summary ||
      initialQuestion.current ||
      new URLSearchParams(window.location.search).get("new") !== "question"
    )
      return;
    initialQuestion.current = true;
    if (
      summary.bots.some((bot) => bot.status === "active" && bot.lastSeenAt) &&
      summary.weeklyResearchEnabled
    )
      setWeeklyOpen(true);
    else {
      setView("bots");
      setNotice(
        "Connect your Bot and confirm its first check-in, then start your question.",
      );
    }
  }, [summary, setNotice]);
  if (loading && !session)
    return (
      <main className="workspace-entry">
        <Loading text="Connecting to your private workspace…" />
      </main>
    );
  if (!session?.authenticated) return <EntryScreen />;
  if (!(session.workspaceEnabled ?? session.privateBetaEnabled))
    return <LegacyWorkspace />;
  if (!summary)
    return (
      <main className="workspace-entry">
        {loading || refreshing ? (
          <Loading text="Loading your workspace…" />
        ) : (
          <InlineError
            error={error || "The workspace summary could not be loaded."}
            retry={() => void refresh()}
          />
        )}
      </main>
    );
  return (
    <main className="workspace">
      <aside className="workspace-sidebar">
        <Brand />
        <nav className="workspace-nav" aria-label="Workspace">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                aria-current={
                  view === item.id && !missionId ? "page" : undefined
                }
                onClick={() => choose(item.id)}
              >
                <Icon size={17} />
                {item.label}
                {item.id === "sharing" &&
                  summary.counts.pendingApprovals > 0 && (
                    <span className="nav-count">
                      {summary.counts.pendingApprovals}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>
        <div className="workspace-sidebar-bottom">
          <p>@{summary.owner.handle}</p>
          <p>
            {summary.bots.filter((bot) => bot.status !== "revoked").length}{" "}
            connected Bot(s)
          </p>
          <button type="button" onClick={() => void logout()}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <section className="workspace-content" id="main">
        <header className="workspace-top">
          <div>
            <div className="eyebrow">
              {missionId ? "MISSION RECORD" : title.eyebrow}
            </div>
            <h1>
              {missionId ? "Research, evidence and owner review." : title.title}
            </h1>
          </div>
          <div className="workspace-top-actions">
            <span className="small muted">
              {updatedAt
                ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Private workspace"}
            </span>
            {!summary.weeklyResearchEnabled && (
              <span className="small muted">New question setup pending</span>
            )}
            <GlassButton
              disabled={!summary.weeklyResearchEnabled}
              onClick={() => create()}
            >
              <Plus size={16} /> New question
            </GlassButton>
          </div>
        </header>
        <div className="workspace-body">
          {error && <InlineError error={error} />}
          {notice && (
            <div className="status-message success" role="status">
              {notice}
            </div>
          )}
          {missionId ? (
            <MissionDetailView
              key={missionId}
              id={missionId}
              onBack={() => navigate("missions")}
              onMission={openMission}
              onFollowup={create}
            />
          ) : (
            <>
              {view === "overview" && (
                <OverviewView
                  onMission={openMission}
                  onCreate={() => create()}
                  onConnect={() => choose("bots")}
                  onDecisions={() => choose("decisions")}
                  onSharing={() => choose("sharing")}
                />
              )}
              {view === "missions" && (
                <>
                  <MissionListView onMission={openMission} />
                  <details className="workspace-advanced">
                    <summary>Advanced · generic or circle mission</summary>
                    <p>
                      A separate workflow for optional collaboration. Weekly
                      question evidence remains private.
                    </p>
                    <button
                      type="button"
                      className="button button-dark"
                      onClick={() => manage("mission", "missions")}
                    >
                      Create a generic mission
                    </button>
                  </details>
                </>
              )}
              {view === "decisions" && (
                <DecisionsView onMission={openMission} />
              )}
              {view === "knowledge" && (
                <KnowledgeView onAdd={() => manage("evidence", "knowledge")} />
              )}
              {view === "sharing" && <SharingApprovalsView />}
              {view === "account" && <AccountPanel />}
              {view === "bots" && <ConnectionGuide compact />}
              {(view === "bots" ||
                view === "circles" ||
                view === "missions") && (
                <ManagementPanel
                  tab={view}
                  request={management}
                  onMissionCreated={() => setManagement(null)}
                />
              )}
            </>
          )}
        </div>
      </section>
      <button
        type="button"
        className="workspace-mobile-signout"
        aria-label="Sign out"
        onClick={() => void logout()}
      >
        <LogOut size={17} />
      </button>
      {weeklyOpen && (
        <WeeklyMissionForm
          bots={summary.bots}
          source={weeklySource}
          onClose={() => {
            setWeeklyOpen(false);
            setWeeklySource(null);
          }}
          onCreated={(mission) => {
            setWeeklyOpen(false);
            setWeeklySource(null);
            openMission(mission.id);
            setNotice(
              "Private mission created. It is waiting for an assigned Bot check-in.",
            );
          }}
        />
      )}
    </main>
  );
}

export default function WorkspacePage() {
  return (
    <WorkspaceProvider>
      <BetaWorkspace />
    </WorkspaceProvider>
  );
}
