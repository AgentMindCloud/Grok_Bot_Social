# Open launch operations — GrokBot Social

This runbook implements the approved same-origin KVM 1 deployment. It preserves the existing owner data and Bot identities. Read the complete sequence before cutover; creating a release is not evidence that these environment checks passed.

## Topology and resource boundaries

| Project | Public route | Data | Networks |
|---|---|---|---|
| `grokbot-social-edge` | Ports 80, 443 TCP/UDP | Existing Caddy certificate volumes | Separate production/staging ingress bridges and outbound |
| `grokbot-social` | `grokbotsocial.com` through edge | Existing `grokbot-social_database`, verified before use | Private DB network, production ingress and hub outbound |
| `grokbot-social-staging` | `staging.grokbotsocial.com` through edge | Fresh `grokbot-social-staging_database` | Separate private DB network, staging ingress and hub outbound |

Only the edge publishes ports. It routes `/api/*` directly to the correct hub, replacing forwarding headers. Each hub trusts exactly its edge address: default production `172.30.61.2`, staging `172.30.62.2`. Static containers listen on `:8080` and cannot proxy an API. The edge cannot reach either database. Do not enable an external CDN proxy without reviewing client-address forwarding; the default assumes direct DNS to Caddy.

Production memory ceilings are DB 768 MiB, hub 768 MiB and static web 128 MiB; edge is 192 MiB. Synthetic staging is DB/hub 384 MiB each and web 96 MiB. CPU ceilings permit bounded bursts on the shared single CPU; they are not reserved capacity. Stop staging when unused. The hub's local pressure guard pauses new admission below 1 GiB free disk or 256 MiB free memory; separately monitor PostgreSQL's filesystem when it differs from the hub's writable filesystem. Existing result reservations and account recovery remain available.

## 1. Inventory and preserve the current service

1. Record the deployed full Git commit, image IDs, Compose project, exact database/TLS volume names, Docker image-store backend, available disk/RAM and host/VPN/Docker network ranges. Use formatted Docker inspection that excludes container environment values. Never print secrets.
2. Confirm the proposed `172.30.61.0/24` and `172.30.62.0/24` ranges do not overlap. If changed, update edge subnets/IPs and the matching exact `EDGE_TRUSTED_IP` in each application environment together.
3. Inventory all existing encrypted backup directories. Preserve unfamiliar archives. Verify a new encrypted database backup, off-host transfer checksum and an isolated restore. Record migration versions and table/owner/mission counts without placing private records in evidence.
4. Retain a compatible application rollback release that understands migrations 004–006, owner status, multiple provider identities, credential generations and current native tasks. The pre-open-beta image is not a safe rollback target for X accounts or closed-account enforcement.
5. Preserve the existing DNS records and OAuth configuration privately. Do not rotate database passwords by editing `.env`: PostgreSQL init scripts run only for an empty volume.

The default external volume name is `grokbot-social_database`, matching the previous Compose project. **Verify it on this host**. If the actual retained volume has another name, set `DATABASE_VOLUME` to that observed name. Never create a new empty production volume to satisfy an external-volume error.

Create the new `grokbot-social_closure-journal` volume once, after confirming it is absent. This is separate from the existing database and certificate volumes. The bounded `journal-init` service gives only its `records` directory to the non-root hub account. Production will not start without an absolute configured journal path; the protected volume is mounted at `/var/lib/grokbot-journal` and is never replaced with a database backup.

## 2. Load and validate the candidate

Download the exact accepted runtime release from the trusted repository, verify `SHA256SUMS`, extract its deployment bundle, then run `bash deployment/load-release.sh FULL_COMMIT_SHA`. The loader imports tested images only; it does not start services. Build on CI, never on KVM 1.

Store `.env.production`, `.env.staging` and `.env.edge` with mode 600, alongside the non-secret `release.env`. Generate fresh staging database passwords and a separate staging OAuth app. Never copy production owner data or credentials into synthetic staging. Production needs these exact callbacks:

- `https://grokbotsocial.com/api/auth/github/callback`
- `https://grokbotsocial.com/api/auth/x/callback`

Staging callbacks use the staging hostname. X remains disabled until actual developer-app pricing, a maximum $10 monthly operating budget and disabled automatic recharge are verified in the provider account. `HUB_X_BUDGET_VERIFIED=true` is an operator assertion, not a billing-control API. Do not activate X on the strength of a mock callback test.

X sign-in opens a durable circuit after HTTP 402 or HTTP 429 with the exact `usage-capped` problem type. Ordinary rate-limit responses do not create a permanent circuit. The row in `auth_provider_circuits` survives a hub restart and is not cleared automatically at a calendar boundary. Existing valid sessions continue; GitHub reaches the same workspace only when that identity was already linked.

