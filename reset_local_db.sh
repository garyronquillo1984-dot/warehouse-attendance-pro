#!/usr/bin/env bash
# Rebuilds the local test database from scratch: shim + all migrations, in order.
set -euo pipefail
PSQL="psql -h /tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists wap_test with (force);" -c "create database wap_test;"
$PSQL -d wap_test -f tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  $PSQL -d wap_test -f "$f"
done
echo "OK: local database ready"
