"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, History } from "lucide-react";
import Modal from "@/components/Modal";
import { API_ORIGIN, HubError, readableError, when, type Evidence } from "@/lib/hub-api";
import type { Assistance, MissionDetail, OwnerReview, ReviewDecision, ReviewInput, Usefulness } from "../../../../hub/src/contracts";
import { dateInSevenDays, reviewDateToIso } from "../_lib/weekly-form";
import { useWorkspace } from "../_hooks/useWorkspace";
import { usePages } from "../_hooks/useResource";
import { Empty, EvidenceNote, InlineError, LoadMore, Loading } from "./WorkspacePrimitives";

export const decisionLabel: Record<ReviewDecision, string> = { test: "Test an idea", watch: "Keep watching", stop: "Stop pursuing" };
export const usefulnessLabel: Record<Usefulness, string> = { useful: "Useful", partly_useful: "Partly useful", not_useful: "Not useful", not_assessed: "Not assessed" };
export function ExportDecision({ review }: { review: OwnerReview }) {
  const { invalidate } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const download = async (format: "markdown" | "json") => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API_ORIGIN}/api/decisions/${encodeURIComponent(review.id)}/export?format=${format}`, { credentials: "include", signal: AbortSignal.timeout(12000), headers: { Accept: format === "json" ? "application/json" : "text/markdown" } });
      if (!response.ok) { if (response.status === 401) invalidate(); throw new Error(response.status === 403 || response.status === 404 ? "This decision is no longer available to export." : "Export could not be completed. Try again."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `decision-${review.id}-v${review.version}.${format === "json" ? "json" : "md"}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : readableError(failure)); }
    finally { setBusy(false); }
  };
  return <div><div className="decision-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => void download("markdown")}><Download size={15} /> Markdown</button><button type="button" className="quiet-button" disabled={busy} onClick={() => void download("json")}><Download size={15} /> JSON</button></div>{error && <p className="input-error" role="alert">{error}</p>}</div>;
}
export function DecisionCard({ review, onMission, compact = false }: { review: OwnerReview; onMission?: (id: string) => void; compact?: boolean }) {
  return <article className="panel decision-card"><div className="evidence-meta"><span className="tag">{decisionLabel[review.decision]}</span><span>Version {review.version} · Private</span><time dateTime={review.createdAt}>{when(review.createdAt)}</time></div><p className="decision-rationale">{review.rationale}</p><div className="decision-facts"><span>Research: {usefulnessLabel[review.usefulness]}</span><span>Assistance: {review.assistance.replaceAll("_", " ")}</span><span>{review.nextReviewAt ? `Review date: ${when(review.nextReviewAt)}` : "No next review date"}</span></div>{!compact && <><details><summary>{review.citations.length} cited finding{review.citations.length === 1 ? "" : "s"}</summary>{review.citations.length ? review.citations.map((citation, index) => citation.available ? <EvidenceNote key={index} item={citation.evidence} /> : <p key={index} className="native-note">A cited finding is no longer accessible. Its contents and identifying details are withheld.</p>) : <p className="small muted">No evidence was cited in this version.</p>}</details><ExportDecision review={review} /></>}{onMission && <button type="button" className="quiet-button" onClick={() => onMission(review.missionId)}>Open source mission <ArrowRight size={15} /></button>}</article>;
}
export function DecisionsView({ onMission }: { onMission: (id: string) => void }) {
  const list = usePages<OwnerReview>("/api/decisions");
  return <><p className="muted">Your decisions, in order. Every revision stays in history. Choosing a next review date does not schedule a Bot or create a mission.</p><InlineError error={list.error} retry={list.reload} />{list.loading && !list.items.length ? <Loading text="Loading your decision history…" /> : !list.items.length && !list.error ? <Empty title="Your first decision starts with evidence." text="Complete a mission, inspect the sources and record whether to test an idea, keep watching or stop pursuing it." icon={History} /> : list.items.map(review => <DecisionCard key={review.id} review={review} onMission={onMission} />)}<LoadMore more={list.more} count={list.items.length} loading={list.loading} onLoad={list.loadMore} /></>;
}
export function ReviewHistory({ missionId }: { missionId: string }) {
  const list = usePages<OwnerReview>(`/api/decisions?missionId=${encodeURIComponent(missionId)}`);
  return <><InlineError error={list.error} retry={list.reload} />{list.loading && !list.items.length ? <Loading text="Loading decision versions…" /> : list.items.map(review => <DecisionCard key={review.id} review={review} />)}<LoadMore more={list.more} count={list.items.length} loading={list.loading} onLoad={list.loadMore} /></>;
}
export function ReviewForm({ detail, evidence, onClose, onSaved, reload }: { detail: MissionDetail; evidence: Evidence[]; onClose: () => void; onSaved: () => void; reload: () => void }) {
  const { mutate } = useWorkspace(); const previous = detail.latestReview;
  const [expectedVersion, setExpectedVersion] = useState(previous?.version || 0);
  const [decision, setDecision] = useState<ReviewDecision>(previous?.decision || "watch"), [usefulness, setUsefulness] = useState<Usefulness>(previous?.usefulness || "not_assessed");
  const [rationale, setRationale] = useState(previous?.rationale || ""), [nextDate, setNextDate] = useState(previous?.nextReviewAt?.slice(0, 10) || dateInSevenDays());
  const [assistance, setAssistance] = useState<Assistance>(previous?.assistance || "unknown");
  const [evidenceIds, setEvidenceIds] = useState<string[]>(previous?.citations.flatMap(citation => citation.available ? [citation.evidence.id] : []) || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef<{ draft: string; key: string; reviewDurationSeconds: number } | null>(null);
  const timing = useRef<{ activeSince: number | null; elapsedMs: number }>({ activeSince: null, elapsedMs: 0 });
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      if (timing.current.activeSince !== null) timing.current.elapsedMs += now - timing.current.activeSince;
      timing.current.activeSince = document.visibilityState === "visible" ? now : null;
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      update();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const currentVersion = detail.latestReview?.version || 0; const stale = currentVersion !== expectedVersion;
  const available = [...evidence]; previous?.citations.forEach(citation => { if (citation.available && !available.some(item => item.id === citation.evidence.id)) available.push(citation.evidence); });
  const save = async () => {
    if (busy || stale) return; setError("");
    try {
      if (!rationale.trim()) throw new Error("Explain the decision in your own words.");
      const input = { expectedVersion, decision, usefulness, rationale: rationale.trim(), evidenceIds, nextReviewAt: reviewDateToIso(nextDate), assistance };
      const draft = JSON.stringify(input);
      if (!attempt.current || attempt.current.draft !== draft) {
        const elapsedMs = timing.current.elapsedMs + (timing.current.activeSince === null ? 0 : Date.now() - timing.current.activeSince);
        attempt.current = { draft, key: crypto.randomUUID(), reviewDurationSeconds: Math.max(1, Math.min(86400, Math.ceil(elapsedMs / 1000))) };
      }
      const body: ReviewInput = { ...input, reviewDurationSeconds: attempt.current.reviewDurationSeconds, idempotencyKey: attempt.current.key }; setBusy(true);
      await mutate(`/api/missions/${detail.mission.id}/reviews`, body); onSaved();
    } catch (failure) { setError((failure instanceof Error ? failure.message : readableError(failure)) + " Your draft is retained."); if (failure instanceof HubError && failure.status === 409) reload(); }
    finally { setBusy(false); }
  };
  return <Modal title={previous ? "Revise your decision" : "Record your decision"} busy={busy} onClose={() => { if (!busy && window.confirm("Discard this unsaved review draft?")) onClose(); }}>
    <p className="small muted">For “{detail.mission.title}”. This private review does not publish evidence or authorize an external experiment.</p>
    {error && <div className="status-message error" role="alert">{error}</div>}
    {stale && <div className="status-message error" role="alert"><p>A newer decision exists (version {currentVersion}). Your draft has not been overwritten.</p><p>{detail.latestReview?.rationale}</p><button className="button button-dark" type="button" onClick={() => { setExpectedVersion(currentVersion); setError(""); }}>I reviewed the latest version; keep my draft</button></div>}
    <form onSubmit={event => { event.preventDefault(); void save(); }}><label className="field">Decision<select value={decision} onChange={event => setDecision(event.target.value as ReviewDecision)}><option value="test">Test an idea</option><option value="watch">Keep watching</option><option value="stop">Stop pursuing</option></select></label><label className="field">Did the research help?<select value={usefulness} onChange={event => setUsefulness(event.target.value as Usefulness)}>{Object.entries(usefulnessLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field">Your rationale<textarea required maxLength={4000} value={rationale} onChange={event => setRationale(event.target.value)} placeholder="What will you do, or choose not to do, and why? What would change your mind?" /></label>
      <fieldset><legend>Cite the findings you used</legend><p className="small muted">Showing findings loaded in this mission view and accessible earlier citations. Load more findings before opening a review to cite an older result.</p>{available.map(item => <label key={item.id} className="checkbox-row"><input type="checkbox" checked={evidenceIds.includes(item.id)} onChange={event => setEvidenceIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />{item.title} · {item.visibility}</label>)}{!available.length && <p className="small muted">No accessible findings loaded. You can record a decision without citations.</p>}</fieldset>
      <label className="field">Next review date<input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} /><small>Suggested seven days from now, using your local date. This is a review reminder in your workspace, not a native schedule. Clear it if no follow-up is needed.</small></label><label className="field">Did someone assist with this work?<select value={assistance} onChange={event => setAssistance(event.target.value as Assistance)}><option value="unknown">Not recorded</option><option value="unassisted">I used the workflow without assistance</option><option value="assisted">Someone assisted me</option></select></label><div className="modal-actions"><button type="button" className="button button-dark" disabled={busy} onClick={() => { if (window.confirm("Discard this unsaved review draft?")) onClose(); }}>Cancel</button><button className="button" disabled={busy || stale}>{busy ? "Saving…" : previous ? "Save new decision version" : "Save decision"}</button></div>
    </form>
  </Modal>;
}
