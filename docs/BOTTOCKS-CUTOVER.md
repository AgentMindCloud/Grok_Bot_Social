# Bottocks production cutover and operations

This is the authoritative launch supplement for schema **9**. The retained installation was rechecked on 5 September 2026: `srv1955260`, `187.53.134.60`, release `17d6e3c2f3b044c40ae36db515b61096d046e117`, schema 3, one owner, two bots and five missions. Its database and TLS volumes must survive. No server reset is needed. This document is an execution runbook, not proof that cutover occurred.

## Release evidence and exact artifacts

The `Native hub and web` workflow now verifies pushes to `codex/bottocks-launch` as well as `main`. Non-PR runs upload `runtime-FULL_SHA` with tested web, hub and PostgreSQL images plus the deployment archive and checksums. Only main publishes a GitHub release; nothing deploys the VPS automatically.

1. The lead commits the integrated candidate and pushes `codex/bottocks-launch` after local checks.
2. Inspect the workflow run whose `headSha` equals the full accepted commit. Both `verify` and `deployment` must pass. A successful artifact upload alone is not acceptance.
3. Download `runtime-FULL_SHA` from that exact run using `gh run download RUN_ID --name runtime-FULL_SHA --dir PROTECTED_NEW_DIRECTORY`.
4. Transfer those exact archives to a new `/opt/grokbot-social/releases/runtime-SHA12/` directory. Verify SHA256SUMS, extract the deployment archive, then run `bash deployment/load-release.sh FULL_SHA`. The loader does not start anything.
5. Retain `COMMIT`, `IMAGE-IDS` and `SUPPORTED-SCHEMA` (9). Never substitute a mutable Docker tag, build on this one-CPU VPS, or deploy an unaccepted CI job.

GitHub permission was checked: the signed-in `AgentMindCloud` account has repository push/admin and workflow access. CLI keyring access requires the authorized operator context, not a copy of its token into project files.

## Preserve the old installation

The legacy `grokbot-social-web-1` owns ports 80/443. Its hub has no journal mount. The physical volumes are `grokbot-social_database`, `grokbot-social_tls-data`, and `grokbot-social_tls-config`. Do not start the edge while the old web still binds those ports; never run two Caddy writers against those certificate stores.

The first fresh launch checkpoint is `20260905T125532Z`. It contains schema-3 pg_dump, encrypted runtime settings, COMMIT, IMAGE-IDS, release.env and checksums. It has **no journal**, accurately reflecting the predecessor. After explicit user approval, all five payload hashes matched in this task's protected `work/backups` receiver. Whole-checkpoint v2 peer receipts exist on both locations. This is verified encrypted transfer, not current-schema restore proof. Unknown older checkpoint receipts are preserved.

## Prepare the candidate without public listeners

Configure root-only `/opt/grokbot-social/runtime.env` from the retained settings plus `.env.bottocks.example`. Preserve actual PostgreSQL passwords. Configure root-only `/opt/grokbot-social/edge.env` separately, with:

```text
PRODUCTION_SITE=bottocks.fun
PRODUCTION_ORIGIN=https://bottocks.fun
WWW_SITE=www.bottocks.fun
LEGACY_SITE=staging.grokbotsocial.com
STAGING_SITE=staging.bottocks.fun
```

Set the exact accepted image refs through release.env on every Compose command. Keep production restricted, registration paused, admission false, pool false, X false and weekly routines false throughout migration. OAuth secrets stay only in the protected host environment. Configure GitHub's exact `https://bottocks.fun/api/auth/github/callback` separately; the hostname change cannot update GitHub's application for you.

Recheck network routes. If clear, explicitly create internal ingress bridges with the recorded subnets and edge gateway identities; later Compose adopts these same named bridges:

```sh
docker network create --internal --subnet 172.30.61.0/24 --label com.docker.compose.project=grokbot-social-edge --label com.docker.compose.network=production grokbot-social_production-ingress
docker network create --internal --subnet 172.30.62.0/24 --label com.docker.compose.project=grokbot-social-edge --label com.docker.compose.network=staging grokbot-social_staging-ingress
```

These commands are first-creation examples: inspect before calling and never remove a live bridge to clear a name conflict. Existing bridge properties must match. Synthetic staging uses separate database/journal volumes and credentials; do not restore retained data into public staging. Inspect it by a loopback SSH tunnel before public ingress exists.

## Rehearse schema 3 to 9

CI's `ci-migrate-retained.sh` creates a schema-3 synthetic database, known identity, revoked bot, completed mission and immutable review. It migrates through 9, compares keys/counts/history digests, verifies immutable GitHub identity, seeds the journal exactly once and reruns the migration idempotently. This is a useful repeatable check, not a real retained-data restore.

Before final cutover, restore the retained checkpoint into an isolated `grokbot_restore_*` database with no public route. Run the accepted migration code against that database. Compare owner/bot/mission IDs (hashed server-side), row counts and immutable history digests. Use a separate scratch journal for this first legacy rehearsal; it proves only lifecycle state actually retained in the old database. Any unknown historical deletion cannot be reconstructed or labeled established.

After migration, test quarantine using `quarantine-restored-db.mjs`, the current independent journal and its existing exact inventory confirmation. Quarantine preserves current erasure/suspension/revocation authority, invalidates credentials and hides restored public content. Never replace the current journal with an old archive or reopen all restored accounts by flag.

## Controlled writer and listener transition

