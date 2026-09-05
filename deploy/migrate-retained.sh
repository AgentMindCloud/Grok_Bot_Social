#!/usr/bin/env bash
# Requires candidate ingress prepared, retained DB running and old hub stopped.
set -euo pipefail
umask 077
[[ $(id -u) == 0 && $(hostname -s) == srv1955260 ]]
root=/opt/grokbot-social
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ "$here" == "$root/releases/"*/deployment ]]
expected=${1:?Expected accepted full commit}
[[ "$expected" =~ ^[a-f0-9]{40}$ && $(cat "$here/COMMIT") == "$expected" ]]
[[ -z $(docker ps -q --filter label=com.docker.compose.project=grokbot-social --filter label=com.docker.compose.service=hub) ]]
cd "$here"
compose=(docker compose --env-file "$root/runtime.env" --env-file release.env -f compose.yml)
"${compose[@]}" config --quiet
# Explicit bootstrap only; create never replaces an occupied named volume.
docker volume create grokbot-social_closure-journal >/dev/null
"${compose[@]}" run --rm --no-deps journal-init >/dev/null
install -d -m 0700 "$root/operations"
run() {
  "${compose[@]}" run --rm --no-deps -T \
    -e HUB_MIGRATION_WRITE_BARRIER=stopped -e HUB_ACCESS_MODE=restricted \
    -e HUB_REGISTRATION_PAUSED=true -e HUB_ADMISSIONS_ENABLED=false -e HUB_POOL_ENABLED=false \
    -e "HUB_MIGRATION_INVENTORY_SHA256=${inventory:-}" \
    --entrypoint node hub --input-type=module - "$1" < "$here/migrate-retained.mjs"
}
run inventory > "$root/operations/pre-migration.json"
image=$(awk -F= '$1=="HUB_IMAGE"{print $2}' release.env)
inventory=$(docker run --rm --user 0:0 --network none --read-only --memory 64m --pids-limit 30 --cap-drop ALL \
  -v "$root/operations/pre-migration.json:/inventory.json:ro" "$image" node -e "console.log(require('/inventory.json').inventorySha256)")
[[ "$inventory" =~ ^[a-f0-9]{64}$ ]]
run apply > "$root/operations/migration-$(date -u +%Y%m%dT%H%M%SZ).json"
printf 'Retained migration and journal bootstrap completed. Hub remains stopped pending verification.\n'
