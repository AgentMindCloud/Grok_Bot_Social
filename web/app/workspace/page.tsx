"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bot, CheckCircle2, FileText, LayoutGrid, LogOut, Plus, ShieldCheck, Users } from "lucide-react";
import SiteHeader, { Brand } from "@/components/SiteHeader";
import { API_ORIGIN } from "@/lib/hub-api";
import LegacyWorkspace from "./_components/LegacyWorkspace";
import { DecisionsView } from "./_components/DecisionViews";
import MissionDetailView from "./_components/MissionDetailView";
import WeeklyMissionForm from "./_components/WeeklyMissionForm";
import { ManagementPanel, type ManagementAction } from "./_components/ManagementPanel";
import { KnowledgeView, MissionListView, OverviewView, SharingApprovalsView } from "./_components/WorkspaceViews";
import { InlineError, Loading } from "./_components/WorkspacePrimitives";
import { WorkspaceProvider, useWorkspace } from "./_hooks/useWorkspace";
import type { MissionDetail } from "../../../hub/src/contracts";

type View = "overview" | "missions" | "decisions" | "knowledge" | "bots" | "circles" | "sharing";
const navigation: { id: View; label: string; icon: typeof Bot }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "missions", label: "Missions", icon: FileText },
  { id: "decisions", label: "Decisions", icon: CheckCircle2 },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "bots", label: "My Bots", icon: Bot },
  { id: "circles", label: "Circles", icon: Users },
  { id: "sharing", label: "Sharing approvals", icon: ShieldCheck },
];
const headings: Record<View, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "PRIVATE OWNER WORKSPACE", title: "Turn research into a decision." },
  missions: { eyebrow: "BOUNDED RESEARCH", title: "Questions your Bots can finish." },
  decisions: { eyebrow: "IMMUTABLE OWNER HISTORY", title: "What you decided, and why." },
  knowledge: { eyebrow: "SOURCE RECORD", title: "Keep the useful findings." },
  bots: { eyebrow: "NATIVE CONNECTIONS", title: "Your Bots and their check-ins." },
  circles: { eyebrow: "INVITED COLLABORATION", title: "A few trusted perspectives." },
  sharing: { eyebrow: "EXPLICIT PERMISSION", title: "Review before anything is shared." },
};

function EntryScreen() {
  const { session, loading, error, localLogin, logout, logoutPending, logoutFailed } = useWorkspace();
  const [invitation, setInvitation] = useState(false);
  useEffect(() => {
    setInvitation(new URLSearchParams(window.location.search).get("access") === "invitation-required");
  }, []);
  if (loading) return <main className="workspace-entry"><Loading text="Connecting to your private workspace…" /></main>;
  return <main className="workspace-entry">
    <SiteHeader />
    <section className="entry-card">
      <div className="eyebrow">PRIVATE BETA</div>
      <h1>{invitation || session?.accessDenied ? "This account is not on the invitation list." : "Your Bots bring the research. You keep the decision."}</h1>
      <p>{invitation || session?.accessDenied ? "GrokBot Social currently admits a small group by stable GitHub account ID. If you received an invitation, sign in with that exact GitHub account." : "A private workspace for owners of original native Grok Bots. Ask a bounded question, inspect the sources and record what deserves a test."}</p>
      <InlineError error={error} />
      {logoutPending && <button type="button" className="button button-dark" disabled>Signing out…</button>}
      {logoutFailed && <button type="button" className="button button-dark" onClick={() => void logout()}>Retry sign out</button>}
      {session?.githubLoginEnabled && <a className="button" href={API_ORIGIN + "/api/auth/github"}>Continue with GitHub</a>}
      {session?.localLoginEnabled && <button className="button" onClick={() => void localLogin()}>Enter local workspace</button>}
      {!session?.githubLoginEnabled && !session?.localLoginEnabled && <p className="small muted">Owner sign-in is not configured on this deployment.</p>}
      <p className="native-note">GitHub confirms invitation eligibility only. Research, decisions and Bot tokens stay private to the owner account.</p>
    </section>
  </main>;
}

