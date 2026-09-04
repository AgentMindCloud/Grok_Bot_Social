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
