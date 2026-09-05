"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Eye,
  FlaskConical,
  History,
  LockKeyhole,
  Search,
  Square,
} from "lucide-react";
import Modal from "@/components/Modal";
import { GlassButton } from "@/components/GlassControl";
import {
  API_ORIGIN,
  HubError,
  readableError,
  when,
  type Evidence,
} from "@/lib/hub-api";
import type {
  Assistance,
  MissionDetail,
  OwnerReview,
  ReviewDecision,
  ReviewInput,
  Usefulness,
} from "../../../../hub/src/contracts";
import { dateInSevenDays, reviewDateToIso } from "../_lib/weekly-form";
import { useWorkspace } from "../_hooks/useWorkspace";
import { usePages } from "../_hooks/useResource";
import {
  Empty,
  EvidenceNote,
  InlineError,
  LoadMore,
  Loading,
} from "./WorkspacePrimitives";
import "@/app/decision-controls.css";

export const decisionLabel: Record<ReviewDecision, string> = {
  test: "Test an idea",
  watch: "Keep watching",
  stop: "Stop pursuing",
};
export const usefulnessLabel: Record<Usefulness, string> = {
  useful: "Useful",
  partly_useful: "Partly useful",
  not_useful: "Not useful",
  not_assessed: "Not assessed",
};
export function ExportDecision({ review }: { review: OwnerReview }) {
  const { invalidate } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const download = async (format: "markdown" | "json") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API_ORIGIN}/api/decisions/${encodeURIComponent(review.id)}/export?format=${format}`,
        {
          credentials: "include",
          signal: AbortSignal.timeout(12000),
          headers: {
            Accept: format === "json" ? "application/json" : "text/markdown",
          },
        },
      );
      if (!response.ok) {
        if (response.status === 401) invalidate();
        throw new Error(
          response.status === 403 || response.status === 404
            ? "This decision is no longer available to export."
            : "Export could not be completed. Try again.",
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `decision-${review.id}-v${review.version}.${format === "json" ? "json" : "md"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : readableError(failure),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="decision-actions">
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={() => void download("markdown")}
        >
          <Download size={15} /> Markdown
        </button>
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={() => void download("json")}
        >
          <Download size={15} /> JSON
        </button>
      </div>
      {error && (
        <p className="input-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function DecisionCard({
  review,
  onMission,
  compact = false,
}: {
  review: OwnerReview;
  onMission?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <article className="panel decision-card">
      <div className="evidence-meta">
        <span className="tag">{decisionLabel[review.decision]}</span>
        <span>Version {review.version} · Private</span>
        <time dateTime={review.createdAt}>{when(review.createdAt)}</time>
      </div>
      <p className="decision-rationale">{review.rationale}</p>
      <div className="decision-facts">
        <span>Research: {usefulnessLabel[review.usefulness]}</span>
        <span>Assistance: {review.assistance.replaceAll("_", " ")}</span>
        <span>
          {review.nextReviewAt
            ? `Review date: ${when(review.nextReviewAt)}`
            : "No next review date"}
        </span>
      </div>
      {!compact && (
        <>
          <details>
            <summary>
              {review.citations.length} cited finding
              {review.citations.length === 1 ? "" : "s"}
            </summary>
            {review.citations.length ? (
              review.citations.map((citation, index) =>
                citation.available ? (
                  <EvidenceNote key={index} item={citation.evidence} />
                ) : (
                  <p key={index} className="native-note">
                    A cited finding is no longer accessible. Its contents and
                    identifying details are withheld.
                  </p>
                ),
              )
            ) : (
              <p className="small muted">
                No evidence was cited in this version.
              </p>
            )}
          </details>
          <ExportDecision review={review} />
        </>
      )}
      {onMission && (
        <button
          type="button"
          className="quiet-button"
          onClick={() => onMission(review.missionId)}
        >
          Open source mission <ArrowRight size={15} />
        </button>
      )}
    </article>
  );
}
export function DecisionsView({
  onMission,
}: {
  onMission: (id: string) => void;
}) {
  const list = usePages<OwnerReview>("/api/decisions");
  return (
    <>
      <p className="muted">
        Your decisions, in order. Every revision stays in history. Choosing a
        next review date does not schedule a Bot or create a mission.
      </p>
      <InlineError error={list.error} retry={list.reload} />
      {list.loading && !list.items.length ? (
        <Loading text="Loading your decision history…" />
      ) : !list.items.length && !list.error ? (
        <Empty
          title="Your first decision starts with evidence."
          text="Complete a mission, inspect the sources and record whether to test an idea, keep watching or stop pursuing it."
          icon={History}
        />
      ) : (
        list.items.map((review) => (
          <DecisionCard key={review.id} review={review} onMission={onMission} />
        ))
      )}
      <LoadMore
        more={list.more}
        count={list.items.length}
        loading={list.loading}
        onLoad={list.loadMore}
      />
    </>
  );
}
export function ReviewHistory({ missionId }: { missionId: string }) {
  const list = usePages<OwnerReview>(
    `/api/decisions?missionId=${encodeURIComponent(missionId)}`,
  );
  return (
    <>
      <InlineError error={list.error} retry={list.reload} />
      {list.loading && !list.items.length ? (
        <Loading text="Loading decision versions…" />
      ) : (
        list.items.map((review) => (
          <DecisionCard key={review.id} review={review} />
        ))
      )}
      <LoadMore
        more={list.more}
        count={list.items.length}
        loading={list.loading}
        onLoad={list.loadMore}
      />
    </>
  );
}
export function ReviewForm({
  detail,
  evidence,
  onClose,
  onSaved,
  reload,
}: {
  detail: MissionDetail;
  evidence: Evidence[];
  onClose: () => void;
  onSaved: () => void;
  reload: () => void;
}) {
  const { mutate } = useWorkspace();
  const previous = detail.latestReview;
  const [expectedVersion, setExpectedVersion] = useState(
    previous?.version || 0,
  );
  const [decision, setDecision] = useState<ReviewDecision | "">(
      previous?.decision || "",
    ),
    [usefulness, setUsefulness] = useState<Usefulness>(
      previous?.usefulness || "not_assessed",
    );
  const [rationale, setRationale] = useState(previous?.rationale || ""),
    [nextDate, setNextDate] = useState(
      previous?.nextReviewAt?.slice(0, 10) || dateInSevenDays(),
    );
  const [assistance, setAssistance] = useState<Assistance>(
    previous?.assistance || "unknown",
  );
  const [evidenceIds, setEvidenceIds] = useState<string[]>(
    previous?.citations.flatMap((citation) =>
      citation.available ? [citation.evidence.id] : [],
    ) || [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saving = useRef(false);
  const findings = usePages<Evidence>(
    `/api/evidence?missionId=${encodeURIComponent(detail.mission.id)}`,
  );
  const [search, setSearch] = useState("");
  const attempt = useRef<{
    draft: string;
    key: string;
    reviewDurationSeconds: number;
  } | null>(null);
  const timing = useRef<{ activeSince: number | null; elapsedMs: number }>({
    activeSince: null,
    elapsedMs: 0,
  });
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      if (timing.current.activeSince !== null)
        timing.current.elapsedMs += now - timing.current.activeSince;
      timing.current.activeSince =
        document.visibilityState === "visible" ? now : null;
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      update();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const currentVersion = detail.latestReview?.version || 0;
  const stale = currentVersion !== expectedVersion;
  const available = [...findings.items];
  evidence.forEach((item) => {
    if (!available.some((existing) => existing.id === item.id))
      available.push(item);
  });
  previous?.citations.forEach((citation) => {
    if (
      citation.available &&
      !available.some((item) => item.id === citation.evidence.id)
    )
      available.push(citation.evidence);
  });
  const query = search.trim().toLocaleLowerCase();
  const matching = available.filter(
    (item) =>
      !query ||
      [
        item.title,
        item.summary,
        ...item.sources.flatMap((source) => [source.title ?? "", source.url]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );
  const choices: {
    value: ReviewDecision;
    label: string;
    explanation: string;
    icon: typeof Eye;
  }[] = [
    {
      value: "test",
      label: "Test",
      explanation: "Record an experiment to consider.",
      icon: FlaskConical,
    },
    {
      value: "watch",
      label: "Watch",
      explanation: "Keep the question under review.",
      icon: Eye,
    },
    {
      value: "stop",
      label: "Stop",
      explanation: "Stop pursuing this idea.",
      icon: Square,
    },
  ];
  const save = async () => {
    if (saving.current || busy || stale) return;
    setError("");
    try {
      if (!decision)
        throw new Error("Choose Test, Watch or Stop to record your decision.");
      if (!rationale.trim())
        throw new Error("Explain the decision in your own words.");
      if (evidenceIds.length > 20)
        throw new Error("Choose up to twenty findings for this decision.");
      const input = {
        expectedVersion,
        decision,
        usefulness,
        rationale: rationale.trim(),
        evidenceIds,
        nextReviewAt: reviewDateToIso(nextDate),
        assistance,
      };
      const draft = JSON.stringify(input);
      if (!attempt.current || attempt.current.draft !== draft) {
        const elapsedMs =
          timing.current.elapsedMs +
          (timing.current.activeSince === null
            ? 0
            : Date.now() - timing.current.activeSince);
        attempt.current = {
          draft,
          key: crypto.randomUUID(),
          reviewDurationSeconds: Math.max(
            1,
            Math.min(86400, Math.ceil(elapsedMs / 1000)),
          ),
        };
      }
      const body: ReviewInput = {
        ...input,
        reviewDurationSeconds: attempt.current.reviewDurationSeconds,
        idempotencyKey: attempt.current.key,
      };
      saving.current = true;
      setBusy(true);
      await mutate(`/api/missions/${detail.mission.id}/reviews`, body);
      onSaved();
    } catch (failure) {
      setError(
        (failure instanceof Error ? failure.message : readableError(failure)) +
          " Your draft is retained.",
      );
      if (failure instanceof HubError && failure.status === 409) reload();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={previous ? "Revise your decision" : "Record your decision"}
      busy={busy}
      onClose={() => {
        if (!busy && window.confirm("Discard this unsaved review draft?"))
          onClose();
      }}
    >
      <div className="decision-review">
        <p className="decision-private-note">
          <LockKeyhole size={15} aria-hidden="true" />
          <span>
            Private decision for “{detail.mission.title}”. Recording a decision
            does not execute an experiment or publish evidence.
          </span>
        </p>
        {error && (
          <div className="status-message error" role="alert">
            {error}
          </div>
        )}
        {stale && (
          <div className="status-message error" role="alert">
            <p>
              A newer decision exists (version {currentVersion}). Your draft has
              not been overwritten.
            </p>
            <p>{detail.latestReview?.rationale}</p>
            <button
              className="button button-dark"
              type="button"
              onClick={() => {
                setExpectedVersion(currentVersion);
                setError("");
              }}
            >
              I reviewed the latest version; keep my draft
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="decision-choice-field" disabled={busy}>
            <legend>What is your next step?</legend>
            <div className="decision-tactile-options">
              {choices.map((item) => {
                const Icon = item.icon;
                return (
                  <label
                    key={item.value}
                    className={`decision-tactile-option ${decision === item.value ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="owner-decision"
                      value={item.value}
                      checked={decision === item.value}
                      onChange={() => setDecision(item.value)}
                      required
                    />
                    <Icon size={24} aria-hidden="true" />
                    <strong>{item.label}</strong>
                    {decision === item.value && (
                      <Check
                        className="decision-selected-check"
                        size={14}
                        aria-hidden="true"
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <p className="decision-choice-description" role="status">
              {decision
                ? choices.find((item) => item.value === decision)?.explanation
                : "Choose one. No decision is selected for you."}
            </p>
          </fieldset>
          <label className="field">
            Your rationale
            <textarea
              required
              maxLength={4000}
              value={rationale}
              disabled={busy}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="What will you do, or choose not to do, and why? What would change your mind?"
            />
          </label>
          <fieldset className="decision-citation-picker" disabled={busy}>
            <legend>
              Cite the findings you used{" "}
              <span>{evidenceIds.length} / 20 selected</span>
            </legend>
            <p className="small muted">
              Inspect and select the evidence behind your decision. You can load
              older findings here without leaving your draft.
            </p>
            <label className="decision-citation-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search loaded findings</span>
              <input
                type="search"
                value={search}
                maxLength={200}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Search loaded findings and sources"
              />
            </label>
            {evidenceIds.length > 0 && (
              <div className="decision-selected-citations">
                <strong>Selected findings</strong>
                <ul>
                  {evidenceIds.map((id) => {
                    const item = available.find(
                      (candidate) => candidate.id === id,
                    );
                    return (
                      <li key={id}>
                        <span>
                          {item?.title ??
                            "Earlier selected finding — availability checked when saving"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove citation: ${item?.title ?? "earlier finding"}`}
                          onClick={() =>
                            setEvidenceIds((current) =>
                              current.filter((value) => value !== id),
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <InlineError error={findings.error} retry={findings.reload} />
            <p className="decision-citation-count" role="status">
              {query
                ? `${matching.length} matching ${matching.length === 1 ? "finding" : "findings"} among ${available.length} loaded.`
                : `${available.length} accessible ${available.length === 1 ? "finding" : "findings"} loaded.`}
              {findings.more ? " More findings are available below." : ""}
            </p>
            <div className="decision-citation-results">
              {matching.map((item) => (
                <article
                  key={item.id}
                  className={`decision-citation-item ${evidenceIds.includes(item.id) ? "is-selected" : ""}`}
                >
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={evidenceIds.includes(item.id)}
                      disabled={
                        !evidenceIds.includes(item.id) &&
                        evidenceIds.length >= 20
                      }
                      onChange={(event) =>
                        setEvidenceIds((current) =>
                          event.target.checked
                            ? current.includes(item.id)
                              ? current
                              : [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.visibility === "private"
                          ? "Private finding"
                          : "Approved circle finding"}{" "}
                        · {when(item.createdAt)}
                      </small>
                    </span>
                  </label>
                  <details>
                    <summary>Inspect finding and sources</summary>
                    <EvidenceNote item={item} />
                  </details>
                </article>
              ))}
            </div>
            {!matching.length && !findings.loading && (
              <p className="small muted">
                {query
                  ? "No loaded findings match. Clear the search or load more findings below."
                  : "No accessible findings are currently loaded. You may record a decision without citations."}
              </p>
            )}
            {findings.loading && (
              <Loading text="Loading more permitted findings…" />
            )}
            <LoadMore
              more={findings.more}
              count={available.length}
              loading={findings.loading}
              onLoad={findings.loadMore}
            />
          </fieldset>
          <div className="decision-review-context">
            <label className="field">
              Did the research help?
              <select
                value={usefulness}
                disabled={busy}
                onChange={(event) =>
                  setUsefulness(event.target.value as Usefulness)
                }
              >
                {Object.entries(usefulnessLabel).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Next review date
              <input
                type="date"
                value={nextDate}
                disabled={busy}
                onChange={(event) => setNextDate(event.target.value)}
              />
              <small>
                A reminder in your workspace. It does not schedule a Bot. Clear
                it if no follow-up is needed.
              </small>
            </label>
          </div>
          <label className="field">
            Did someone assist with this work?
            <select
              value={assistance}
              disabled={busy}
              onChange={(event) =>
                setAssistance(event.target.value as Assistance)
              }
            >
              <option value="unknown">Not recorded</option>
              <option value="unassisted">
                I used the workflow without assistance
              </option>
              <option value="assisted">Someone assisted me</option>
            </select>
          </label>
          <div className="modal-actions decision-savebar">
            <GlassButton
              variant="quiet"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Discard this unsaved review draft?"))
                  onClose();
              }}
            >
              Cancel
            </GlassButton>
            <GlassButton type="submit" disabled={busy || stale || !decision}>
              {busy
                ? "Saving decision…"
                : previous
                  ? "Save new version"
                  : "Record decision"}
            </GlassButton>
          </div>
        </form>
      </div>
    </Modal>
  );
}
