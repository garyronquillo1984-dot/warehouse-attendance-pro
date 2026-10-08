#!/usr/bin/env bash
# Starts SMTP sink, Supabase Auth, PostgREST and the gateway in the background.
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
./stop.sh >/dev/null 2>&1 || true
mkdir -p "$LS_ROOT/logs" "$LS_ROOT/mail"

nohup python3 smtp_sink.py "$LS_ROOT/mail" "$LS_SMTP_PORT" > "$LS_ROOT/logs/smtp.log" 2>&1 &
echo $! > "$LS_ROOT/smtp.pid"

env GOTRUE_API_HOST=127.0.0.1 PORT=$LS_AUTH_PORT \
  API_EXTERNAL_URL="http://localhost:$LS_GATEWAY_PORT/auth/v1" \
  GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth \
  DATABASE_URL="postgres://supabase_auth_admin:local@127.0.0.1:$PGPORT_LOCAL/$LS_DB?sslmode=disable" \
  GOTRUE_DB_MIGRATIONS_PATH="$LS_BIN/auth/migrations" \
  GOTRUE_SITE_URL="$LS_SITE_URL" GOTRUE_URI_ALLOW_LIST="$LS_SITE_URL/**,http://127.0.0.1:5173/**" \
  GOTRUE_JWT_SECRET="$LS_JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=$LS_SMTP_PORT GOTRUE_SMTP_USER=local GOTRUE_SMTP_PASS=local \
  GOTRUE_SMTP_ADMIN_EMAIL=noreply@local.test GOTRUE_SMTP_SENDER_NAME="Warehouse Attendance Pro" \
  GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 GOTRUE_PASSWORD_MIN_LENGTH=10 GOTRUE_LOG_LEVEL=warn \
  nohup "$LS_BIN/auth/auth" serve > "$LS_ROOT/logs/auth.log" 2>&1 &
echo $! > "$LS_ROOT/auth.pid"

cat > "$LS_ROOT/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:local@127.0.0.1:$PGPORT_LOCAL/$LS_DB"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$LS_JWT_SECRET"
server-host = "127.0.0.1"
server-port = $LS_REST_PORT
CONF
nohup "$LS_BIN/postgrest" "$LS_ROOT/postgrest.conf" > "$LS_ROOT/logs/postgrest.log" 2>&1 &
echo $! > "$LS_ROOT/postgrest.pid"

LS_GATEWAY_PORT=$LS_GATEWAY_PORT LS_AUTH_PORT=$LS_AUTH_PORT LS_REST_PORT=$LS_REST_PORT \
  nohup node gateway.mjs > "$LS_ROOT/logs/gateway.log" 2>&1 &
echo $! > "$LS_ROOT/gateway.pid"

sleep 2
echo "API URL:  http://localhost:$LS_GATEWAY_PORT"
echo "anon key: $(LS_JWT_SECRET=$LS_JWT_SECRET node keys.mjs anon)"
