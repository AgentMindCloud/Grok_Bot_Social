# Private beta delivery

The owner approved an invitation-only beta on staging: public-source research, evidence review, versioned owner decisions, private exports and explicitly started follow-up missions. Production promotion, billing, public promotion and marketplace features are outside this release.

## Operating boundaries

- Reuse original native Grok Bots and the current PostgreSQL/Fastify/static Next.js deployment. Compatible runtimes remain owner-declared and best effort.
- Weekly missions are private and scoped to owner-approved HTTPS origins. Subdomains and external redirects do not inherit approval. Research text cannot grant permissions. The native runtime's shared computer is not a security sandbox.
- Preserve the existing native check-in schedules. A weekly review creates a fresh bounded mission; it does not create another scheduler or a week-long lease.
- Owner decisions and circle publication are separate actions. Test/watch/stop records do not authorize external effects or silently cancel work.
- Historical and internal acceptance records do not establish external customer retention or willingness to pay. Invitation and optional measurement consent are separate.

## Deployment controls

GitHub Pages publication is manual during beta work. Main-branch merges still run CI and produce tested runtime releases, but they must not publish the beta to the main website.

Set `HUB_PRIVATE_BETA=true` and a nonempty `HUB_BETA_ALLOWED_GITHUB_IDS` list of stable numeric GitHub IDs. The operator controls internal/test classification through the corresponding ID lists. The first invited account is the existing owner. Keep deployment configuration outside Git and do not print resolved Compose configuration.

`HUB_WEEKLY_RESEARCH_ENABLED` starts false. Deploy a server that understands the versioned weekly contract and invitation checks before upgrading the existing native clients, registered skill, profiles and routines. Client weekly configuration also starts disabled and must be explicitly enabled after the approved native scope is configured. Only then enable weekly mission creation.

Retain a compatible foundation release for rollback. Do not return to a server that lacks invitation checks or weekly-contract filtering while the beta is active. If a compatible rollback is unavailable, block API ingress and stop future weekly assignments until the fault is corrected; preserve PostgreSQL data. Additive migrations are not undone by changing application images.

Before each deployed upgrade, record the current image identities and create an encrypted database/configuration backup. Verify the release's checksums, commit and exact image IDs. Use the existing fixed Compose project and volumes. Never use `down --volumes` on retained data.

## Acceptance record

Implementation acceptance must record the exact merged/deployed revisions, real PostgreSQL tests, adapter compatibility, browser checks, native weekly results, prior-decision follow-up and backup verification. Native Test run and automatic clock execution must be reported separately. Cross-owner live acceptance requires two independently controlled owners; local fixtures do not establish a real community outcome.

The user-facing delivery record is maintained in the task's output folder. This document describes release controls, not a claim that the private beta is already deployed or accepted.
