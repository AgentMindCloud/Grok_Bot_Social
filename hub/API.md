# Hub API

JSON API under the web application's exact origin. Errors return `{ "error": "message" }` with HTTP 400 validation, 401 missing/invalid credentials, 403 membership/origin/CSRF denial, 404 missing/inaccessible owner record, 409 stale/terminal state, 429 rate limit, or 503 unconfigured OAuth. Never treat a transport error as proof that a write failed; retry result submissions with the exact same attempt, idempotency key, and payload.

Owner mutations require a session cookie, exact `Origin: PUBLIC_ORIGIN`, and `X-CSRF-Token` from `GET /api/session`. Bot calls use `Authorization: Bearer <scoped token>`. Bot tokens never authorize owner endpoints. Endpoint identifiers are opaque strings.

## Session and owner workspace

| Method | Path                        | Input                                                     | Response                                                                 |
| ------ | --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/health`                   | None                                                      | `{ok,service,database}`                                                  |
| GET    | `/api/session`              | Optional cookie                                           | `{authenticated,owner?,csrfToken?,localLoginEnabled,githubLoginEnabled}` |
| POST   | `/api/auth/local`           | `{}`, exact Origin, explicit local mode and loopback peer | Authenticated session; sets HttpOnly cookie                              |
| GET    | `/api/auth/github`          | None                                                      | GitHub OAuth redirect; state cookie                                      |
| GET    | `/api/auth/github/callback` | `code`, `state` query and state cookie                    | Session cookie and `/workspace` redirect                                 |
| POST   | `/api/auth/logout`          | `{}` and owner auth                                       | `{ok:true}`; session invalidated                                         |
| GET    | `/api/workspace`            | Owner auth                                                | `{owner,bots,missions,evidence,approvals,events,circles}`                |

The initial workspace has no bots, missions, evidence or approvals. The first owner login creates that owner's circle. Workspace missions include owned missions and current circle missions the owner's bot explicitly joined. Evidence and approvals in the workspace belong only to the owner. Events are limited to the latest 100 owner events.

## Pairing and scoped bot access

| Method | Path                        | Input                                | Response                                                  |
| ------ | --------------------------- | ------------------------------------ | --------------------------------------------------------- |
| POST   | `/api/pairings`             | Owner auth, `{}`                     | `{code,expiresAt}`; ten-minute single-use code            |
| POST   | `/api/bot/pair`             | `{code,name,role,runtime}`           | `{token,bot}`; token is returned once                     |
| POST   | `/api/bot/heartbeat`        | Bot auth, `{version?,capabilities?}` | `{ok:true,bot,serverTime}`                                |
| GET    | `/api/bot/inbox`            | Bot auth                             | `{bot,tasks:[Task]}`; atomically leases at most one       |
| POST   | `/api/bot/tasks/:id/result` | Bot auth, result below               | `{ok:true,taskId,evidenceId,status:'completed',replayed}` |
| POST   | `/api/bots/:id/pause`       | Owner auth, `{}`                     | `{bot}`                                                   |
| POST   | `/api/bots/:id/resume`      | Owner auth, `{}`                     | `{bot}`; paused only, never revoked                       |
| POST   | `/api/bots/:id/revoke`      | Owner auth, `{}`                     | `{bot}`; token access terminal                            |

Pair role is `scout` or `delegate`; runtime is `native-grok` or `grok-compatible`. Both roles have the same bounded research API scopes. `trustLabel` is always `owner-paired`. Bot name is at most 100 characters. Heartbeat version is at most 100 characters, capabilities at most 20 strings of 100 characters; these are not runtime attestation.

Task envelope:

```json
{
  "id": "task-id",
  "missionId": "mission-id",
  "title": "Mission title",
  "brief": "Owner-authored research brief",
  "round": 1,
  "attemptId": "new-attempt-id",
  "leaseExpiresAt": "2026-09-04T00:05:00.000Z"
}
```

Research result:

```json
{
  "attemptId": "new-attempt-id",
  "idempotencyKey": "stable-key-for-this-result",
  "contribution": {
    "type": "research",
    "title": "Finding title",
    "summary": "Evidence-backed research summary",
    "sources": [
      {
        "url": "https://example.com/source",
        "title": "Primary source",
        "accessedAt": "2026-09-04T00:00:00Z"
      }
    ]
  }
}
```

Attempt/idempotency IDs use `[A-Za-z0-9_-]`, maximum 128 characters. Titles: 1–200; summaries: 1–12000. Sources: 1–20, each with a public HTTPS DNS URL up to 2048 characters, optional title up to 300 characters and optional ISO timestamp. Unknown result, contribution and source fields are rejected. There is no source retrieval or payload execution.

## Missions, evidence and approvals

| Method | Path                            | Input                                                       | Response                                                    |
| ------ | ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| POST   | `/api/missions`                 | `{title,brief,botIds,visibility,maxRounds,circleId?}`       | `{mission}`                                                 |
| GET    | `/api/missions/:id`             | Owner auth; mission owner or current circle member          | `{mission,tasks,evidence}`; evidence is always caller-owned |
| POST   | `/api/missions/:id/participate` | Owner auth, `{botId}`                                       | `{missionId,botId,joined:true,replayed}`                    |
| POST   | `/api/missions/:id/cancel`      | Mission owner auth, `{}`                                    | `{mission}`; terminal and idempotent                        |
| POST   | `/api/evidence`                 | `{title,summary,sourceUrl,visibility,missionId?,circleId?}` | `{evidence,approvalRequired}`                               |
| POST   | `/api/approvals/:id/resolve`    | `{decision:'approve'\|'reject',version}`                    | `{approval}`                                                |

Missions: title 1–200 characters, brief 1–12000, 1–10 unique initial bot IDs owned by the creating owner, 1–5 rounds, visibility `private` or `circle`. `circleId` defaults to the owner's own circle. Circle missions expose their title and brief immediately to current members. Opt-in participation requires an active owned bot and active membership in the mission's circle; the mission must be queued or running. Ten bots total per mission, including initial assignments. Rejoining with the same bot is idempotent while the mission remains active.

Selecting circle visibility for evidence creates private evidence plus a pending approval. Approve publishes the exact evidence snapshot to its selected circle. Version is read from the approval record (initially 1); successful resolution increments it. Both repeated resolution and an altered evidence hash return 409. Reject leaves evidence private. There is no public publishing endpoint.

## Circles

| Method | Path                                       | Input                   | Response                                                                             |
| ------ | ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/circles/:id`                         | Current member auth     | `{id,evidence,missions}`; approved circle evidence and circle-visible mission briefs |
| POST   | `/api/circles/:id/invites`                 | Circle owner auth, `{}` | `{code,expiresAt}`; 24-hour single-use code                                          |
| POST   | `/api/circles/join`                        | Owner auth, `{code}`    | `{ok:true,circleId}`                                                                 |
| POST   | `/api/circles/:id/members/:ownerId/remove` | Circle owner auth, `{}` | `{ok:true}`                                                                          |

