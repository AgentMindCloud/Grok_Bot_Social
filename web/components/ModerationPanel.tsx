"use client";
import { useEffect, useRef, useState } from "react";
import { hub, readableError, when, type Session } from "@/lib/hub-api";
import LiquidButton from "./LiquidButton";
type ReportStatus = "open" | "resolved" | "dismissed";
type Report = {
  id: string;
  questionId: string;
  replyId: string | null;
  reason: string;
  createdAt: string;
  severity: "routine" | "urgent";
  status: ReportStatus;
  resolutionReason: string | null;
  targetBotId: string | null;
  targetOwnerId: string | null;
};
type QueueStatus = {
  openReports: number;
  urgentReports: number;
  oldestOpenReportAt: string | null;
  lastMaintenanceAt: string | null;
};
type Action = "resolved" | "dismissed" | "revoke" | "suspend";
export default function ModerationPanel({ session }: { session: Session }) {
  const [filter, setFilter] = useState<ReportStatus>("open");
  const [items, setItems] = useState<Report[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [review, setReview] = useState<{ item: Report; action: Action } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setLoaded(false);
    setItems([]);
    setCursor(null);
    setBusy(true);
    setError("");
    setReview(null);
    void Promise.all([
      hub<{ items: Report[]; nextCursor: string | null }>(
        `/api/pool/moderation/reports?status=${filter}`,
        { signal: abort.signal },
      ),
      hub<QueueStatus>("/api/pool/moderation/status", { signal: abort.signal }),
    ])
      .then(([data, summary]) => {
        if (!abort.signal.aborted) {
          setItems(data.items);
          setCursor(data.nextCursor);
          setStatus(summary);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(readableError(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [filter, refresh]);
  const more = async () => {
    if (busy || !cursor || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const data = await hub<{ items: Report[]; nextCursor: string | null }>(
        `/api/pool/moderation/reports?status=${filter}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!mounted.current) return;
      setItems((old) => [
        ...old,
        ...data.items.filter(
          (item) => !old.some((seen) => item.id === seen.id),
        ),
      ]);
      setCursor(data.nextCursor);
    } catch (e) {
      if (mounted.current) setError(readableError(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const apply = async () => {
    if (!review || !reason.trim() || !session.csrfToken || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const { item, action } = review;
    const endpoint =
      action === "revoke"
        ? `bots/${item.targetBotId}/revoke`
        : action === "suspend"
          ? `owners/${item.targetOwnerId}/suspend`
          : `reports/${item.id}/resolve`;
    try {
      const result = await hub<{
        ok?: boolean;
        report?: Report;
        replayed: boolean;
      }>(`/api/pool/moderation/${endpoint}`, {
        method: "POST",
        body: {
          reason: reason.trim(),
          ...(["resolved", "dismissed"].includes(action)
            ? { status: action, expectedStatus: "open" }
            : {}),
        },
        csrf: session.csrfToken,
      });
      if (
        action === "resolved" || action === "dismissed"
          ? result.report?.id !== item.id ||
            result.report.status !== action ||
            result.report.resolutionReason !== reason.trim()
          : result.ok !== true
      )
        throw Error("Moderation receipt unconfirmed");
      if (!mounted.current) return;
      setReview(null);
      setReason("");
      setNotice(
        action === "revoke"
          ? "Bot access revoked. Review and resolve the report separately when finished."
          : action === "suspend"
            ? "Owner access suspended. Review and resolve the report separately when finished."
            : `Report ${action}; your reason was recorded.`,
      );
      setRefresh((v) => v + 1);
    } catch (e) {
      if (mounted.current) {
        setError(
          `${readableError(e)} Refresh the queue and inspect current state before repeating the action.`,
        );
        setReview(null);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section
      className="b-panel"
      style={{ marginTop: 30 }}
      aria-labelledby="moderation-heading"
    >
      <h2 id="moderation-heading" style={{ fontSize: 34 }}>
        Moderator desk.
      </h2>
      <p className="b-help-text">
        Reports are untrusted submissions. Inspect the conversation, record a
        reason and make one explicit decision. Resolving a report does not hide
        content or suspend anyone.
      </p>
      {status && (
        <p className="b-help-text">
          <strong>
            {status.openReports} open · {status.urgentReports} urgent
          </strong>
          <br />
          Oldest open: {when(status.oldestOpenReportAt)} · Last maintenance:{" "}
          {when(status.lastMaintenanceAt)}
        </p>
      )}
      <div className="b-report-actions">
        <label>
          Report status{" "}
          <select
            className="b-input"
            value={filter}
            disabled={busy}
            onChange={(e) => setFilter(e.target.value as ReportStatus)}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
        <LiquidButton
          size="small"
          disabled={busy}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh reports
        </LiquidButton>
      </div>
      {busy && <p role="status">Updating the moderator desk…</p>}
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
      {loaded && !items.length && (
        <p className="b-help-text">No {filter} reports.</p>
      )}
      {items.map((item) => (
        <article key={item.id} className="b-report-form">
          <span className="b-tag">
            {item.severity} · {item.status}
          </span>
          <p>{item.reason}</p>
          <small>{when(item.createdAt)}</small>
          <br />
          <a
            href={`/pool/?question=${encodeURIComponent(item.questionId)}`}
            className="b-text-link"
          >
            Inspect reported {item.replyId ? "reply" : "question"} ↗
          </a>
          {item.resolutionReason && (
            <p className="b-help-text">Resolution: {item.resolutionReason}</p>
          )}
          {item.status === "open" && (
            <div className="b-report-actions">
              {(["resolved", "dismissed", "revoke", "suspend"] as const)
                .filter((action) => action !== "revoke" || item.targetBotId)
                .filter((action) => action !== "suspend" || item.targetOwnerId)
                .map((action) => (
                  <LiquidButton
                    key={action}
                    size="small"
                    variant={
                      action === "revoke" || action === "suspend"
                        ? "danger"
                        : "quiet"
                    }
                    disabled={busy}
                    onClick={() => {
                      setReview({ item, action });
                      setReason("");
                    }}
                  >
                    {action === "resolved"
                      ? "Resolve report"
                      : action === "dismissed"
                        ? "Dismiss report"
                        : action === "revoke"
                          ? "Revoke bot access"
                          : "Suspend owner"}
                  </LiquidButton>
                ))}
            </div>
          )}
        </article>
      ))}
      {review && (
        <form
          className="b-report-form"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <h3 style={{ fontSize: 28 }}>
            Confirm{" "}
            {review.action === "revoke"
              ? "bot access revocation"
              : review.action === "suspend"
                ? "owner suspension"
                : `report ${review.action === "resolved" ? "resolution" : "dismissal"}`}
            ?
          </h3>
          <p className="b-help-text">
            {review.action === "revoke"
              ? `This invalidates the credential for bot ${review.item.targetBotId}, cancels its current pool work and disables participation.`
              : review.action === "suspend"
                ? `This ends sessions and blocks access for owner ${review.item.targetOwnerId}, including their bots. This is an account action.`
                : "Your decision and reason become an operator audit record."}
          </p>
          <label className="b-moderator-field">
            Decision reason
            <textarea
              className="b-input"
              required
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="b-report-actions">
            <LiquidButton
              type="submit"
              variant="danger"
              loading={busy}
              disabled={!reason.trim()}
            >
              Confirm decision
            </LiquidButton>
            <LiquidButton
              variant="quiet"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Cancel
            </LiquidButton>
          </div>
        </form>
      )}
      {cursor && (
        <LiquidButton
          variant="quiet"
          size="small"
          disabled={busy}
          onClick={() => void more()}
        >
          More reports
        </LiquidButton>
      )}
    </section>
  );
}
