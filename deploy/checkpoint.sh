#!/usr/bin/env bash
# A paused writer plus immutable journal validation establishes one checkpoint.
# Call only from the protected operations dispatcher (or an explicit cutover).
set -euo pipefail
umask 077
root=/opt/grokbot-social
[[ $(id -u) == 0 && $(hostname -s) == srv1955260 ]]
here=$(readlink -f "$root/current")
[[ "$here" == "$root/releases/"*/deployment ]]
cd "$here"
compose=(docker compose --env-file "$root/runtime.env" --env-file release.env -f compose.yml)
hub=$("${compose[@]}" ps -q hub)
[[ -n "$hub" && $(docker inspect --format '{{.State.Running}}' "$hub") == true ]]
# Refuse a legacy or incorrectly mounted app; it needs the separate schema-3
# checkpoint procedure and cannot masquerade as a journal-aware checkpoint.
journal=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grokbot-journal"}}{{.Name}}{{end}}{{end}}' "$hub")
[[ "$journal" == grokbot-social_closure-journal ]]
image=$(docker inspect --format '{{.Image}}' "$hub")
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]]
stamp=$(date -u +%Y%m%dT%H%M%SZ)
partial="$root/backups/.pending-$stamp"
target="$root/backups/$stamp"
[[ ! -e "$target" && ! -e "$partial" ]]
mkdir -m 0700 "$partial"
paused=false
finish() {
  status=$?
  trap - EXIT INT TERM
  if [[ "$paused" == true ]]; then docker unpause "$hub" >/dev/null || status=1; fi
  if ((status!=0)); then echo 'Checkpoint failed; protected pending files retained for inspection.' >&2; fi
  exit "$status"
}
trap finish EXIT
trap 'exit 143' TERM INT
paused=true
docker pause "$hub" >/dev/null
# Reject a writer paused during an incomplete journal append. Do not archive it
# or silently omit it; unpause on failure and let the next job retry afresh.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --pids-limit 30 \
  -v "$journal:/journal:ro" "$image" node --input-type=module -e \
  "import{readdir,readFile,lstat}from'node:fs/promises';import{createHash}from'node:crypto';let n=0;for(const name of await readdir('/journal/records')){if(!/^[a-f0-9-]{36}[.]json$/.test(name))throw Error('Journal name');const p='/journal/records/'+name;const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Journal file');const r=JSON.parse(await readFile(p,'utf8'));if(r.intent.schemaVersion!==1||!['account-close','bot-revoke','owner-suspend'].includes(r.intent.action)||r.intent.eventId+'.json'!==name||createHash('sha256').update(JSON.stringify(r.intent)).digest('hex')!==r.sha256)throw Error('Journal integrity');n++;}console.log('Validated journal records: '+n)"
"${compose[@]}" exec -T database pg_dump -U postgres -d grokbot -Fc |
  age --encrypt --recipients-file "$root/backup-recipient.pub" -o "$partial/database.dump.age"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 64m --pids-limit 30 \
  -v "$journal:/journal:ro" "$image" tar -C /journal -cf - records |
  age --encrypt --recipients-file "$root/backup-recipient.pub" -o "$partial/closure-journal.tar.age"
age --encrypt --recipients-file "$root/backup-recipient.pub" -o "$partial/runtime.env.age" "$root/runtime.env"
cp COMMIT IMAGE-IDS release.env "$partial/"
(cd "$partial" && sha256sum COMMIT IMAGE-IDS release.env database.dump.age runtime.env.age closure-journal.tar.age > SHA256SUMS && sha256sum --check --strict SHA256SUMS)
sync -f "$partial"
mv "$partial" "$target"
sync -f "$root/backups"
docker unpause "$hub" >/dev/null
paused=false
printf '%s\n' "$stamp" > "$root/operations/last-backup"
printf 'Verified encrypted checkpoint: %s\n' "$stamp"