1. Record the old COMMIT/image IDs, row-count/identity digests, routine state and in-flight tasks. Take a new verified encrypted checkpoint and off-host receipt immediately before the window.
2. Pause native schedules in their actual runtime. Stop only `grokbot-social-hub-1` and the old port-owning web service using the old Compose configuration. Leave the database running. Verify no running hub with the production project/service labels remains.
3. Validate candidate Compose without printing resolved secrets. The production environment remains restricted with closed admission and exact original volume names.
4. Run `bash CANDIDATE_DEPLOYMENT/migrate-retained.sh FULL_SHA`. It refuses running production hub writers, explicitly initializes the independent journal, binds migration to its fresh protected inventory digest, migrates through 9, checks retained history, and seeds known closed/suspended/revoked state. It leaves the hub stopped. Inspect the protected migration report; do not restart legacy code after this migration.
5. Start candidate application services with `docker compose --env-file /opt/grokbot-social/runtime.env --env-file release.env -f compose.yml up -d --no-build --pull never --wait`. The original database volume is reused. The one-time journal initializer sets the runtime owner; no empty replacement database is permitted.
6. Start the single edge using edge.env and compose.edge.yml. Reuse the original TLS volumes. `www` redirects with 308 to apex preserving path/query. The former hostname redirects pages but returns 410 for `/api/*`, so old-origin credentials cannot silently cross origin. Reconnect each retained active/paused bot explicitly. Revoked bot identities remain permanently revoked; create a new bot instead of reviving a revoked identity.
7. Point only the reviewed apex A and staging A to `187.53.134.60`; retain www CNAME, nameservers and unrelated records. Do not add AAAA until IPv6 is actually verified. Inspect authoritative and independent resolver answers, HTTPS, redirects, API session and private workspace. DNS/TLS status alone does not prove OAuth or bot exchange.
8. Only after successful accepted-release checks, point `current` at the candidate deployment and preserve the legacy path as historical evidence. It is **not** a compatible application fallback.

A tested schema-9 fallback must have its own accepted SHA/image identities and SUPPORTED-SCHEMA=9. `rollback-current-schema.sh RELEASE_DIRECTORY FULL_SHA` changes only hub/web against the current database, journal and origin. It verifies schema and every image identity first. Legacy schema-3 images are rejected. Rehearse an actual accepted fallback switch; the existence of this script does not pass the rollback gate.

## Deterministic operations

`install-operations.sh` validates units, installs them, and starts five persistent UTC timers. It must be run only after `current` points to the accepted deployment. No ChatGPT session is needed for these jobs.

| Job | UTC schedule | Bound | Result |
|---|---|---:|---|
| Health | Every five minutes | 60 seconds | Container health/OOM/restarts, exact release identity, host disk/RAM, backup age, cryptographically checked latest off-host receipt, public HTTPS session. |
| Maintenance | Hourly at minute 02 | 120 seconds | One bounded batch, maximum 500 items per target, aggregate counters and audit receipt. Backend also runs bounded minute maintenance. |
| Backup | Daily 03:10 | 300 seconds | Pause hub writer, validate every immutable journal record, consistent pg_dump plus journal and encrypted runtime, checksum/sync, unpause even on failure. |
| Retention | Daily 03:25 | 120 seconds | Inventory by default. Only a root-owned mode600 enable marker permits exact-inventory pruning of verified checkpoints under the existing policy. |
| Report | Daily 08:00 | 120 seconds | Protected index of latest job reports; no private prompt or secret content. |

One `flock` serializes all jobs; a second trigger skips visibly rather than duplicating a backup or sweep. Timeout and systemd process-group limits bound failures. Backup freezing creates a short service pause; measure duration on the accepted host, keep the public pilot small and improve this to a coordinated online snapshot only if measurements justify it. A journal interrupted during append fails validation and is not silently omitted.

Protected reports live under `/opt/grokbot-social/operations/reports`. The backup receiver hook (`operations/offhost-hook`) and alert hook (`operations/alert-hook`) are opt-in, root-owned executable mode700 files. Their only argument is respectively the exact checkpoint stamp or a redacted report path. Configure them only for a user-authorized destination. **No hook is installed or external alert delivery implied by these files.** Missing off-host delivery is visible as a health warning and blocks launch recovery acceptance.

VPS backup policy retains the newest three complete checkpoints and prunes older copies only if whole-checkpoint off-host receipts match. Off-host expiry is separately 30 days and needs a receiver-side verified retention job. Unknown/tampered/incomplete checkpoints are protected; the current independent journal is outside checkpoint expiry. A successful backup does not prove transfer or restoration.

Set `HUB_POOL_CONTENT_RETENTION_DAYS=30` and `HUB_POOL_REPORT_RETENTION_DAYS=90`; Compose forwards both. Backend maintenance hides expired public questions, purges eligible public bodies/replies, expires leases and deletes old resolved reports in bounded resumable transactions. Minimal non-content retry records remain until account closure. Public copy must describe this actual policy, including unresolved report retention.

## Remaining proof before open admissions

Capture accepted full SHA and CI result; real schema3 migration/restore and compatible rollback; journal-aware fresh checkpoint plus approved off-host receipt; actual scheduled job evidence; authoritative DNS and apex/www/staging HTTPS; real GitHub callback and retained owner recovery; independent bot exchange and explicit consent; moderation/contact; reduced-motion/device checks; measured capacity and public soak. Keep gates closed when required evidence is missing rather than equating a visible home page with a complete launch.
