#!/bin/sh
# Fake `corepack pnpm <script>`: records the job and the release SHA, fails when the image behavior says so.
script="$2"
sha="$(cat /etc/stub-sha)"
behavior="$(cat /etc/stub-behavior)"
# The long-running worker is not a job: it only keeps its heartbeat file fresh.
if [ "$script" = "worker:start" ] || [ "$script" = "worker:notifications" ]; then while true; do touch /tmp/worker-heartbeat; sleep 5; done; fi
echo "$script $sha" >> /log/events.log
if [ "$behavior" = "fail-migrate" ] && [ "$script" = "db:migrate" ]; then
  echo "stub migration failure" >&2
  exit 1
fi
exit 0