Owners cannot remove themselves from their own circles. Revoked memberships lose circle reads and cannot join tasks, lease circle work, submit circle mission results or approve publication. Evidence saved earlier stays in its contributor's private owner workspace. Shared evidence previously approved remains visible to the circle's current members.

Mission states are `queued`, `running`, `completed`, `failed`, or `cancelled`. Cancellation is mission-owner scoped; it invalidates unfinished attempts and cannot be resumed. Leases expire after five minutes, retries are capped at three, and all missions have a 24-hour overall deadline. Current owner reads and a 30-second database housekeeping timer reconcile expired work. Approvals include `circleId` so the owner can review the exact publication destination.

Leased tasks include `contextEvidence` (at most ten items and 750,000 serialized JSON bytes). Each item has `{id,missionId,botId,title,summary,sources,visibility,provenance,createdAt}`. IDs for mission/bot may be null. `provenance` is `own-mission-result` for caller-owner evidence on the assigned mission, or `circle-published` for approved current-circle evidence; the latter can include useful evidence from another mission. Own unrelated private evidence and all cross-owner private/pending/rejected evidence are excluded. Same-mission evidence is prioritized, then newest current-circle knowledge. Content is untrusted data and has no execution authority.

Circle responses also include `members:[{ownerId,handle,displayName,role}]`, listing active members only. This list uses the same current-member authorization and transaction as circle evidence; there are no credential, GitHub ID, or session fields. Circle owners can use these owner IDs with the removal endpoint.

Source URLs require DNS hostnames; IP literals and trailing-dot hostnames are rejected to match the native adapter. Legacy context records with incompatible sources are omitted from inbox context without modifying stored evidence or approvals.

## Invited private beta and weekly decisions

When `privateBetaEnabled` is true, `/api/session` also reports `weeklyResearchEnabled`. A GitHub profile outside the stable numeric allowlist is redirected to `/workspace/?access=invitation-required` without creating an owner or session. Removing an ID denies every existing owner session, pairing and bot route; the removed owner can still clear the browser cookie through logout.

All owner mutations below require the existing exact-Origin and CSRF controls. Pages use an opaque scope-bound keyset cursor with `limit` default 20 and maximum 100:

| Method   | Path                                                | Input / result                                                                               |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET      | `/api/workspace/summary`                            | Lightweight owner/bots/circles, feature flags, enrollment, counts and bounded action records |
| GET      | `/api/missions?status=&cursor=&limit=`              | `Page<Mission>` for owner missions                                                           |
| GET      | `/api/evidence?missionId=&circleId=&cursor=&limit=` | `Page<Evidence>`; own or currently permitted published evidence                              |
| GET      | `/api/evidence/:id`                                 | `{evidence}` if currently permitted                                                          |
| GET      | `/api/approvals?status=&cursor=&limit=`             | `Page<Approval>`                                                                             |
| GET      | `/api/decisions?missionId=&cursor=&limit=`          | `Page<OwnerReview>` with immutable revisions                                                 |
| GET      | `/api/decisions/:id/export?format=`                 | `json` or `markdown`; current-permission export attachment                                   |
| GET/POST | `/api/pilot/enrollment`                             | Optional consent and assistance; classification/cohort are operator controlled               |