For recovery, first inspect `SELECT provider,reason,opened_at FROM auth_provider_circuits WHERE provider='x';` through the protected production database connection. Verify in the actual X console that the interruption is resolved, the current billing cycle has spending capacity, the spending limit remains $10 or less and automatic recharge remains off. Only then clear that exact provider row with `DELETE FROM auth_provider_circuits WHERE provider='x' AND reason IN ('provider-credit-limit','provider-usage-cap');` and perform one real sign-in. Do not clear the circuit merely because credits were added during a still-capped cycle. The application neither purchases credits nor changes provider billing settings.

Use both environment files on every application command. Validate without printing resolved secrets:

```sh
docker compose --env-file .env.production --env-file release.env -f compose.yml config --quiet
docker compose --env-file .env.staging --env-file release.env -f compose.yml -f compose.staging.yml config --quiet
docker compose --env-file .env.edge --env-file release.env -f compose.edge.yml config --quiet
```

For additional structural checks, pipe `config --format json` directly into `node validate-topology.mjs production`, `staging` or `edge`; the checker prints no resolved environment. Caddy syntax must also pass `caddy validate` using the exact candidate image and edge file, as exercised by CI.

## 3. Isolated acceptance and cutover

Keep production `HUB_ACCESS_MODE=restricted`, the current operator numeric GitHub allowlist, `HUB_REGISTRATION_PAUSED=true`, and `HUB_ADMISSIONS_ENABLED=false` through migration. Workspace remains enabled separately. Do not set `HUB_PRIVATE_BETA=true` merely to enable the workspace.

1. Complete the candidate's synthetic tests: X/GitHub callback/error handling, provider linking, closure/export, connection recovery, stale credentials, quota races and all existing native/private research contracts. Run actual PostgreSQL tests, not only PGlite.
2. Before replacing the existing ingress, pause the two approved native routines while preserving their exact schedules and drain current leases. Record queued work and owner counts. Connection alone never starts new research.
3. Load the edge project with its observed existing TLS volumes. Its new ingress bridges may be created before the maintenance window, but start its published ports only after stopping the old port-owning web container. Never allow two Caddy processes to write the same certificate store concurrently.
4. Start the production application against the **existing** database volume using the candidate release and primary origin. Start the new static web on its internal port. Start the edge on 80/443. Check `/health` inside the hub and `/api/session` through the primary domain before changing registration settings.
5. Point the primary domain to the accepted VPS ingress and verify TLS, same-origin API, GitHub/X callbacks, secure cookies and intact owner/history counts. Native clients reject redirects, so a redirect from the old staging API is not an origin migration.
6. Reconnect each existing Bot through explicit reconnect approval, one at a time, preserving its Bot ID/history. Confirm a heartbeat and one bounded real result; verify the old token is rejected. Resume each approved native routine at its original schedule only after its new origin works.
7. Bring up fresh synthetic staging with `compose.yml` plus `compose.staging.yml`. Verify its owner database starts empty and its credentials/origin differ. Previous production-bound data now lives only at the primary origin.
8. Verify real clock-triggered receipt, a useful weekly decision and follow-up, independent-owner isolation and exact circle approval/revocation. Test 20 concurrent synthetic owners and a 40-check-in burst against isolated staging, recording latency, errors, resource peaks and accepted retries. Do not run synthetic failure/load tests against real owners.
9. Once the technical gates pass, set production `HUB_ACCESS_MODE=open`, `HUB_REGISTRATION_PAUSED=false`, `HUB_ADMISSIONS_ENABLED=true` and recreate only the hub. Smoke-test a fresh account and both sign-in methods, then inspect queued/active work. Keep X's budget control verified.

Use `up -d --no-build --pull never --wait` with the reviewed files. Stop unused staging using its own project/files; do not remove its volumes as part of routine stopping. Never invoke `down --volumes` on production.

## 4. Backup retention and account erasure

Target policy: three recent complete encrypted checkpoints on the VPS and 30 days off-host. Keep each backup root private and writable only by the operator. The inventory supports the existing `YYYYMMDDTHHMMSSZ` directories, containing exactly `COMMIT`, `IMAGE-IDS`, `database.dump.age`, `release.env`, `runtime.env.age` and `SHA256SUMS`. Fresh post-launch checkpoints also contain `closure-journal.tar.age`. Every payload must appear exactly once in `SHA256SUMS`; missing files, unexpected files, symlinks and mismatched hashes protect the entire checkpoint. The inventory separately reports invalid and unknown entries. Legacy flat `grokbot-YYYYMMDDTHHMMSSZ.dump.age`, `.dump.gpg`, `.sql.age`, `.sql.gpg` and corresponding `.gz` files remain supported.

