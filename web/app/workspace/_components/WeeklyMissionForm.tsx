"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LockKeyhole,
  Plus,
  ShieldCheck,
} from "lucide-react";
import Modal from "@/components/Modal";
import { GlassButton } from "@/components/GlassControl";
import { readableError, when, type Bot, type Mission } from "@/lib/hub-api";
import type {
  MissionDetail,
  OwnerReview,
  WeeklyMissionRequest,
  WeeklyMissionInput,
} from "../../../../hub/src/contracts";
import { prepareWeeklyInput } from "../_lib/weekly-form";
import { useWorkspace } from "../_hooks/useWorkspace";
import { usePages } from "../_hooks/useResource";
import { InlineError, LoadMore, Loading } from "./WorkspacePrimitives";
import "@/app/decision-controls.css";

const priorDecisionLabel = {
  test: "Test an idea",
  watch: "Keep watching",
  stop: "Stop pursuing",
} as const;

export default function WeeklyMissionForm({
  bots,
  source,
  onClose,
  onCreated,
}: {
  bots: Bot[];
  source: MissionDetail | null;
  onClose: () => void;
  onCreated: (mission: Mission) => void;
}) {
  const { mutate } = useWorkspace();
  const initial = source?.weeklyInput;
  const [title, setTitle] = useState(source?.mission.title || "");
  const [offer, setOffer] = useState(initial?.offer || ""),
    [buyer, setBuyer] = useState(initial?.buyer || "");
  const [products, setProducts] = useState(
    initial?.products.length
      ? initial.products.map((item) => ({ ...item }))
      : [{ name: "", url: "" }],
  );
  const [seeds, setSeeds] = useState(initial?.seedUrls.join("\n") || "");
  const active = bots.filter((bot) => bot.status === "active" && bot.credentialScope === "legacy-private");
  const [botIds, setBotIds] = useState<string[]>(
    source
      ? source.mission.botIds
          .filter((id) => active.some((bot) => bot.id === id))
          .slice(0, 2)
      : active.slice(0, 2).map((bot) => bot.id),
  );
  const decisions = usePages<OwnerReview>(source ? null : "/api/decisions");
  const currentDecisions = decisions.items.filter(
    (review, index, all) =>
      all.findIndex((item) => item.missionId === review.missionId) === index,
  );
  const [priorReviewId, setPriorReviewId] = useState("");
  const selectedPrior =
    currentDecisions.find((review) => review.id === priorReviewId) || null;
  const pinnedPrior = source?.latestReview || selectedPrior;
  const [preview, setPreview] = useState<WeeklyMissionInput | null>(null),
    [confirmed, setConfirmed] = useState<string[]>([]),
    [acknowledged, setAcknowledged] = useState(false);
  const [previewSourceVersion, setPreviewSourceVersion] = useState<
    number | null
  >(null);
  const [previewPrior, setPreviewPrior] = useState<OwnerReview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const saving = useRef(false);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    setPreview(null);
    setConfirmed([]);
    setAcknowledged(false);
  }, [source?.latestReview?.version]);
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);
  const edit = () => {
    setPreview(null);
    setConfirmed([]);
    setAcknowledged(false);
    setError("");
  };
  const close = () => {
    if (
      !busy &&
      ((!title && !offer && !buyer && !seeds) ||
        window.confirm("Discard this unsaved mission draft?"))
    )
      onClose();
  };
  const check = () => {
    try {
      if (!title.trim())
        throw new Error(
          "Write the decision you want this research to help you make.",
        );
      if (!botIds.length || botIds.length > 2)
        throw new Error("Assign one or two active Bots.");
      if (botIds.some((id) => !active.some((bot) => bot.id === id)))
        throw new Error(
          "An assigned Bot is no longer active. Update the selection.",
        );
      if (source && !source.latestReview)
        throw new Error(
          "Record a decision on the previous mission before creating a follow-up.",
        );
      if (priorReviewId && !selectedPrior)
        throw new Error(
          "The selected decision is no longer in the loaded decision history. Choose it again.",
        );
      const prepared = prepareWeeklyInput(offer, buyer, products, seeds);
      setPreviewSourceVersion(source?.latestReview?.version ?? null);
      setPreviewPrior(pinnedPrior);
      setPreview(
        selectedPrior
          ? {
              ...prepared,
              priorReviewId: selectedPrior.id,
              priorReviewVersion: selectedPrior.version,
            }
          : prepared,
      );
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check your mission details.",
      );
    }
  };
  const submit = async () => {
    if (
      !preview ||
      saving.current ||
      busy ||
      !acknowledged ||
      !preview.approvedOrigins.every((origin) => confirmed.includes(origin))
    )
      return;
    if (botIds.some((id) => !active.some((bot) => bot.id === id))) {
      setError(
        "An assigned Bot is no longer active. Edit your selection before creating this mission.",
      );
      return;
    }
    if (source && source.latestReview?.version !== previewSourceVersion) {
      setError(
        "The previous decision changed. Edit and review the current version before creating a follow-up.",
      );
      return;
    }
    const payload = {
      kind: "weekly-decision" as const,
      title: title.trim(),
      botIds,
      maxRounds: 2,
      visibility: "private" as const,
      weeklyInput: preview,
      ...(source ? { sourceReviewVersion: previewSourceVersion! } : {}),
    };
    const encoded = JSON.stringify(payload);
    if (!attempt.current || attempt.current.payload !== encoded)
      attempt.current = { payload: encoded, key: crypto.randomUUID() };
    const body: WeeklyMissionRequest & { sourceReviewVersion?: number } = {
      ...payload,
      idempotencyKey: attempt.current.key,
    };
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mutate<{ mission: Mission; replayed: boolean }>(
        source
          ? `/api/missions/${source.mission.id}/followups`
          : "/api/missions",
        body,
      );
      onCreated(result.mission);
    } catch (failure) {
      setError(
        readableError(failure) +
          " Your draft is retained. Retrying unchanged details uses the same request identity.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={source ? "Your next research question" : "Ask a useful question"}
      onClose={close}
      busy={busy}
    >
      <div className="question-form">
        <p className="decision-private-note">
          <LockKeyhole size={15} aria-hidden="true" />
          <span>
            Private research with one or two eligible connected bots. Your
            question becomes two bounded research rounds.
          </span>
        </p>
        <ol className="question-stage-list" aria-label="Question setup">
          <li aria-current={!preview ? "step" : undefined}>
            <span>
              {preview ? <Check size={13} aria-hidden="true" /> : "1"}
            </span>
            Shape the question
          </li>
          <li aria-current={preview ? "step" : undefined}>
            <span>2</span>Approve the scope
          </li>
        </ol>
        {error && (
          <div className="status-message error" role="alert">
            {error}
          </div>
        )}
        {source?.latestReview && (
          <div className="followup-context">
            <span className="eyebrow">
              FOLLOWING YOUR DECISION · VERSION {source.latestReview.version}
            </span>
            <p>{source.latestReview.rationale}</p>
            <p className="small muted">
              This creates a new mission. The earlier mission and decision
              remain in history.
            </p>
          </div>
        )}
        {!preview ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              check();
            }}
          >
            <section className="question-field-group">
              <header>
                <span>01</span>
                <div>
                  <h3>The decision you face</h3>
                  <p>
                    A focused question helps your Bots return something you can
                    act on.
                  </p>
                </div>
              </header>
              <label className="field">
                Question to decide
                <input
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  maxLength={200}
                  placeholder="Should we change our onboarding offer this week?"
                />
              </label>
              <label className="field">
                Your product or offer
                <textarea
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  required
                  maxLength={1000}
                  placeholder="What do you offer, and what is changing?"
                />
              </label>
              <label className="field">
                The buyer or audience
                <textarea
                  value={buyer}
                  onChange={(event) => setBuyer(event.target.value)}
                  required
                  maxLength={1000}
                  placeholder="Who has the problem you are trying to solve?"
                />
              </label>
            </section>
            <section className="question-field-group">
              <header>
                <span>02</span>
                <div>
                  <h3>Where research begins</h3>
                  <p>
                    Choose public pages. You will approve their exact websites
                    before creating the mission.
                  </p>
                </div>
              </header>
              <fieldset className="weekly-products">
                <legend>
                  Products to compare{" "}
                  <span className="muted">· optional, up to three</span>
                </legend>
                {products.map((product, index) => (
                  <div className="product-fields" key={index}>
                    <label className="field">
                      Product {index + 1}
                      <input
                        aria-label={`Product ${index + 1} name`}
                        value={product.name}
                        maxLength={100}
                        onChange={(event) =>
                          setProducts((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Product name"
                      />
                    </label>
                    <label className="field">
                      Public HTTPS page
                      <input
                        type="url"
                        aria-label={`Product ${index + 1} URL`}
                        value={product.url}
                        onChange={(event) =>
                          setProducts((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, url: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="https://example.com/product"
                        maxLength={2048}
                      />
                    </label>
                    {products.length > 1 && (
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() =>
                          setProducts((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove product {index + 1}
                      </button>
                    )}
                  </div>
                ))}
                {products.length < 3 && (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() =>
                      setProducts((current) => [
                        ...current,
                        { name: "", url: "" },
                      ])
                    }
                  >
                    <Plus size={14} /> Add a product
                  </button>
                )}
              </fieldset>
              <label className="field">
                Starting sources
                <textarea
                  value={seeds}
                  onChange={(event) => setSeeds(event.target.value)}
                  required
                  maxLength={40000}
                  placeholder="https://example.com/changelog&#10;https://example.com/pricing"
                />
                <small>
                  One public HTTPS URL per line, up to twenty. Only the exact
                  website origins you approve on the next screen may be
                  researched. Do not include secrets or private account links.
                </small>
              </label>
            </section>
            <section className="question-field-group">
              <header>
                <span>03</span>
                <div>
                  <h3>Your Bots and context</h3>
                  <p>
                    Assign the researchers and, when useful, a previous decision
                    to revisit.
                  </p>
                </div>
              </header>
              {!source && (
                <fieldset>
                  <legend>
                    Previous decision <span className="muted">· optional</span>
                  </legend>
                  <p className="small muted">
                    Choose one current decision only when it is relevant to this
                    question. The exact revision shown here is pinned; later
                    edits will not change this mission.
                  </p>
                  {decisions.loading && !decisions.items.length ? (
                    <Loading text="Loading your decision history…" />
                  ) : (
                    <label className="field">
                      Decision to revisit
                      <select
                        value={priorReviewId}
                        onChange={(event) =>
                          setPriorReviewId(event.target.value)
                        }
                      >
                        <option value="">No previous decision</option>
                        {currentDecisions.map((review) => (
                          <option key={review.id} value={review.id}>
                            {priorDecisionLabel[review.decision]} · v
                            {review.version} · {when(review.createdAt)} ·{" "}
                            {review.rationale.slice(0, 90)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <InlineError
                    error={decisions.error}
                    retry={decisions.reload}
                  />
                  {decisions.more && (
                    <LoadMore
                      more
                      count={decisions.items.length}
                      loading={decisions.loading}
                      onLoad={decisions.loadMore}
                    />
                  )}
                  {selectedPrior && (
                    <div className="followup-context">
                      <span className="eyebrow">
                        SELECTED DECISION · VERSION {selectedPrior.version}
                      </span>
                      <strong>
                        {priorDecisionLabel[selectedPrior.decision]}
                      </strong>
                      <p>{selectedPrior.rationale}</p>
                      <p className="small muted">
                        Recorded {when(selectedPrior.createdAt)}. Only this
                        decision revision is included; no later revision is
                        substituted.
                      </p>
                    </div>
                  )}
                </fieldset>
              )}
              <fieldset className="question-bot-selection">
                <legend>Assign one or two Bots</legend>
                {active.map((bot) => (
                  <label
                    className={`checkbox-row ${botIds.includes(bot.id) ? "is-selected" : ""}`}
                    key={bot.id}
                  >
                    <input
                      type="checkbox"
                      checked={botIds.includes(bot.id)}
                      disabled={!botIds.includes(bot.id) && botIds.length >= 2}
                      onChange={(event) =>
                        setBotIds((current) =>
                          event.target.checked
                            ? [...current, bot.id]
                            : current.filter((id) => id !== bot.id),
                        )
                      }
                    />
                    <span>
                      <strong>{bot.name}</strong>
                      <small>
                        {bot.role === "delegate"
                          ? "Reviewer / delegate"
                          : "Research scout"}
                        {bot.runtime === "grok-compatible"
                          ? " · compatible runtime, best effort"
                          : " · owner-declared native runtime"}
                      </small>
                    </span>
                  </label>
                ))}
                {!active.length && (
                  <p className="native-note">
                    Connect or resume a Bot before creating this mission.
                  </p>
                )}
                <p className="small muted">
                  Your Bots use their next native check-in to collect an
                  assignment. This form does not create or change a routine.
                </p>
              </fieldset>
            </section>
            <div className="modal-actions decision-savebar">
              <GlassButton variant="quiet" onClick={close}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" disabled={!active.length}>
                Review scope <ArrowRight size={16} />
              </GlassButton>
            </div>
          </form>
        ) : (
          <div className="weekly-preview">
            <h3
              ref={previewHeading}
              tabIndex={-1}
              className="question-preview-heading"
            >
              {title}
            </h3>
            <dl>
              <dt>Your offer</dt>
              <dd>{preview.offer}</dd>
              <dt>Buyer</dt>
              <dd>{preview.buyer}</dd>
              <dt>Previous decision</dt>
              <dd>
                {previewPrior
                  ? `${priorDecisionLabel[previewPrior.decision]} · version ${previewPrior.version}`
                  : "None selected"}
              </dd>
              <dt>Assigned</dt>
              <dd>
                {active
                  .filter((bot) => botIds.includes(bot.id))
                  .map((bot) => bot.name)
                  .join(" + ")}
              </dd>
              <dt>Limits</dt>
              <dd>
                Private · 2 rounds · 24-hour mission deadline. Native check-in
                schedules and spending controls remain in Grok.
              </dd>
            </dl>
            {previewPrior && (
              <div className="followup-context">
                <span className="eyebrow">
                  PINNED PREVIOUS DECISION · VERSION {previewPrior.version}
                </span>
                <p>{previewPrior.rationale}</p>
                <p className="small muted">
                  The mission will receive this exact revision. A later decision
                  will not replace it.
                </p>
              </div>
            )}
            <h3 className="question-approval-title">
              <ShieldCheck size={20} aria-hidden="true" /> Approve these
              websites
            </h3>
            <p className="small muted">
              Approval covers pages on each exact HTTPS origin. It does not
              include other subdomains, accounts or linked websites. A Bot must
              report a blocker when other sources are needed.
            </p>
            {preview.approvedOrigins.map((origin) => (
              <label className="checkbox-row approved-origin" key={origin}>
                <input
                  type="checkbox"
                  checked={confirmed.includes(origin)}
                  disabled={busy}
                  onChange={(event) =>
                    setConfirmed((current) =>
                      event.target.checked
                        ? [...current, origin]
                        : current.filter((item) => item !== origin),
                    )
                  }
                />
                <span>{origin}</span>
              </label>
            ))}
            <details>
              <summary>Starting pages and products</summary>
              <ul className="source-list">
                {preview.products.map((product) => (
                  <li key={product.url}>
                    {product.name}: {product.url}
                  </li>
                ))}
                {preview.seedUrls.map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </details>
            <p className="native-note">
              Results are research notes, not verified truth. The owner chooses
              test, watch or stop after reviewing them. This mission authorizes
              no messages, payments, publication or changes to other services.
            </p>
            <label className="checkbox-row question-final-consent">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I reviewed this question, Bot selection and research scope.
            </label>
            <div className="modal-actions decision-savebar">
              <GlassButton variant="quiet" disabled={busy} onClick={edit}>
                <ArrowLeft size={16} /> Edit
              </GlassButton>
              <GlassButton
                onClick={() => void submit()}
                disabled={
                  busy ||
                  !acknowledged ||
                  !preview.approvedOrigins.every((origin) =>
                    confirmed.includes(origin),
                  )
                }
              >
                {busy
                  ? "Creating question…"
                  : source
                    ? "Create follow-up"
                    : "Create private question"}
                <Check size={16} />
              </GlassButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
