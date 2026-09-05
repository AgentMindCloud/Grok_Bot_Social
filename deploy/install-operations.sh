#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 && $(hostname -s) == srv1955260 ]]
root=/opt/grokbot-social
here=$(readlink -f "$root/current")
[[ "$here" == "$root/releases/"*/deployment ]]
# Validate all units before installing any of them. No cron dependencies.
systemd-analyze verify "$here/systemd/bottocks-operation@.service" "$here/systemd/"*.timer
install -d -m 0700 "$root/operations" "$root/operations/reports"
install -m 0644 "$here/systemd/bottocks-operation@.service" /etc/systemd/system/
for job in health maintenance backup retention report; do install -m 0644 "$here/systemd/bottocks-$job.timer" /etc/systemd/system/; done
systemctl daemon-reload
for job in health maintenance backup retention report; do systemctl enable --now "bottocks-$job.timer"; done
systemctl list-timers 'bottocks-*' --all --no-pager
printf 'Schedules installed. Verify an actual job and its protected receipt before claiming operations acceptance.\n'
