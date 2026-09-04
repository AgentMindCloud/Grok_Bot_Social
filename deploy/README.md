# Same-origin production deployment

The public frontend can run on GitHub Pages. The signed-in workspace needs the hub API and PostgreSQL on the **same HTTPS origin**. This stack serves all three behind Caddy with automatic TLS. It is intended for a dedicated deployment target with ports 80/443 available; do not run it over an existing site's ingress without first reconciling that host's configuration.

## Prepare

1. Use a Linux amd64 Docker Engine host with the Compose plugin and the **classic image store** used by the release checks. A dedicated Hostinger KVM 1 is a reasonable initial pilot target: native Grok computation stays on the provider, and the VPS runs this hub, PostgreSQL and Caddy. This is an initial sizing estimate, not a load-tested capacity guarantee. A static web-hosting plan alone cannot run this API or database.
2. Point a staging host name you control at that server. Keep the current public domain unchanged during validation.
3. Register a GitHub OAuth application with the staging homepage and callback `https://<host>/api/auth/github/callback`. No repository or email scope is requested. Store the client secret only on the deployment host.
4. Download a passing `runtime-<commit>` release from this repository. The CI release contains the exact three images used in its deployment checks, so the VPS needs no registry account or application build. Use a separate directory for each release and record its full accepted commit. Review the linked CI run before installing.

```bash
revision=REPLACE_WITH_FULL_ACCEPTED_COMMIT_SHA
release="runtime-${revision:0:12}"
base="https://github.com/AgentMindCloud/Grok_Bot_Social/releases/download/$release"
curl --fail --location --proto '=https' -O "$base/runtime-images.tar.gz"
curl --fail --location --proto '=https' -O "$base/deployment.tar.gz"
curl --fail --location --proto '=https' -O "$base/SHA256SUMS"
sha256sum --check --strict SHA256SUMS
tar -xzf deployment.tar.gz
bash deployment/load-release.sh "$revision"
```

Checksums detect corruption; obtain both the archives and checksums from the trusted repository release. The loader also checks the expected commit and each Docker image's content ID. Never run deployment scripts supplied by a bot task or untrusted source page.

Fresh Docker Engine 29 installations default to the containerd image store, which reports manifest identities instead of the classic config identities recorded by this release pipeline. The loader stops on that backend. On a **new, unoccupied host**, merge `"features": {"containerd-snapshotter": false}` into `/etc/docker/daemon.json`, preserve existing settings, run `dockerd --validate --config-file=/etc/docker/daemon.json`, and restart Docker. Check that `docker info --format '{{.Driver}}'` reports `overlay2` before loading the release. Do not switch an occupied host casually: images and containers in the previous store become hidden, although their data remains on disk. See [Docker's image-store documentation](https://docs.docker.com/engine/storage/containerd/). This requirement was verified on the initial KVM 1 deployment with Docker 29.8.0; no image identity check was bypassed.

5. In the extracted `deployment/` directory, copy `.env.example` to `.env` with mode 600. Set the domain, OAuth settings, a unique random hexadecimal application database password (at least 32 characters), and a different database administrator password. Store these values on the host, outside Git and chat. The bundled `release.env` contains only the tested image references.
6. Validate without printing resolved secrets, then start the loaded images:

```bash
docker compose --env-file .env --env-file release.env config --quiet
docker compose --env-file .env --env-file release.env up -d --no-build --pull never --wait
```

Use both `--env-file` arguments for subsequent Compose commands. A release contains no database contents, credentials or TLS state; those remain in the persistent host volumes and operator-owned configuration.

For development or CI builds from the repository root, use `docker compose -f deploy/compose.yml -f deploy/compose.build.yml build`, followed by the base Compose file. The production base file has no build directives. Publishing a release first requires both CI jobs to pass; a failed upload may leave an unpublished draft for operator inspection.

Only Caddy publishes ports. PostgreSQL stays on an internal Docker network. The hub runs as a non-root user with a read-only filesystem, local developer login disabled, and production startup checks. Its database role owns only the application database and cannot create other databases or roles, replicate, or act as a superuser. The administrator password is never given to the hub. The initialization script applies only to a new empty volume. Existing installations need an explicit role migration. Credentials persist through PostgreSQL's named volume; changing `.env` does not rotate an existing database password. See the [official PostgreSQL image initialization behavior](https://hub.docker.com/_/postgres).

## Verify the candidate

- `docker compose --env-file .env --env-file release.env ps` must show a healthy database and hub.
- `https://<host>/api/session` must return `authenticated:false`, `localLoginEnabled:false`, and `githubLoginEnabled:true`.
- Complete GitHub sign-in as an invited test owner. Confirm HttpOnly/Secure cookies and same-origin CSRF protection.
- Pair an actual original Grok Bot using the [native integration guide](https://github.com/AgentMindCloud/Grok_Bot_Social/blob/main/docs/NATIVE-GROK-INTEGRATION.md). Record its first check-in, one sourced result and a revoked credential rejection. A local CLI test is not native acceptance.
- Use two distinct test owners to verify circle invites, explicit mission participation, private drafts, exact-content approval, and loss of access after membership removal.
- Test restart persistence and a backup restore into a separate disposable database before accepting real work.

## Backup, rollback and rollout

Before an upgrade, retain the currently deployed Git commit and image IDs and make an encrypted database backup. PostgreSQL backups must be stored outside the Docker host; Docker volumes are not backups. Set a retention and restore-test schedule with the operator. Do not use `docker compose down --volumes` against retained data.

Migrations are forward-applied at API startup under an advisory lock. Review each new migration before deploy; restoring an older application does not undo schema changes. If rollback needs a database restore, stop incoming writes and restore into a new database first.

After staging passes, configure the production host and its matching GitHub callback. DNS cutover should preserve the previous Pages records for rollback. Keep the public frontend and `/api/*` on one origin; do not point `NEXT_PUBLIC_HUB_API_URL` at a different origin as a shortcut, since cross-origin owner sessions are intentionally unsupported.

This repository contains deployment configuration. A running production API, purchased hosting, OAuth credentials, DNS changes, backups and actual native account execution are separate environment-dependent steps and are not established by a successful image build.