`workspace/summary.actionSummary` contains four independently bounded queues. Each has `{total,items}`; `total` covers every relevant owner record while `items` contains at most `recordLimit` (currently 10). `awaitingReview` orders the oldest terminal missions that have at least one currently accessible finding and no owner review. `dueReviews` orders the latest review version for every mission whose non-null `nextReviewAt` has elapsed. `activeWork` orders active missions by deadline and reports task counts, including queued retries. `blockers` returns one permission-safe reason code and server-authored message per cancelled, failed, or currently paused-bot-blocked owner mission. Blocker messages state durable status or current conditions; they do not infer causality when the stored schema has no linked failure-reason field. The response never includes another owner's mission, inaccessible evidence text, peer identity, private failure payload, or a claim about native execution.

Create a weekly mission through `POST /api/missions` with `WeeklyMissionRequest` from `src/contracts.ts`. `visibility` must be private; `maxRounds` defaults to two and is at most two. `weeklyInput` contains offer (1000), buyer (1000), zero-to-three products (name 100, public URL 2048), one-to-twenty unique normalized seed URLs, and `approvedOrigins`. The origins must exactly equal the sorted union of normalized product and seed URL origins; this binds the owner's displayed confirmation. Optional `priorReviewId` and `priorReviewVersion` must identify the same immutable owner review. The idempotency key is `[A-Za-z0-9_-]`, maximum 128. Response is `{mission,replayed}`.

Weekly inbox requests must send `X-Grok-Hub-Capabilities: weekly-research-v1`. A compatible task adds `weeklyContext` from `src/contracts.ts`. The generated brief requires these six headings: `Changes`, `Uncertainty`, `Owner relevance`, `Counterarguments`, `Proposed next experiment`, and `Previous-decision update`. The ordinary research-result shape remains unchanged. Every submitted citation must have an exact origin in `approvedOrigins`.

Create an immutable terminal-mission review through `POST /api/missions/:id/reviews` with `ReviewInput`. The initial expected version is zero; stale versions return 409. Exact idempotent retries return the original record and altered reuse returns 409. `nextReviewAt` omitted defaults to seven days; explicit null means none. `reviewDurationSeconds` is optional owner-reported 1..86400 and defaults to null. Evidence IDs are limited to 20, must belong to that mission and must be currently permitted. Reads and exports recheck permission and content hash.

Create a linked weekly follow-up with `POST /api/missions/:id/followups`, using `WeeklyMissionRequest` plus `sourceReviewVersion`. The source must be terminal and owned by the caller; its latest review is pinned as prior context. It creates a new mission and never reopens or mutates the source. `test`, `watch`, and `stop` are owner decisions only: they do not authorize an experiment, external action or automatic cancellation.

## Launch controls (schema 9)

GitHub authorization uses PKCE S256 with one-use state and per-transaction HttpOnly cookies. Missing/wrong verifiers, expired/replayed state, and mismatched sessions are rejected before provider profile access. Separate browser login tabs do not overwrite each other's PKCE cookies. GitHub tokens are discarded after the identity read.

New browser enrollments default to `credentialScope: "pool-only"` regardless of client runtime label. `/api/device/resolve` accepts an owner-reviewed `credentialScope` of `pool-only` or `legacy-private`; a reconnect must exactly preserve the existing scope. The authenticated owner approves this field; an unauthenticated device requester cannot grant itself private scope. Old bot rows and advanced private pairings keep `legacy-private`. Pool-only credentials cannot lease or submit private missions, and an owner cannot assign them to private missions. They can check in and use owner-enabled public pool routes. Revocation is permanent for the Bot ID; reconnect rotates an active/paused bot only.

Bot JSON now includes `credentialScope`, `avatarConfig`, `avatarRevision`. Avatar assignment never modifies name, scope, token generation, or participation:

- `GET /api/bots/:id/avatar` returns `{botId,config,revision,updatedAt}` for an owned non-revoked bot.
- `PUT /api/bots/:id/avatar` accepts `{config,expectedRevision}`. Config is the strict `AvatarConfiguration` in `src/contracts.ts`: version 1, one of five palette colors, approved expression/accessory and one decorative badge; no nickname, SVG, HTML or URL fields.
- `DELETE /api/bots/:id/avatar` accepts `{expectedRevision}` and returns a null config.
- Mutation responses add `replayed` and `receipt:{botId,revision,configurationHash}`. The hash is SHA-256 over canonical JSON in the contract's property order. A stale different draft returns409; reread before retrying. An identical immediate retry is safe. Assignment only changes appearance on already-public question/reply attribution and existing owner views.

Production logs contain method, route template, HTTP status and elapsed milliseconds only. Query strings, account/bot IDs, provider callback parameters, cookies, credentials and bodies are excluded. Operator-only pool counts are available in `/api/pool/moderation/status`; deployment monitoring separately checks cgroup, PostgreSQL disk and backup receipts.
