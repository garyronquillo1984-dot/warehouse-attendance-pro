# Shared settings for the local Supabase-like stack (development and tests only).
export LS_ROOT="${LS_ROOT:-$HOME/.itt-localstack}"
export LS_BIN="${LS_BIN:-$HOME/.wap-localstack/bin}"   # binaries can be shared with the other project
export PGHOST_SOCKET="${PGHOST_SOCKET:-/tmp}"
export PGPORT_LOCAL="${PGPORT_LOCAL:-54329}"
export LS_DB="${LS_DB:-itt_e2e}"
# Throwaway secrets for the local stack only. Never reuse them anywhere real.
export LS_JWT_SECRET="local-dev-only-jwt-secret-0123456789abcdef"
export LS_HOTTOK="local-test-hottok"
export LS_GATEWAY_PORT=54321
export LS_AUTH_PORT=9999
export LS_REST_PORT=3000
export LS_FUNCTIONS_PORT=54330
export LS_SMTP_PORT=2525
export LS_SITE_URL="${LS_SITE_URL:-http://localhost:5173}"