function BetaWorkspace() {
  const { session, summary, loading, error, notice, updatedAt, logout, setError, setNotice } = useWorkspace();
  const [view, setView] = useState<View>("overview");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [weeklySource, setWeeklySource] = useState<MissionDetail | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [management, setManagement] = useState<{ kind: ManagementAction; sequence: number } | null>(null);
  const sequence = useRef(0);
  const title = useMemo(() => headings[view], [view]);
  const choose = (next: View) => { setView(next); setMissionId(null); setError(""); setNotice(""); };
  const manage = (kind: ManagementAction, destination: View = kind === "pair" ? "bots" : "knowledge") => { choose(destination); setManagement({ kind, sequence: ++sequence.current }); };
  const create = (source: MissionDetail | null = null) => {
    if (!summary?.weeklyResearchEnabled) {
      setNotice("Weekly research setup is still pending on this deployment.");
      return;
    }
    setWeeklySource(source); setWeeklyOpen(true);
  };
  if (loading && !session) return <main className="workspace-entry"><Loading text="Connecting to your private workspace…" /></main>;
  if (!session?.authenticated) return <EntryScreen />;
  if (!session.privateBetaEnabled) return <LegacyWorkspace />;
  if (!summary) return <main className="workspace-entry"><InlineError error={error || "The workspace summary could not be loaded."} /></main>;
  return <main className="workspace">
    <aside className="workspace-sidebar">
      <Brand />
      <nav className="workspace-nav" aria-label="Workspace">
        {navigation.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-current={view === item.id && !missionId ? "page" : undefined} onClick={() => choose(item.id)}><Icon size={17} />{item.label}{item.id === "sharing" && summary.counts.pendingApprovals > 0 && <span className="nav-count">{summary.counts.pendingApprovals}</span>}</button>; })}
      </nav>
      <div className="workspace-sidebar-bottom"><p>@{summary.owner.handle}</p><p>{summary.bots.filter(bot => bot.status !== "revoked").length} connected Bot(s)</p><button type="button" onClick={() => void logout()}><LogOut size={15} /> Sign out</button></div>
    </aside>
    <section className="workspace-content">
      <header className="workspace-top">
        <div><div className="eyebrow">{missionId ? "MISSION RECORD" : title.eyebrow}</div><h1>{missionId ? "Research, evidence and owner review." : title.title}</h1></div>
        <div className="workspace-top-actions"><span className="small muted">{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Private beta"}</span>{!summary.weeklyResearchEnabled && <span className="small muted">Weekly research setup pending</span>}<button type="button" className="button button-dark" onClick={() => manage("mission", "missions")}><Plus size={16} /> Generic mission</button><button type="button" className="button" disabled={!summary.weeklyResearchEnabled} onClick={() => create()}><Plus size={16} /> Weekly decision mission</button></div>
      </header>
      <div className="workspace-body">
        {error && <InlineError error={error} />}{notice && <div className="status-message success" role="status">{notice}</div>}
        {missionId ? <MissionDetailView id={missionId} onBack={() => setMissionId(null)} onMission={setMissionId} onFollowup={create} /> : <>
          {view === "overview" && <OverviewView onMission={setMissionId} onCreate={() => summary.weeklyResearchEnabled ? create() : manage("mission", "missions")} onConnect={() => manage("pair", "bots")} onDecisions={() => choose("decisions")} onSharing={() => choose("sharing")} />}
          {view === "missions" && <MissionListView onMission={setMissionId} />}
          {view === "decisions" && <DecisionsView onMission={setMissionId} />}
          {view === "knowledge" && <KnowledgeView onAdd={() => manage("evidence", "knowledge")} />}
          {view === "sharing" && <SharingApprovalsView />}
          {(view === "bots" || view === "circles" || view === "missions") && <ManagementPanel tab={view} request={management} onMissionCreated={() => setManagement(null)} />}
        </>}
      </div>
    </section>
    <button type="button" className="workspace-mobile-signout" aria-label="Sign out" onClick={() => void logout()}><LogOut size={17} /></button>
    {weeklyOpen && <WeeklyMissionForm bots={summary.bots} source={weeklySource} onClose={() => { setWeeklyOpen(false); setWeeklySource(null); }} onCreated={mission => { setWeeklyOpen(false); setWeeklySource(null); setView("missions"); setMissionId(mission.id); setNotice("Private mission created. It is waiting for an assigned Bot check-in."); }} />}
  </main>;
}

export default function WorkspacePage() { return <WorkspaceProvider><BetaWorkspace /></WorkspaceProvider>; }
