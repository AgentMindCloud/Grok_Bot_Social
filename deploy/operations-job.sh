#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/opt/grokbot-social
[[ $(id -u) == 0 && $(hostname -s) == srv1955260 ]]
job=${1:?Expected operations job}
[[ "$job" =~ ^(health|maintenance|backup|retention|report)$ ]]
install -d -m 0700 "$root/operations" "$root/operations/reports"
if [[ "${2:-}" != worker-locked ]]; then exec 9>"$root/operations/job.lock"; fi
# One operation at a time. Lock contention is a visible skip, never duplicate work.
if [[ "${2:-}" != worker-locked ]] && ! flock -w 5 9; then printf 'Skipped %s: another operation holds the lock.\n' "$job"; exit 0; fi
here=$(readlink -f "$root/current")
[[ "$here" == "$root/releases/"*/deployment ]]
cd "$here"
compose=(docker compose --env-file "$root/runtime.env" --env-file release.env -f compose.yml)
run=${2:-}
if [[ "$run" != worker-locked ]]; then
  case "$job" in health) limit=60;; maintenance) limit=120;; backup) limit=300;; retention|report) limit=120;; esac
  # The worker inherits FD9; no second flock is taken. The subprocess group is
  # bounded so an unavailable dependency cannot leave a hung daily job.
  exec timeout --signal=TERM --kill-after=20 "$limit" bash "$here/operations-job.sh" "$job" worker-locked
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
report="$root/operations/reports/$stamp-$job.json"
finish() {
  status=$?
  trap - EXIT
  if ((status!=0)); then
    failure="$root/operations/reports/$stamp-$job-failure.json"
    printf '{"job":"%s","ok":false,"exitCode":%d,"observedAt":"%s"}\n' "$job" "$status" "$stamp" > "$failure"
    hook="$root/operations/alert-hook"
    if [[ -x "$hook" && $(stat -c '%u:%a' "$hook") == 0:700 ]]; then timeout 15 "$hook" "$failure" || true; fi
  fi
  exit "$status"
}
trap finish EXIT
case "$job" in
  maintenance)
    "${compose[@]}" exec -T hub node --input-type=module - maintenance < "$here/operations.mjs" > "$report"
    ;;
  backup)
    bash "$here/checkpoint.sh"
    hook="$root/operations/offhost-hook"
    if [[ -x "$hook" && $(stat -c '%u:%a' "$hook") == 0:700 ]]; then
      timeout 90 "$hook" "$(cat "$root/operations/last-backup")"
    else
      echo 'Encrypted checkpoint exists. Off-host receiver is unconfigured; no transfer or receipt claimed.' >&2
    fi
    printf '{"job":"backup","ok":true,"checkpoint":"%s","observedAt":"%s"}\n' "$(cat "$root/operations/last-backup")" "$stamp" > "$report"
    ;;
  retention)
    # Host has no Node installation. Run the accepted image with no network and
    # mount only the explicit backup directory and reviewed retention code.
    image=$(docker inspect --format '{{.Image}}' "$("${compose[@]}" ps -q hub)")
    mode=inventory
    if [[ -f "$root/operations/enable-verified-retention" && $(stat -c '%u:%a' "$root/operations/enable-verified-retention") == 0:600 ]]; then mode=apply; fi
    docker run --rm --user 0:0 --network none --read-only --memory 128m --pids-limit 30 --cap-drop ALL \
      -v "$root/backups:$root/backups" -v "$here/backup-retention.mjs:/app/hub/backup-retention.mjs:ro" \
      "$image" node --input-type=module - "$root/backups" "$mode" > "$report" <<'NODE'