Transfer the complete checkpoint to the established off-host location, then obtain a fresh inventory independently at each location. Save inventory JSON outside the backup roots, transfer it through the authenticated operator channel and verify its source. Inventory digests detect edits; they do not authenticate an unknown sender. Never generate a peer inventory from the same copy or treat a planned transfer as completed.

```sh
node backup-retention.mjs --directory /ABSOLUTE/OBSERVED/BACKUP/DIRECTORY --scope vps
node backup-retention.mjs --directory /ABSOLUTE/OBSERVED/OFFHOST/DIRECTORY --scope offhost
```

Use the opposite location's reviewed inventory to prepare whole-checkpoint verification receipts. Peer observations must be no more than 15 minutes old and cannot be future-dated; synchronize both clocks and obtain fresh observations after transfer. Each inventory has a stable content digest plus a separately bound observation timestamp/digest. The dry run matches every filename, size and hash, including the encrypted runtime settings, journal and checksum manifest. The receipt is an exclusive-create sidecar outside the checkpoint directory, named `<checkpoint>.verified.json`; it binds the complete checkpoint digest, all file hashes, the actual peer observation time and both peer digests. Applying a receipt never restamps an old observation as current. Missing copies remain unmatched and protected. Existing stale receipts need separate review and are never overwritten silently.

```sh
node backup-retention.mjs --directory /ABSOLUTE/OBSERVED/BACKUP/DIRECTORY --scope vps --peer-inventory /PROTECTED/WORK/offhost-inventory.json --peer-location verified-offhost-vault
node backup-retention.mjs --directory /ABSOLUTE/OBSERVED/BACKUP/DIRECTORY --scope vps --peer-inventory /PROTECTED/WORK/offhost-inventory.json --peer-location verified-offhost-vault --apply --inventory-sha256 EXACT_REVIEWED_RECEIPT_PLAN_SHA256
```

Repeat in the off-host location with `--scope offhost` and the freshly verified VPS inventory. Then produce new retention inventories. Review ignored/invalid entries, whole-checkpoint deletion candidates and `inventorySha256`. Applying retention requires the same directory/scope and exact reviewed digest:

```sh
node backup-retention.mjs --directory /ABSOLUTE/OBSERVED/BACKUP/DIRECTORY --scope vps --apply --inventory-sha256 EXACT_REVIEWED_SHA256
```

Changed inventories fail closed. Complete checkpoints and legacy flat files each retain their own three newest VPS slots; newer flat files cannot displace complete checkpoint sets. Legacy flat copies therefore require a separate reviewed retirement if exactly three total copies is desired. An exclusive operation lock prevents overlapping receipt/prune operations; a stale lock after an interrupted process requires operator inspection. Only exact reviewed regular files are removed, followed by removal of their now-empty checkpoint directory. No recursive removal or wildcard deletion is performed. Unknown archives and verification receipts remain for investigation/audit, so an unreviewed archive can extend actual retention. Verify the off-host location, encryption key recovery, encrypted-archive restore and scheduling before publishing the 30-day retention promise. This script does not provision remote storage or create a scheduler.

For each fresh post-launch checkpoint, establish a brief write barrier covering the hub's closure/revocation operations as well as research writes, and confirm pending journal records have completed. Back up the DB and a snapshot of the current independent journal under that same barrier. The journal is append-only, but copying while a new record is still being written can capture an incomplete file. Encrypt the journal archive directly through a pipe; never create a plaintext tar or private-key copy on the VPS:

```sh
# Variables below must be verified absolute paths in the operator's protected session.
# Run with pipefail; these are additions to the reviewed complete-checkpoint writer.
tar -C "$JOURNAL_ROOT" -cf - records | age --encrypt --recipients-file "$RECIPIENT_FILE" -o "$CHECKPOINT/closure-journal.tar.age.part"
mv "$CHECKPOINT/closure-journal.tar.age.part" "$CHECKPOINT/closure-journal.tar.age"
(cd "$CHECKPOINT" && sha256sum COMMIT IMAGE-IDS database.dump.age release.env runtime.env.age closure-journal.tar.age > SHA256SUMS.part && mv SHA256SUMS.part SHA256SUMS)
```

Resume the hub only after both snapshots finish, then verify and transfer the complete checkpoint. Require `includesJournal:true` for fresh post-launch checkpoints. Keep a separately maintained encrypted off-host copy of the accumulated journal, independent of checkpoint pruning, and verify its restore too. A paired journal snapshot is a recovery floor, not proof of the latest closure state: it must never replace newer records. If current closure history cannot be established after a disaster, recovery promotion stays blocked. Three local checkpoints and 30-day off-host expiry apply to checkpoint sets; retain independent journal markers for as long as any recoverable database backup could reintroduce their identities.

