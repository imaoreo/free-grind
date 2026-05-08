#!/usr/bin/env sh
set -eu

PORTS="1420 1421"

for port in $PORTS; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Freeing port $port (PID: $pids) — sending SIGTERM"
    echo "$pids" | xargs kill -15 2>/dev/null || true
    sleep 1
    # Escalate to SIGKILL for any processes still running
    remaining="$(echo "$pids" | tr ' ' '\n' | while read -r pid; do
      kill -0 "$pid" 2>/dev/null && echo "$pid" || true
    done)"
    if [ -n "$remaining" ]; then
      echo "Port $port still busy (PID: $remaining) — sending SIGKILL"
      echo "$remaining" | xargs kill -9 2>/dev/null || true
    fi
  fi
done
