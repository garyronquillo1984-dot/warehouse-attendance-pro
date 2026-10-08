#!/usr/bin/env bash
cd "$(dirname "$0")"; source ./env.sh
for s in smtp auth postgrest functions gateway; do
  [ -f "$LS_ROOT/$s.pid" ] && kill "$(cat "$LS_ROOT/$s.pid")" 2>/dev/null || true
  rm -f "$LS_ROOT/$s.pid"
done
