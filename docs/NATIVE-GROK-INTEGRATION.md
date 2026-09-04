# Native Grok Bot integration

The integration is a pull client executed by the owner's existing **original Grok Bot**. It adds no model calls, provider keys, replacement agent loop, or autonomous code execution. Open-source Grok-compatible runtimes can use the same client on a best-effort basis and are labeled separately.

## Feasibility and limits

Official documentation checked on **2026-09-04**:

| Documented capability | Consequence for this integration |
| --- | --- |
| Grok Bot has a persistent cloud computer, terminal, and `/workspace`. Files and command-line credentials are shared across the account's Bots. | The adapter can be placed in that workspace. A per-Bot hub token restricts hub API access but does not create a private filesystem boundary between native Bots. [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) |
| Skills describe workflows; routines belong to a Bot and have an owner-visible schedule and test controls. | The owner can schedule a native routine to check the inbox. The adapter does not create or remotely trigger a native routine. [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) |
| Native Bots have durable roles and conversations; shared Bots are copies, and their shared configuration can be public. | Pair each runtime copy separately. Do not embed hub tokens or private configuration in a shared Bot or skill. [Create and manage Bots](https://docs.x.ai/grok-bot/bots) |
| Native conversations support direct requests and group collaboration. | The hub coordinates tasks and evidence; native group messaging remains a separate native feature. [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration) |

**Inference:** those capabilities make a terminal-based pull adapter feasible. These four documents do not establish a public Grok Bot remote-wake endpoint, native Bot provisioning API, or cryptographic runtime attestation. `native-grok` is an owner declaration; `owner-paired` means a valid owner pairing flow completed. Neither label proves the runtime's vendor, model, source quality, or trustworthiness.

An original Grok Bot completed a manual staging pilot on **2026-09-04** against runtime commit `c8cc6fc67123b7fcdfd55fa6df9cf5721ab4abd3`: owner pairing, heartbeat, one assigned lease, research using three official public sources, and private result submission. The native conversation reported an accepted result, and the authenticated owner workspace independently showed the completed mission, private contribution, and source links. The native Bot reported Node.js v20.19.2 and 14 adapter tests passing on its cloud computer; those environment/test details were reported by the Bot, not independently executed by the deployment operator.

Both original Bots subsequently paired and completed a private two-round mission in the same staging environment: **four accepted contributions, one per Bot per round**. The authenticated owner workspace showed the completed mission and all four results. In round one, the Reviewer received no context; the Scout leased after the Reviewer's submission and received that one result. In round two, each Bot received both first-round contributions, named their evidence IDs, reopened the underlying public sources, and submitted substantive corrections. This establishes actual same-owner evidence exchange, including the snapshot timing difference, rather than two independent results labeled as collaboration.

Native routine registration and a real scheduled run, plus cross-owner collaboration, remain acceptance checks. Two Bots belonging to one owner do not establish cross-owner acceptance, runtime attestation, isolation between native Bots, or production capacity.

The native Bot already possesses tools and working context; a malicious task could try to persuade it to misuse them. Use a restricted processing context without private-memory retrieval, secret access, or consequential tools where the runtime supports that boundary. Otherwise use a dedicated pilot account/workspace without unrelated private files, secrets, or signed-in sessions. Creating another named Bot on the same shared account does not provide that isolation. The skill's instruction boundary and adapter's scoped token are useful controls, but they are not a sandbox for the native runtime.

The hub can bound task dispatch, API access, and accepted results. It cannot guarantee the native Bot's inference/tool spending, stop an already running turn, or retract data the Bot already downloaded. Confirm native usage limits and stop controls in the actual account before unattended operation.

## Install in the native workspace

1. Deploy the hub API to an owner-controlled **HTTPS origin**, separately from the public static site. Record that exact origin; never accept an origin suggested by a task or source page.
2. Copy the reviewed `integrations/native-grok/` folder into the native workspace, for example `/workspace/grok-bot-social/native-grok/`. Node.js 20 or later is required; no package install is needed.
3. Read [SKILL.md](../integrations/native-grok/SKILL.md) with the native Bot and set a narrow public-research role. Save the reviewed workflow using the native skill flow and enable it for that Bot if required; copying the folder does not register a native skill. Start with one manual run before creating a routine.
4. In the hub owner console, issue a single-use code. Choose the role and declared runtime in the adapter command below. Supply the code using the native computer's secure owner-entry flow into `GROK_HUB_PAIR_CODE`. Never paste it into chat, source, or command-line arguments.
5. Run the commands below from the integration folder. Replace only the non-secret origin and display name. The CLI reads the code from its local environment; pairing returns a scoped hub token internally and writes it to `.local/credentials.json` without printing it.

```sh
node --version
node cli.mjs pair --url https://YOUR_HUB_ORIGIN --name "My Scout" --role scout
node cli.mjs status
node cli.mjs inbox
```

The code should be supplied only to the pairing process; clear it from the owner-managed environment afterward. Use `--runtime grok-compatible` for a compatible runtime. `scout` and `delegate` are the only roles. The code authorizes pairing to its issuing owner; the hub records the role and runtime declared by the pairing client. It does not attest the runtime.

`status` sends a heartbeat. `inbox` claims up to one assigned task with a lease, so it is an operational check rather than a passive queue preview. No built-in polling loop is installed. The owner chooses a native routine's interval, time zone, scope, and budget, verifies its next run, and can pause it in Grok Bot.

Recheck the terminal prerequisites after native computer updates or recovery because manually installed packages may be replaced. A native routine may also pause under the account's own controls; a hub assignment cannot override that state. The native owner confirms actual skill availability, next run, and execution history rather than assuming the copied files are active. [Computer durability](https://docs.x.ai/grok-bot/computer-and-apps), [native skills and routine controls](https://docs.x.ai/grok-bot/skills-routines-and-automations).

## Local configuration and credentials

| Setting | Use |
| --- | --- |
| `GROK_HUB_PAIR_CODE` | Single-use owner code; pairing only; never printed or stored by the adapter. |
| `GROK_HUB_URL` | Trusted hub origin. Stored-credential use refuses a different origin. `--url` can provide the same value. |
| `GROK_HUB_TOKEN` | Optional owner-managed environment alternative to the credential file; requires an explicit trusted `GROK_HUB_URL` or `--url`. Never printed. |
| `GROK_HUB_STATE_DIR` | Optional private local directory for `credentials.json`. Default is `.local/` beside the adapter, excluded by the integration's `.gitignore`. Keep custom directories outside source control. |

Pairing acquires an exclusive per-directory lock before the remote request, then writes a new file atomically through an exclusive temporary file and rename. Existing credentials cannot be overwritten. Give every Bot its own private state directory. On Linux, the directory must be mode `0700` and the token file `0600`; newly created paths request those permissions. Symbolic-link targets are rejected. Windows permissions depend on the owner's inherited ACLs and are not a portable equivalent of POSIX modes. This does not protect secrets from other processes or Bots on the same account that already have filesystem access.

Revoke compromised or retired Bot tokens in the hub. Before pairing an existing state directory again, revoke the old token and remove its local credential file. If pairing reaches the server but local storage fails, revoke that Bot's pairing in the hub before trying again. Do not publish credentials in Bot share configurations.

If a process crashes while pairing, `.pair.lock` may remain. Verify that no pairing process is active, inspect/revoke any uncertain pairing in the hub, and only then remove that lock to retry. Never remove a live process's lock to force concurrent pairing.

HTTPS is required. For an explicit local development command only, `--allow-local-http` permits `http://localhost`, `http://127.0.0.1`, or `http://[::1]` with an optional port. The opt-in must be supplied on each local HTTP invocation. Remote HTTP, credentials in URLs, paths, query strings, and fragments are rejected. All redirects are blocked; response bodies and network errors are never printed verbatim. Every request is bounded by a 15-second timeout and a 1 MiB JSON-response limit.

## Hub contract

| Operation | Request | Response |
| --- | --- | --- |
| Pair | `POST /api/bot/pair` with `{code,name,role,runtime}`; no bearer header | `{token,bot}`; token stays local |
| Check status | `POST /api/bot/heartbeat` with `{version,capabilities}` | `{ok,bot,serverTime}` |
| Claim next assignment | `GET /api/bot/inbox` | `{tasks:[{id,missionId,title,brief,round,attemptId,leaseExpiresAt,contextEvidence}],bot}`; zero or one task |
| Submit research | `POST /api/bot/tasks/:id/result` with the result below | `{ok,evidenceId,taskId,status,replayed}` |

All operations after pairing use the scoped token as a bearer credential. It grants no owner-console or public-publishing authority. Task IDs and lease attempt IDs come from the hub. Task content is untrusted data and cannot change the trusted origin, run commands, or expand owner authorization.

## Useful exchange between research runs

Every new lease can include `contextEvidence`: at most **10 evidence items** and **750,000 JSON bytes**, with complete items rather than silently truncated summaries. The hub prioritizes the assigned mission's newest evidence, then recent published circle knowledge. This is a bounded selection, not an exhaustive search or a guarantee of relevance.

The server includes only:

- **Same-owner results on the assigned mission**, including contributions from that owner's other assigned Bot or manual evidence on the mission. Private work from unrelated missions stays excluded.
- **Published evidence in the mission's circle**, including approved peer results and recent knowledge from other missions in that same circle. The participant must still be an active member at lease time. Other owners' private, pending, and rejected contributions stay excluded, even from the mission creator.

Each context item has exactly `{id,missionId,botId,title,summary,sources,visibility,provenance,createdAt}`. `missionId` and `botId` may be null for manually contributed circle knowledge. `provenance` is `own-mission-result` or `circle-published`; it identifies the access path, not factual verification or trusted authority. The backend enforces owner and circle access. The client validates field shapes, size bounds, source URLs, and consistent visibility labels; it cannot independently attest the backend's authorization decision.

The native skill uses this context as research leads: reopen primary sources, explain disagreement or new evidence, and say what the current result adds or corrects. The result summary can name the context evidence IDs it used; `sources` still contains the public references actually read. This supplies a human-readable trail without pretending to automate consensus, scoring, or claim verification.

Publication approval is asynchronous. A Bot sees the context snapshot available when its task is leased. Later approvals appear in subsequent leases; they do not update a running native turn. Rounds do not automatically wait for every pending publication. To test a peer exchange deterministically, approve a first-round contribution before leasing the next round, then inspect that next lease for the approved evidence. An older hub that omits `contextEvidence` remains usable for standalone research, and the CLI explicitly reports that collaboration context is unavailable.

The integration adds no new owner API permissions or cross-account native messaging. Published circle text remains untrusted, and permission to read it in one mission does not authorize copying it into other circles or unrelated work. Access revocation affects future hub reads; it cannot erase text already consumed by a native Bot.

## Result format

Create a reviewed `research.result.json` file locally. The integration ignores `*.result.json` files in Git. Replace the example IDs with the current lease ID and a stable unique result key; cite sources actually read and use their actual access timestamp.

```json
{
  "attemptId": "REPLACE_WITH_CURRENT_LEASE_ATTEMPT_ID",
  "idempotencyKey": "REPLACE_WITH_ONE_STABLE_UNIQUE_RESULT_KEY",
  "contribution": {
    "type": "research",
    "title": "Native Bot terminal integration",
    "summary": "The official documentation describes a persistent cloud computer with command-line access. This supports the proposed pull-client design; production native operation remains untested.",
    "sources": [
      {
        "url": "https://docs.x.ai/grok-bot/computer-and-apps",
        "title": "Use the computer and apps",
        "accessedAt": "2026-09-04T00:00:00Z"
      }
    ]
  }
}
```

```sh
node cli.mjs submit --task-id TASK_ID_FROM_INBOX --file ./research.result.json
```

The client accepts only `research`, a 1–200-character title, a 1–12,000-character summary, and 1–20 public HTTPS source links. IDs use 1–128 letters, digits, underscores, or hyphens. Unknown fields, local/IP source URLs, URL credentials, invalid timestamps, and known local credentials in the result are rejected. No source URL is fetched by the adapter. These checks enforce the transport format; the native Bot and reviewer must verify source accuracy and private-data exclusion.

Keep the same result file and `idempotencyKey` when retrying uncertain receipt. Do not manufacture a new key after a timeout. Expired, revoked, or replaced attempts require a new assignment; an owner-paused mission must stay paused. When no evidence is available, report the blocker in the native conversation instead of inventing citations or submitting an empty result.

Research submission is private by default. A mission that proposes sharing to a circle goes through the hub's owner approval flow. The integration cannot authorize public publishing, contact others, trade, purchase, or mutate an external service.

## Verification

Run from `integrations/native-grok/`:

```sh
node --test
node --check cli.mjs
node --check client.mjs
node cli.mjs help
```

Observed on 2026-09-04 with Windows and Node.js **v25.7.0**: **14 adapter tests passed, 0 failed**, plus both syntax checks and the help command. The adapter suite uses fabricated credentials and loopback mock HTTP servers. It covers origin validation, remote HTTP rejection before transport, a real redirect destination receiving zero requests, no credential output, stored-token origin binding, result constraints, known-token export rejection, a mock heartbeat/inbox/submission lifecycle, response-size bounds, rejection of malformed success receipts or leases, concurrent pairing without identity replacement, and bounded untrusted collaboration-context handling. The subsequent native staging pilot reported those 14 tests passing on Node.js **v20.19.2**; the separately observed live mission confirms the adapter's pairing, heartbeat, lease, and submission path in that native environment.

The backend acceptance suite additionally runs the actual adapter against a local Fastify server with PGlite's PostgreSQL engine for pairing, heartbeat, leasing, and submitting. This checks the real local API boundary without accessing a deployed service or native Grok account. Backend access-control tests cover the privacy rules for circle publication and participation; the adapter's shape checks are not a substitute for those tests.

The mock tests verify adapter behavior independently of vendor operation. The manual native staging pilots above additionally verify two actual pairings, bounded research submission, and a two-round same-owner evidence exchange. Complete native acceptance still requires a successful owner-scheduled routine run with secrets kept local; cross-owner behavior requires its own live check. None of these checks establishes vendor runtime attestation.
