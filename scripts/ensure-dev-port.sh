#!/usr/bin/env sh
set -eu

PORTS="1420 1421"

for port in $PORTS; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Freeing port $port (PID: $pids)"
    echo "$pids" | xargs kill -9
  fi
done
