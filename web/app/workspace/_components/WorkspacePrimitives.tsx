"use client";
import { ArrowRight, Bot as BotIcon, ChevronRight } from "lucide-react";
import { when, type Evidence, type Mission } from "@/lib/hub-api";

export function Empty({ title, text, action, onAction, icon: Icon = BotIcon }: {
  title: string; text: string; action?: string; onAction?: () => void; icon?: typeof BotIcon;
}) {
  return <div className="empty-state"><Icon size={29} aria-hidden="true" /><h3>{title}</h3><p>{text}</p>{action && <button type="button" className="button button-dark" onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>;
}
export function EvidenceNote({ item }: { item: Evidence }) {
  return <article className="evidence-card">
    <div className="evidence-meta"><span className={"tag " + (item.visibility === "private" ? "muted" : "")}>{item.visibility === "private" ? "Private" : "Shared with circle"}</span><time dateTime={item.createdAt}>{when(item.createdAt)}</time></div>
    <h3>{item.title}</h3><p className="evidence-plain-text">{item.summary}</p>
    <ul className="source-list">{item.sources?.map((source, index) => <li key={source.url + index}><a href={/^https:\/\//i.test(source.url) ? source.url : undefined} target="_blank" rel="noopener noreferrer">{source.title || source.url} ↗</a>{source.accessedAt && <span className="small muted"> · Accessed {when(source.accessedAt)}</span>}</li>)}</ul>
  </article>;
}
export function MissionRows({ items, onSelect }: { items: Mission[]; onSelect: (mission: Mission) => void }) {
  const statusLabel: Record<Mission["status"], string> = { queued: "Waiting for check-in", running: "Research in progress", completed: "Results delivered", failed: "Failed", cancelled: "Cancelled" };
  return <>{items.map(item => <button type="button" className="mission-row" key={item.id} onClick={() => onSelect(item)}><div><strong>{item.title}</strong><p>{item.visibility === "private" ? "Private mission" : "Circle mission"} · {when(item.createdAt)}</p></div><span className={"tag " + (["queued", "running"].includes(item.status) ? "pending" : "muted")}>{statusLabel[item.status]}</span><ChevronRight size={16} aria-hidden="true" /></button>)}</>;
}
export function Loading({ text = "Loading your work…" }: { text?: string }) {
  return <div className="workspace-loading" role="status"><div className="loading-line" aria-hidden="true" /><p className="small muted">{text}</p></div>;
}
export function LoadMore({ more, loading, onLoad, count }: { more: boolean; loading: boolean; onLoad: () => void; count: number }) {
  return <div className="page-controls"><p className="small muted" role="status">{count} loaded{more ? " · more available" : ""}</p>{more && <button type="button" className="button button-dark button-small" disabled={loading} onClick={onLoad}>{loading ? "Loading…" : "Load more"}</button>}</div>;
}
export function InlineError({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <div className="status-message error" role="alert"><p>{error}</p>{retry && <button type="button" className="quiet-button" onClick={retry}>Try again</button>}</div> : null;
}
