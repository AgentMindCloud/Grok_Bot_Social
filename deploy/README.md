# Same-origin production deployment

The public frontend can run on GitHub Pages. The signed-in workspace needs the hub API and PostgreSQL on the **same HTTPS origin**. This stack serves all three behind Caddy with automatic TLS. It is intended for a dedicated deployment target with ports 80/443 available; do not run it over an existing site's ingress without first reconciling that host's configuration.

## Prepare

1. Use a Docker Compose v2 host, such as an appropriately sized Hostinger VPS. A static web-hosting plan alone cannot run this API or database.
2. Point a staging host name you control at that server. Keep the current public domain unchanged during validation.
3. Register a GitHub OAuth application with the staging homepage and callback `https://<host>/api/auth/github/callback`. No repository or email scope is requested. Store the client secret only on the deployment host.
4. Copy `.env.example` to `.env` beside `compose.yml`. Set the domain, OAuth settings, a unique random hexadecimal application database password (at least 32 characters), and a different database administrator password. Set file permissions so only the operator can read it. Never paste or commit these values.
5. From `deploy/`, run `docker compose config --quiet` to validate without printing resolved secrets, then `docker compose up --build -d`.

Only Caddy publishes ports. PostgreSQL stays on an internal Docker network. The hub runs as a non-root user with a read-only filesystem, local developer login disabled, and production startup checks. Its database role owns only the application database and cannot create other databases or roles, replicate, or act as a superuser. The administrator password is never given to the hub. The initialization script applies only to a new empty volume. Existing installations need an explicit role migration. Credentials persist through PostgreSQL's named volume; changing `.env` does not rotate an existing database password. See the [official PostgreSQL image initialization behavior](https://hub.docker.com/_/postgres).

## Verify the candidate

- `docker compose ps` must show a healthy database and hub.
- `https://<host>/api/session` must return `authenticated:false`, `localLoginEnabled:false`, and `githubLoginEnabled:true`.
- Complete GitHub sign-in as an invited test owner. Confirm HttpOnly/Secure cookies and same-origin CSRF protection.
- Pair an actual original Grok Bot using the [native integration guide](../docs/NATIVE-GROK-INTEGRATION.md). Record its first check-in, one sourced result and a revoked credential rejection. A local CLI test is not native acceptance.
- Use two distinct test owners to verify circle invites, explicit mission participation, private drafts, exact-content approval, and loss of access after membership removal.
- Test restart persistence and a backup restore into a separate disposable database before accepting real work.

## Backup, rollback and rollout

Before an upgrade, retain the currently deployed Git commit and image IDs and make an encrypted database backup. PostgreSQL backups must be stored outside the Docker host; Docker volumes are not backups. Set a retention and restore-test schedule with the operator. Do not use `docker compose down --volumes` against retained data.

Migrations are forward-applied at API startup under an advisory lock. Review each new migration before deploy; restoring an older application does not undo schema changes. If rollback needs a database restore, stop incoming writes and restore into a new database first.

After staging passes, configure the production host and its matching GitHub callback. DNS cutover should preserve the previous Pages records for rollback. Keep the public frontend and `/api/*` on one origin; do not point `NEXT_PUBLIC_HUB_API_URL` at a different origin as a shortcut, since cross-origin owner sessions are intentionally unsupported.

This repository contains deployment configuration. A running production API, purchased hosting, OAuth credentials, DNS changes, backups and actual native account execution are separate environment-dependent steps and are not established by a successful image build.
