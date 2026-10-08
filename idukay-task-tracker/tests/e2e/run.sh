#!/usr/bin/env bash
# End-to-end test of the web app against a local Supabase-like stack
# (real Supabase Auth + PostgREST + our migrations + our sync function) with the demo data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LS="$ROOT/scripts/localstack"
S=local-dev-only-jwt-secret-0123456789abcdef
"$LS/stop.sh" >/dev/null 2>&1 || true
"$LS/setup.sh" > /dev/null 2>&1
"$LS/start.sh" > /dev/null
"$LS/web-env.sh"
cd "$ROOT"
SEED=$(SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=$(LS_JWT_SECRET=$S node "$LS/keys.mjs" service_role) \
  SUPABASE_ANON_KEY=$(LS_JWT_SECRET=$S node "$LS/keys.mjs" anon) node scripts/seed-demo.mjs)
export FAMILY_LINK=$(echo "$SEED" | sed -n 's/^Parent link: //p')
cd "$ROOT/web"
node node_modules/vite/bin/vite.js --mode e2e --port 5173 --strictPort > /tmp/itt-vite.log 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null; "$LS/stop.sh" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null localhost:5173 && break; sleep 0.5; done
cd "$ROOT"
node tests/e2e/app.e2e.mjs "${E2E_SHOTS:-$ROOT/tests/e2e/screenshots}"
