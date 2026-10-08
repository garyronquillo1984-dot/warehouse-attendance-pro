#!/usr/bin/env bash
# Rebuilds the local test database from scratch: shim + all migrations, in order.
set -euo pipefail
cd "$(dirname "$0")"
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists itt_test with (force);" -c "create database itt_test;"
$PSQL -d itt_test -f tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do
  $PSQL -d itt_test -f "$f"
done
echo "OK: local database itt_test ready"