import{inventoryBackups,applyRetention}from'./backup-retention.mjs';
const root=process.argv[2],apply=process.argv[3]==='apply';
const plan=await inventoryBackups(root,'vps');
if(plan.invalid.length)throw Error('Invalid checkpoints require review; retention not applied');
const result=apply?await applyRetention(root,'vps',plan.inventorySha256):{dryRun:true,candidates:plan.candidates};
console.log(JSON.stringify({job:'retention',observedAt:new Date().toISOString(),...result}));
NODE
    ;;
  health)
    # Aggregate host state only; docker environment and database content omitted.
    envFile="$root/operations/health-input.json"
    printf '{"containers":{' > "$envFile"
    separator=''
    for service in database hub web edge; do
      if [[ "$service" == edge ]]; then name=grokbot-social-edge-edge-1; else name="grokbot-social-$service-1"; fi
      printf '%s"%s":' "$separator" "$service" >> "$envFile"
      docker inspect --format '{"running":{{.State.Running}},"oomKilled":{{.State.OOMKilled}},"restarts":{{.RestartCount}},"health":"{{if .State.Health}}{{.State.Health.Status}}{{end}}"}' "$name" >> "$envFile"
      separator=,
    done
    disk=$(df -B1 --output=avail "$root" | tail -1 | tr -d ' ')
    memory=$(awk '/MemAvailable:/{printf "%.0f",$2*1024}' /proc/meminfo)
    ageSeconds=999999999
    offhost=false
    if [[ -f "$root/operations/last-backup" ]]; then
      latest=$(cat "$root/operations/last-backup")
      [[ "$latest" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
      ageSeconds=$(( $(date +%s) - $(stat -c %Y "$root/backups/$latest/SHA256SUMS") ))
      if [[ -f "$root/backups/$latest.verified.json" ]]; then offhost=true; fi
    fi
    revision=$(cat COMMIT)
    actual=$(docker inspect --format '{{.Config.Image}}' "$("${compose[@]}" ps -q hub)")
    actual=${actual##*:sha-}
    printf '},"diskFreeBytes":%s,"memoryAvailableBytes":%s,"backupAgeSeconds":%s,"offhostVerified":%s,"expectedCommit":"%s","actualCommit":"%s"}\n' "$disk" "$memory" "$ageSeconds" "$offhost" "$revision" "$actual" >> "$envFile"
    image=$(docker inspect --format '{{.Image}}' "$("${compose[@]}" ps -q hub)")
    docker run --rm --user 0:0 --network none --read-only --cap-drop ALL --memory 128m --pids-limit 30 \
      -v "$here/operations.mjs:/app/hub/operations.mjs:ro" -v "$envFile:/app/hub/health-input.json:ro" -v "$root/backups:/backups:ro" -v "$here/backup-retention.mjs:/app/hub/backup-retention.mjs:ro" \
      "$image" node --input-type=module -e "import{readFile}from'node:fs/promises';import{healthVerdict}from'./operations.mjs';import{inventoryBackups}from'./backup-retention.mjs';const input=JSON.parse(await readFile('./health-input.json','utf8'));const backups=await inventoryBackups('/backups','vps');input.offhostVerified=!!backups.entries[0]?.verification;const result=healthVerdict(input);console.log(JSON.stringify({job:'health',observedAt:new Date().toISOString(),...result}));if(!result.ok)process.exitCode=1" > "$report"
    # Public TLS/origin check is independent of Docker's internal health checks.
    curl --fail --silent --show-error --max-time 10 --proto '=https' https://bottocks.fun/api/session >/dev/null
    ;;
  report)
    # No automatic AI actions or destination is invented. This durable report is
    # available for the human operator or an explicitly configured read-only hook.
    printf '{"job":"report","ok":true,"observedAt":"%s","recentReports":[' "$stamp" > "$report"
    find "$root/operations/reports" -maxdepth 1 -type f -name '*.json' -printf '%f\n' | sort | tail -20 | \
      awk 'BEGIN{sep=""}{printf "%s\"%s\"",sep,$0;sep=","}' >> "$report"
    printf ']}\n' >> "$report"
    ;;
esac
printf 'Completed %s; protected report: %s\n' "$job" "$report"
