#!/usr/bin/env bash
# This script creates and removes disposable CI resources only.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'CI smoke is restricted to disposable GitHub Actions runners' >&2; exit 1; }
# The import gate compares classic Docker configuration IDs. Detect runner
# image-store drift before spending time building or creating test resources.
store="$(docker info --format '{{json .DriverStatus}}')"
if [[ "$store" == *io.containerd.snapshotter* ]]; then
  echo 'CI requires a disposable runner using the classic Docker image store, matching load-release.sh. No resources were created.' >&2
  exit 1
fi
export PUBLIC_HOST=hub.example.com STACK_ALIAS=production FRONT_NETWORK=grokbot-social_production-ingress EDGE_TRUSTED_IP=172.30.61.2
export DATABASE_VOLUME=grokbot-social-ci_database TLS_DATA_VOLUME=grokbot-social-ci_tls-data TLS_CONFIG_VOLUME=grokbot-social-ci_tls-config
export CLOSURE_JOURNAL_VOLUME=grokbot-social-ci_closure-journal
export PRODUCTION_SITE=http://hub.example.com STAGING_SITE=http://staging.example.com
export POSTGRES_PASSWORD=ci_production_app_0123456789abcdef POSTGRES_ADMIN_PASSWORD=ci_production_admin_0123456789abcdef
export GITHUB_CLIENT_ID=ci-production-client GITHUB_CLIENT_SECRET=ci-production-placeholder
export HUB_PRIVATE_BETA=false HUB_ACCESS_MODE=restricted HUB_BETA_ALLOWED_GITHUB_IDS=123 HUB_BETA_INTERNAL_GITHUB_IDS=123
export HUB_REGISTRATION_PAUSED=false HUB_ADMISSIONS_ENABLED=true HUB_WEEKLY_RESEARCH_ENABLED=true
app=(docker compose -f deploy/compose.yml)
edge=(docker compose -f deploy/compose.edge.yml)
stage() {
  STACK_ALIAS=staging PUBLIC_HOST=staging.example.com FRONT_NETWORK=grokbot-social_staging-ingress EDGE_TRUSTED_IP=172.30.62.2 \
  POSTGRES_PASSWORD=ci_staging_app_distinct_0123456789 POSTGRES_ADMIN_PASSWORD=ci_staging_admin_distinct_0123456789 \
  GITHUB_CLIENT_ID=ci-staging-client GITHUB_CLIENT_SECRET=ci-staging-placeholder \
  HUB_ACCESS_MODE=restricted HUB_BETA_INTERNAL_GITHUB_IDS= HUB_BETA_TEST_GITHUB_IDS=123 \
    docker compose -f deploy/compose.yml -f deploy/compose.staging.yml "$@"
}
cleanup() {
  local status=$?
  if ((status != 0)); then
    # Inspect only these disposable CI projects, before teardown removes the
    # container logs and health-check output needed to diagnose startup errors.
    "${app[@]}" ps -a || true
    "${app[@]}" logs --no-color --tail=80 || true
    stage logs --no-color --tail=80 || true
    "${edge[@]}" logs --no-color --tail=80 || true
    for container in $("${app[@]}" ps -aq) $(stage ps -aq) $("${edge[@]}" ps -aq); do
      docker inspect --format '{{.Name}} {{json .State}}' "$container" || true
    done
  fi
  stage down --volumes || true
  "${app[@]}" down || true
  "${edge[@]}" down || true
  docker volume rm grokbot-social-ci_database grokbot-social-ci_tls-data grokbot-social-ci_tls-config grokbot-social-ci_closure-journal || true
  return "$status"
}
trap cleanup EXIT
"${app[@]}" config --format json | node deploy/validate-topology.mjs production
stage config --format json | node deploy/validate-topology.mjs staging
"${edge[@]}" config --format json | node deploy/validate-topology.mjs edge
docker compose -f deploy/compose.yml -f deploy/compose.build.yml build
docker run --rm -e PUBLIC_HOST=:8080 grokbot-social-web:local caddy validate --config /etc/caddy/Caddyfile
docker run --rm -e PRODUCTION_SITE=http://hub.example.com -e STAGING_SITE=http://staging.example.com \
  -v "$PWD/deploy/Caddyfile.edge:/etc/caddy/Caddyfile:ro" grokbot-social-web:local caddy validate --config /etc/caddy/Caddyfile
