"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HubError, hub, readableError, type Session } from "@/lib/hub-api";
import { ageLabel, sourceLabel, storageKey } from "./_lib/format";
import { DEMO_LABEL, DEMO_REPLAY, demoSnapshot } from "./_lib/demo";
import type { BotActivitySnapshot, MotionMode, SyncState } from "./_lib/types";
import "./bot-activity.css";

export default function BotActivityPage() {
  const [demoRequested, setDemoRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BotActivitySnapshot | null>(null);
  const [sync, setSync] = useState<SyncState>("live");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [motion, setMotion] = useState<MotionMode>("normal");
  const [replayOpen, setReplayOpen] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setMotion("reduced");
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      setDemoRequested(true);
      setSnapshot(demoSnapshot());
      setSync("demo");
    }
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    if (demoRequested) return;
    try {
      const nextSession = await hub<Session>("/api/session");
      if (!nextSession.authenticated) {
        setError("Sign in to observe your own bots.");
        setSync("error");
        return;
      }
      const saved = nextSession.owner && window.localStorage.getItem(storageKey(nextSession.owner.id, "botIds"));
      const next = await hub<BotActivitySnapshot>("/api/bot-activity" + (saved ? `?botIds=${encodeURIComponent(saved)}` : ""));
      setSnapshot(next);
      setError("");
      setSync("live");
      setSelectedId((current) => current ?? next.stations[0]?.botId ?? null);
    } catch (failure) {
      if (failure instanceof HubError && [401, 403].includes(failure.status)) setSnapshot(null);
      setError(readableError(failure));
      setSync("error");
    }
  }, [demoRequested]);

  useEffect(() => {
    if (!ready || demoRequested) return;
    void load();
  }, [load, ready, demoRequested]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const selected = snapshot?.stations.find((station) => station.botId === selectedId) ?? null;
  const replayItems = snapshot?.ownerId === "demo-owner" ? DEMO_REPLAY : (snapshot?.recentEvents ?? []).map((event) => ({
    title: event.title,
    detail: `${sourceLabel(event.source)} · ${event.kind}`,
    at: event.recordedAt,
    source: event.source,
  }));

  return (
    <main className={`clubhouse motion-${motion}`}>
      <header className="club-header">
        <div>
          <p className="club-kicker">Bot Observatory</p>
          <h1>Clubhouse</h1>
        </div>
        <p>{sync === "demo" ? DEMO_LABEL : snapshot?.coverage.text ?? "No observation yet."}</p>
        <div className="club-controls">
          <label>
            Appearance
            <select value={motion} onChange={(event) => setMotion(event.target.value as MotionMode)}>
              <option value="normal">Normal motion</option>
              <option value="reduced">Reduced motion</option>
              <option value="static">Static</option>
            </select>
          </label>
          <Link href="/workspace/">Return to workspace</Link>
        </div>
      </header>
      {error && <p className="club-banner" role="status">{error}</p>}
      {sync === "demo" && <p className="club-banner" role="status">{DEMO_LABEL}. Cannot claim work.</p>}
      {snapshot && snapshot.stations.length === 0 && (
        <section className="club-empty">
          <h2>No paired bots in this view</h2>
          <Link href="/workspace/?view=bots">Open My Bots</Link>
        </section>
      )}
      {snapshot && snapshot.stations.length > 0 && (
        <section className="club-scene" aria-label="Bot stations">
          {Array.from({ length: 10 }, (_, slot) => {
            const station = snapshot.stations.find((item) => item.slot === slot);
            return (
              <article key={station?.botId ?? `empty-${slot}`} className={`station${station ? "" : " is-empty"}`}>
                {station ? (
                  <button type="button" onClick={() => setSelectedId(station.botId)}>
                    <BotGlyph role={station.role} paused={station.adminState !== "active"} />
                    <span>Slot {slot + 1}</span>
                    <h2>{station.name}</h2>
                    <p>{station.assignment ? `Assignment: ${station.assignment.missionTitle}` : "No known hub assignment"}</p>
                    <p className="station-result">{station.lastResult?.statusLabel ?? station.coverageWarning}</p>
                    {station.attention[0] && <p className="station-need">Needs you: {station.attention[0].title}</p>}
                  </button>
                ) : (
                  <p>Slot {slot + 1} · Unoccupied</p>
                )}
              </article>
            );
          })}
        </section>
      )}
      {snapshot && (
        <section className="club-events">
          <div className="club-events-head">
            <h2>Recent recorded events</h2>
            <button type="button" onClick={() => setReplayOpen(true)}>Show what happened</button>
          </div>
          <ol>
            {snapshot.recentEvents.slice(0, 8).map((event) => (
              <li key={event.eventId}>
                <strong>{event.title}</strong>
                <span> {sourceLabel(event.source)} · {ageLabel(event.recordedAt, clock)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {selected && (
        <aside className="club-inspector">
          <p className="club-kicker">Selected station</p>
          <h2>{selected.name}</h2>
          <p>{selected.role} · {selected.adminState}</p>
          <p>{selected.lastActivityTitle ?? "Current activity unknown"}</p>
          <p>Last check-in: {selected.lastCheckInAt ? `${ageLabel(selected.lastCheckInAt, clock)} · not evidence of work` : "none"}</p>
        </aside>
      )}
      {replayOpen && (
        <dialog className="club-dialog" open onClose={() => setReplayOpen(false)}>
          <p className="club-kicker">REPLAY · historical</p>
          {replayItems.map((item) => (
            <p key={item.at}><strong>{item.title}</strong><br />{item.detail} · {item.at}</p>
          ))}
          <button type="button" onClick={() => setReplayOpen(false)}>Exit replay</button>
        </dialog>
      )}
    </main>
  );
}

function BotGlyph({ role, paused }: { role: "scout" | "delegate"; paused: boolean }) {
  const accent = role === "scout" ? "#7ee0c6" : "#c4b5fd";
  return (
    <svg viewBox="0 0 80 110" className="bot-glyph" aria-hidden="true">
      <rect x="18" y="28" width="44" height="52" rx="14" fill={accent} opacity={paused ? 0.45 : 0.9} />
      <circle cx="40" cy="20" r="12" fill={accent} />
      <rect x="28" y="80" width="10" height="22" rx="4" fill={accent} />
      <rect x="42" y="80" width="10" height="22" rx="4" fill={accent} />
    </svg>
  );
}