Account closure first durably records an explicit intent in the independent journal, then erases live owned content atomically and revokes sessions, Bot credentials and approvals. Explicit Bot revocations use the same journal. Each exclusive-create record holds an opaque owner ID, optional Bot ID, action and timestamp with a checksum; it contains no profile, research or credential material. Records are fsynced and made read-only; application code never updates or deletes them. Directory permissions and the isolated volume protect access. Storage failure reports completion as unconfirmed and does not proceed with the database mutation.

The in-process denylist blocks durably recorded closures/revocations even after an uncertain DB response. Pending intents are retried by maintenance. Every startup fully verifies and replays the journal before constructing the serving application. Unknown owners/Bots absent from an older backup are skipped while their records remain available for future restores; corrupt records stop startup. Do not delete the journal or replace it with an older copy during application rollback or DB restore. Keep protected off-host copies and their verification receipts independently; retain markers for as long as any database backup capable of restoring those records remains recoverable.

Contentless inaccessible citation tombstones preserve other owners' immutable references. Backups may still hold earlier content until verified expiry; already retained third-party copies cannot be recalled. Journal replay protects explicit account/Bot revocations, but an old backup can also restore an unlinked provider identity, logged-out session or pre-reconnect credential. The following quarantine gate is therefore mandatory for database disaster recovery.

## 5. Mandatory database restore quarantine

Restore into an isolated PostgreSQL database explicitly named `grokbot_restore_<unique_id>`, in a separate project/network with **no edge route or published app port**. Never overwrite the serving database. Use the accepted hub image to run `quarantine-restored-db.mjs`, mounted read-only at `/app/hub/quarantine-restored-db.mjs`, working directory `/app/hub`, with the current independent closure journal mounted at `/var/lib/grokbot-journal`. Supply the protected connection settings through a mode-600 environment file, not the command line:

```text
DATABASE_URL=postgresql://RESTORE_ONLY_USER:RESTORE_ONLY_SECRET@RESTORE_DATABASE_HOST/grokbot_restore_UNIQUE_ID
HUB_CLOSURE_JOURNAL_DIR=/var/lib/grokbot-journal/records
HUB_RESTORE_QUARANTINE=true
HUB_REGISTRATION_PAUSED=true
HUB_ADMISSIONS_ENABLED=false
```

Run a dry inventory first; it outputs counts and a digest, never credentials or record contents. Then apply the exact reviewed inventory:

```sh
node quarantine-restored-db.mjs
node quarantine-restored-db.mjs --apply --inventory-sha256 EXACT_REVIEWED_SHA256
```

The tool refuses ordinary production database names and unsafe admission flags. Applying upgrades the isolated schema, replays the current closure/revocation journal, deletes every restored session, OAuth state, pairing and enrollment; revokes all restored Bot credentials; suspends every remaining active owner; deactivates circle membership; and cancels active work. Repeating it is safe. Its result always says `publicExposureAllowed:false` and `identityReconciliationRequired:true`.

Keep all restored owners suspended while the operator reconciles each account's **currently authorized immutable provider IDs** against trusted records outside the old backup and independent owner verification. An identity present in the backup is not proof it remains linked. Remove stale identities before selectively reactivating an owner. If current identity or closure status cannot be established, keep that owner suspended. Reconnect new Bot credentials only after identity reconciliation, then explicitly reapprove circle membership and desired native routines. Do not expose the recovered workspace or resume restored routines before this protected reconciliation and independent privacy check. There is deliberately no bulk unsuspend/unquarantine command.

If the current closure journal is unavailable, stop recovery promotion. An empty newly created journal cannot prove prior closure status. Application image rollback against the unchanged current database does not invoke disaster-recovery quarantine.

## 6. Rollback and observation

Prefer reverting to a compatible tested application image while keeping the production origin, database and current closure journal. Preserve writes made since cutover. Recheck secure sessions, owner status, connection generations and existing leases after rollback. A database restore must pass the quarantine/reconciliation procedure above. DNS rollback alone does not recover OAuth or native clients.

During launch, monitor memory, filesystem headroom, DB connections, 4xx/5xx counts, API latency, admission pressure, task-result retries, stuck leases and connection failures. Log aggregate operational facts, not OAuth codes, cookies, bearer tokens, device secrets or private evidence. The first external owners' useful decisions and returns establish relevance; visual engagement and internal fixtures do not.

Reference behaviour: [Docker Compose networks](https://docs.docker.com/reference/compose-file/networks/), [resource and service settings](https://docs.docker.com/reference/compose-file/services/), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
