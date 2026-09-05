#!/usr/bin/env bash
# Application-only rollback: never restores a DB snapshot, removes volumes, or
# reverts public origin/consent. The fallback must explicitly support schema9.
set -euo pipefail
[[ $(id -u) == 0 && $(hostname -s) == srv1955260 ]]
root=/opt/grokbot-social
fallback=${1:?Accepted schema-compatible release directory}
expected=${2:?Expected full commit of accepted fallback}
fallback=$(readlink -f "$fallback")
[[ "$fallback" == "$root/releases/"*/deployment && "$expected" =~ ^[a-f0-9]{40}$ ]]
[[ $(cat "$fallback/COMMIT") == "$expected" && $(cat "$fallback/SUPPORTED-SCHEMA") == 9 ]]
[[ $(docker exec grokbot-social-database-1 psql -U postgres -d grokbot -Atc 'SELECT max(version) FROM schema_migrations') == 9 ]]
while read -r ref expected_id; do
  [[ "$ref" =~ ^grokbot-social-(hub|web|postgres):sha-$expected$ && "$expected_id" =~ ^sha256:[a-f0-9]{64}$ ]]
  [[ $(docker image inspect --format '{{.Id}}' "$ref") == "$expected_id" ]]
done < "$fallback/IMAGE-IDS"
[[ $(wc -l < "$fallback/IMAGE-IDS") == 3 ]]
cd "$fallback"
docker compose --env-file "$root/runtime.env" --env-file release.env -f compose.yml up -d --no-build --pull never --no-deps --wait --wait-timeout 120 hub web
ln -sfnT "$fallback" "$root/current"
printf 'Compatible hub/web rollback completed; retained database, journal and runtime origin preserved.\n'
