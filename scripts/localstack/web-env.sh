#!/usr/bin/env bash
# Writes web/.env.e2e pointing the app at the local stack (never committed).
set -euo pipefail
cd "$(dirname "$0")"; source ./env.sh
cat > ../../web/.env.e2e <<ENV
VITE_SUPABASE_URL=http://localhost:$LS_GATEWAY_PORT
VITE_SUPABASE_PUBLISHABLE_KEY=$(LS_JWT_SECRET=$LS_JWT_SECRET node keys.mjs anon)
VITE_SUPPORT_EMAIL=support@example.com
ENV