docker volume create "$DATABASE_VOLUME" >/dev/null
docker volume create "$CLOSURE_JOURNAL_VOLUME" >/dev/null
docker volume create "$TLS_DATA_VOLUME" >/dev/null
docker volume create "$TLS_CONFIG_VOLUME" >/dev/null
"${edge[@]}" up -d --no-build --wait
"${app[@]}" up -d --no-build --wait
SMOKE_ACCESS_MODE=restricted node deploy/smoke.mjs
"${app[@]}" exec -T hub node --input-type=module -e \
  "import assert from 'node:assert/strict'; import pg from 'pg'; const db=new pg.Client({connectionString:process.env.DATABASE_URL}); await db.connect(); const {rows}=await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user'); for(const value of Object.values(rows[0])) assert.equal(value,false); const migrations=await db.query('SELECT version FROM schema_migrations ORDER BY version'); assert.deepEqual(migrations.rows.map(r=>r.version),[1,2,3,4,5,6,7]); await db.end(); console.log('Restricted database role and migrations 1–7 verified');"
export HUB_ACCESS_MODE=open
"${app[@]}" up -d --no-build --wait hub
SMOKE_ACCESS_MODE=open node deploy/smoke.mjs
# Empty production and empty staging cannot prove separation. Keep one
# synthetic production-only marker present while inspecting staging.
"${app[@]}" exec -T hub node --input-type=module -e \
  "import pg from 'pg'; const db=new pg.Client({connectionString:process.env.DATABASE_URL}); await db.connect(); await db.query(\"INSERT INTO owners(id,handle,display_name,account_classification) VALUES('ci-production-isolation-sentinel','ci-isolation','Synthetic CI isolation marker','test')\"); await db.end();"
stage up -d --no-build --wait
SMOKE_HOST=staging.example.com SMOKE_ACCESS_MODE=restricted node deploy/smoke.mjs
# This is startup/isolation smoke, not the real-owner load or native clock gate.
stage exec -T hub node --input-type=module -e \
  "import assert from 'node:assert/strict'; import pg from 'pg'; const db=new pg.Client({connectionString:process.env.DATABASE_URL}); await db.connect(); assert.equal(Number((await db.query('SELECT count(*) FROM owners')).rows[0].count),0); await db.end(); console.log('Synthetic staging database starts empty');"
"${app[@]}" exec -T hub node --input-type=module -e \
  "import assert from 'node:assert/strict'; import pg from 'pg'; const db=new pg.Client({connectionString:process.env.DATABASE_URL}); await db.connect(); const deleted=await db.query(\"DELETE FROM owners WHERE id='ci-production-isolation-sentinel' RETURNING id\"); assert.equal(deleted.rowCount,1); await db.end(); console.log('Production marker existed only in production and was removed');"
# Bind the mutable packaging refs to the images that actually passed smoke.
for service in hub web database; do
  case "$service" in
    hub) ref=grokbot-social-hub:local ;;
    web) ref=grokbot-social-web:local ;;
    database) ref=postgres:17-alpine ;;
  esac
  container="$("${app[@]}" ps -q "$service")"
  [[ -n "$container" ]] || { echo 'Expected running smoke container is missing' >&2; exit 1; }
  tested_id="$(docker inspect --format '{{.Image}}' "$container")"
  packaged_id="$(docker image inspect --format '{{.Id}}' "$ref")"
  [[ "$tested_id" == "$packaged_id" ]] || { echo 'Packaging reference differs from the image that passed smoke' >&2; exit 1; }
done
bash deploy/package-release.sh "$GITHUB_SHA" dist-release
for service in hub web postgres; do
  ref="grokbot-social-$service:sha-$GITHUB_SHA"
  docker image rm "$ref"
  if docker image inspect "$ref" >/dev/null 2>&1; then
    echo 'Release tag must be absent before the import check' >&2
    exit 1
  fi
done
bash dist-release/deployment/load-release.sh "$GITHUB_SHA"
