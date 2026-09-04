#!/usr/bin/env bash
# Usage: bash deployment/load-release.sh FULL_EXPECTED_COMMIT_SHA
# The release archives and SHA256SUMS must be in the parent directory.
set -euo pipefail
expected="${1:?Expected full commit SHA from the accepted GitHub release}"
[[ "$expected" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid expected commit SHA' >&2; exit 1; }
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "$(cat "$here/COMMIT")" == "$expected" ]] || { echo 'Release commit mismatch' >&2; exit 1; }
cd "$here/.."
sha256sum --check --strict SHA256SUMS
docker image load --input runtime-images.tar.gz
count=0
declare -A seen=()
while read -r ref expected_id; do
  [[ "$ref" =~ ^grokbot-social-(hub|web|postgres):sha-$expected$ ]] || { echo 'Unexpected release image' >&2; exit 1; }
  [[ -z "${seen[$ref]:-}" ]] || { echo 'Duplicate release image' >&2; exit 1; }
  seen[$ref]=1
  [[ "$expected_id" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'Invalid image ID' >&2; exit 1; }
  actual_id="$(docker image inspect --format '{{.Id}}' "$ref")"
  [[ "$actual_id" == "$expected_id" ]] || { echo 'Loaded image differs from tested release' >&2; exit 1; }
  count=$((count + 1))
done < "$here/IMAGE-IDS"
[[ "$count" -eq 3 ]] || { echo 'Release must contain three image identities' >&2; exit 1; }
echo 'Release images verified. Configure deployment/.env on this host, then start Compose with release.env.'
