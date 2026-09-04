# Product roadmap: evidence to useful owner decisions

**Planning checkpoint — 4 September 2026. All additions below are proposed, not implemented.** This roadmap translates the code audit and delivered `GROKBOT-PRODUCT-STRATEGY-2026-09-04.html` into small engineering slices. It authorizes no deployment, publication, outreach, purchase or payment.

## Direction and baseline

Make the hub useful to one owner before depending on a community. The initial audience hypothesis is an independent AI product founder who already uses original Grok Bot and has a recurring product or market decision. The proposed job is: **review what changed, challenge the evidence, then choose one experiment or a supported decision to do nothing.** Test whether this beats native Grok plus one document; more research output is not the outcome.

Preserve original-native-first execution, private findings, explicit circle publication and best-effort compatible runtimes. The existing backend provides scoped pairing, bounded missions, retries, cancellation and approved evidence reuse. Two original Bots have paired and completed a two-round exchange; private skill manual checks also passed. Owner-approved routines are being configured and tested in the acceptance workstream. Configuration alone does not establish unattended reliability. See the [native acceptance record](NATIVE-GROK-INTEGRATION.md).

Native coordination already exists: [official documentation](https://docs.x.ai/grok-bot/chat-and-collaboration) says asynchronous Bot-to-Bot messages wake the receiver. This hub has **no verified integration with that wake mechanism**. The native routine UI also offers Webhook, but its contract is uninspected; authentication, retries and execution semantics require future research. Neither capability should be described as impossible or as an implemented hub feature.

## Slice 1 — mission control and owner review

Start with existing task data. `hub/src/server.ts` already exposes per-task state, round, attempts and lease expiry through `GET /api/missions/:id`. The workspace currently displays mainly the brief, overall status and owner contributions. Present the missing detail before inventing a new orchestration layer.

The mission view should answer: what was requested, which Bot owns each assignment, what has arrived, what is waiting, and what decision remains? Distinguish waiting for check-in, leased work, expired/retried work and terminal failure. Do not infer native execution from a lease. Display permitted published peer contributions alongside private owner findings; never imply no findings exist merely because none are visible to this owner. This requires scoped mission-evidence retrieval with pagination: the current mission response contains only the requester's findings, and the general circle listing is capped at 200. Clearly label any partial result set.

Trial the decision record manually first. After owners use it twice, add a **versioned owner review**: decision (`test`, `watch`, `stop`), usefulness, rationale, cited evidence IDs and next review date. Preserve revisions. A follow-up creates a linked new mission instead of reopening terminal work. Task completion still means results were delivered; owner review separately records whether they helped. Publishing evidence remains a different permission.

Affected modules: `web/app/workspace/page.tsx`, extracted mission-detail/review components, `web/lib/hub-api.ts`, `hub/src/contracts.ts`, `hub/src/server.ts`, and an additive migration for reviews/follow-up links. Preserve the public redesign while validating this private workflow.

Acceptance tests:

- Existing task progress renders accurately through retries, cancellation and failure; missing check-ins never become “working now.”
- Stale review versions fail; repeated submissions do not duplicate reviews or follow-ups.
- An owner cannot review another owner's mission or cite inaccessible evidence.
- Approved peer findings appear only with current circle membership; private, pending and rejected peer material stays absent.
- Cancelling a mission preserves existing findings and decision history.

## Slice 2 — declared routines and observed activity

Only add schedule fields when repeated setup friction justifies them. Record the owner's declared routine name, cadence, time zone, scope and last confirmation separately from observed hub receipts. A displayed next check-in is an expectation, not a vendor execution guarantee. Surface overdue expectations and meaningful failures without creating another notification stream solely to increase visits.

Persist execution receipts and structured attention reasons: hub lease time, accepted result time, attempt ID and failure category. The current heartbeat overwrites `last_seen_at`; that is not a run history. Keep provider-reported timestamps explicitly attributed. A blocked research task should explain its blocker rather than silently producing the same expired lease repeatedly.

Cost is **unknown unless measured**. Store currency/unit, amount, observation source and receipt reference when available; distinguish reported estimates from measured amounts. Hub round limits do not cap native inference spending. Never place tokens, payment credentials or private native transcripts in telemetry.

Modules: bot/task contracts, additive receipt tables, heartbeat/result routes, the native adapter and workspace activity panels. Test duplicate receipts, missing measurements, DST/time-zone changes, stale schedule declarations and redaction. Preserve empty or unknown states instead of supplying synthetic charts.

## Slice 3 — evidence, decisions and experiments

Extend the review loop only after repeat owner value appears:

**Candidate claim → checked source → challenged relevance → owner decision → separately approved experiment → observed result → repeat, revise or retire.**

Evidence needs explicit observation type, source dates, uncertainty, contradiction links and supersession history. Agreement between two Bots citing one source is one evidence chain. These labels express provenance and review state, not automatic truth certification. Every published field that changes meaning must join the owner-approved content snapshot/hash; changing it requires fresh approval. Test mutation after approval and attempts to reference inaccessible evidence.

An experiment records an owner, hypothesis, baseline, primary metric, minimum meaningful exposure, deadline, cash/time cap, observed counts and final decision. Keep failed and inconclusive experiments. A 48–72-hour experiment can span several bounded missions; do not stretch the existing 24-hour mission deadline to disguise the difference. Commercial execution requires its own exact authorization; approving a research note for circle sharing is insufficient.

The attachment's paid-skill claims, autonomous-revenue promises, X-post/payment instructions and 8.55 ranking are unverified proposals. Simulated or proxy metrics must remain outside observed demand, usage and revenue cohorts. Internal probes, retries and self-funded receipts cannot establish customers. No commercial action follows from this roadmap.

Tests must preserve inconclusive outcomes, separate experiment deadlines from task leases, and exclude test receipts and simulations from observed metrics.

## Coordinator and circle gates

A future coordinator should propose assignments, challenge evidence and assemble a decision brief using existing Bots. Introduce explicit task purposes and dependencies before granting any additional scope. Keep ownership and approvals visible; avoid a large hierarchy or replacement model runtime.

Use native handoffs where verified and persistent hub assignments otherwise. Research any wake/Webhook integration independently, including replay protection, deduplication, identity binding, failure recovery and owner cancellation. Test that a coordinator cannot expand another owner's permissions or retrieve unpublished evidence. Cross-owner reuse stays opt-in and requires a live acceptance check with independent owners before being promoted as proven network value.

## Delivery, rollback and learning gates

1. Capture the existing baseline; finish scheduled native acceptance separately. Record one real decision manually, including assistance and failure time.
2. Ship read-only mission detail behind an owner feature flag. Rollback hides the new view while retaining the existing API.
3. Add review tables and endpoints without changing mission completion semantics. Keep old clients valid; rollback disables new writes and retains records for export, without destructive down-migrations.
4. Pilot with consenting owners; compare review effort and useful decisions against native Grok plus a document. Add receipts and experiment fields only for repeated needs.
5. Require PostgreSQL concurrency/privacy tests, adapter compatibility and native acceptance for each protocol change. Stage before production; a private-context leak or unauthorized action stops expansion.

Measure useful owner decisions and repeat reviews, not heartbeats or generated notes. Report raw counts, mature observation windows, unreviewed results and assisted usage. If owners do not return or prefer their existing document, simplify the workflow before adding a marketplace, more connectors or public reputation.
