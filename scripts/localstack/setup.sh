#!/usr/bin/env bash
# Builds a local stack that behaves like a Supabase project:
#   PostgreSQL (already running) + Supabase Auth (GoTrue) + PostgREST + a gateway on :54321.
# Recreates the database from scratch: Supabase Auth migrations, Supabase-style grants,
# then every file in supabase/migrations/ in order.
set -euo pipefail
cd "$(dirname "$0")"
source ./env.sh
mkdir -p "$LS_BIN" "$LS_ROOT/mail"

if [ ! -x "$LS_BIN/postgrest" ]; then
  curl -sSL -o /tmp/pgrst.tar.xz https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xJf /tmp/pgrst.tar.xz -C "$LS_BIN"
fi
if [ ! -x "$LS_BIN/auth/auth" ]; then
  curl -sSL -o /tmp/auth.tgz https://github.com/supabase/auth/releases/download/v2.180.0/auth-v2.180.0-x86.tar.gz
  mkdir -p "$LS_BIN/auth" && tar -xzf /tmp/auth.tgz -C "$LS_BIN/auth"
fi

PSQL="psql -h $PGHOST_SOCKET -p $PGPORT_LOCAL -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'local'; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login createrole noinherit password 'local'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
alter role supabase_auth_admin set search_path = auth;
SQL
$PSQL -d postgres -c "drop database if exists $LS_DB with (force);" -c "create database $LS_DB;"
$PSQL -d "$LS_DB" <<'SQL'
create schema auth authorization supabase_auth_admin;
create schema extensions;
create extension citext with schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
SQL
$PSQL -d "$LS_DB" -c "grant create on database $LS_DB to supabase_auth_admin;" 2>/dev/null || true

# Supabase Auth runs its own migrations (creates auth.users, auth.uid(), auth.jwt(), ...).
GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth API_EXTERNAL_URL="http://localhost:$LS_GATEWAY_PORT/auth/v1" GOTRUE_JWT_SECRET="$LS_JWT_SECRET" GOTRUE_SITE_URL="$LS_SITE_URL" \
DATABASE_URL="postgres://supabase_auth_admin:local@127.0.0.1:$PGPORT_LOCAL/$LS_DB?sslmode=disable" \
GOTRUE_DB_MIGRATIONS_PATH="$LS_BIN/auth/migrations" \
  "$LS_BIN/auth/auth" migrate > "$LS_ROOT/auth-migrate.log" 2>&1 || { tail -20 "$LS_ROOT/auth-migrate.log"; exit 1; }

# Supabase's platform grants: API roles can use auth.uid()/auth.jwt(), and objects in
# public are granted to the API roles by default (our migrations revoke what they must).
$PSQL -d "$LS_DB" <<'SQL'
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

for f in ../../supabase/migrations/*.sql; do
  $PSQL -d "$LS_DB" -f "$f"
done
echo "OK: $LS_DB ready (auth + app migrations)"
