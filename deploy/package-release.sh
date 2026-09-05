#!/usr/bin/env bash
# Run from the repository root, AFTER the deployment smoke checks.
set -euo pipefail
revision="${1:?Expected full Git commit SHA}"
output="${2:?Expected a new output directory}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
[[ ! -e "$output" ]] || { echo 'Output directory already exists; refusing to mix releases' >&2; exit 1; }
tag="sha-$revision"
mkdir -p "$output/deployment/db-init"

# Export the exact images used by the successful smoke test, including PostgreSQL.
docker image tag grokbot-social-hub:local "grokbot-social-hub:$tag"
docker image tag grokbot-social-web:local "grokbot-social-web:$tag"
docker image tag postgres:17-alpine "grokbot-social-postgres:$tag"
docker image save "grokbot-social-hub:$tag" "grokbot-social-web:$tag" "grokbot-social-postgres:$tag" |
  gzip -1 > "$output/runtime-images.tar.gz"

cp deploy/compose.yml deploy/compose.staging.yml deploy/compose.edge.yml deploy/Caddyfile.edge \
  deploy/.env.example deploy/.env.staging.example deploy/.env.edge.example deploy/.env.bottocks.example deploy/README.md \
  deploy/load-release.sh deploy/validate-topology.mjs deploy/backup-retention.mjs deploy/quarantine-restored-db.mjs deploy/smoke.mjs "$output/deployment/"
cp docs/OPEN-LAUNCH-OPERATIONS.md "$output/deployment/OPEN-LAUNCH-OPERATIONS.md"
cp docs/BOTTOCKS-OPERATIONS.md "$output/deployment/BOTTOCKS-OPERATIONS.md"
cp hub/POOL-API.md "$output/deployment/POOL-API.md"
cp deploy/db-init/10-app-role.sql "$output/deployment/db-init/"
printf 'HUB_IMAGE=grokbot-social-hub:%s\nWEB_IMAGE=grokbot-social-web:%s\nPOSTGRES_IMAGE=grokbot-social-postgres:%s\n' \
  "$tag" "$tag" "$tag" > "$output/deployment/release.env"
printf '%s\n' "$revision" > "$output/deployment/COMMIT"
for service in hub web postgres; do
  ref="grokbot-social-$service:$tag"
  printf '%s %s\n' "$ref" "$(docker image inspect --format '{{.Id}}' "$ref")"
done > "$output/deployment/IMAGE-IDS"

tar -czf "$output/deployment.tar.gz" -C "$output" deployment
(
  cd "$output"
  sha256sum runtime-images.tar.gz deployment.tar.gz > SHA256SUMS
)
echo 'Packaged tested images and non-secret deployment configuration.'
