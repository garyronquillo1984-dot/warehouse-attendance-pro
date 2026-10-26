#!/usr/bin/env bash
# Browser test of the recruiting module against the local stack. Usage: tests/e2e/run_recruiting.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LS="$ROOT/scripts/localstack"
"$LS/stop.sh" >/dev/null 2>&1 || true
"$LS/setup.sh" > /dev/null
"$LS/start.sh" > /dev/null
"$LS/web-env.sh"
cd "$ROOT/web"
node node_modules/vite/bin/vite.js --mode e2e --port 5173 --strictPort > /tmp/wap-vite.log 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null; "$LS/stop.sh" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null localhost:5173 && break; sleep 0.5; done
python3 "$ROOT/tests/e2e/recruiting_e2e.py" "${E2E_SHOTS:-$ROOT/tests/e2e/screenshots}"
