#!/usr/bin/env bash
# trigger-sync.sh — Manually trigger Edge Functions against local Supabase for dev testing
#
# Usage:
#   ./scripts/trigger-sync.sh              # trigger sync-items (default)
#   ./scripts/trigger-sync.sh contacts     # trigger sync-contacts
#   ./scripts/trigger-sync.sh cleanup      # trigger session-cleanup
#
# Requires:
#   - Local Supabase running:    npx supabase start
#   - Edge Functions serving:    npx supabase functions serve --no-verify-jwt
#     (--no-verify-jwt is required — local JWT auth is not needed for dev)
#   - jq installed for pretty output (optional but recommended)

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-http://localhost:54321}"
FUNCTIONS_PORT="${FUNCTIONS_PORT:-54321}"
FUNCTION_HOST="http://localhost:54321"

# ── Resolve service role key ──────────────────────────────────────────────────
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  # Try to read from app/.env.local
  ENV_FILE="$(dirname "$0")/../app/.env.local"
  if [ -f "$ENV_FILE" ]; then
    SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
  fi
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  # Read the JWT service role key from `supabase status --output env`
  # (the sb_secret_* key shown in normal status is NOT a JWT and won't work as Bearer token)
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  SUPABASE_SERVICE_ROLE_KEY=$(cd "$REPO_ROOT" && npx supabase status --output env 2>/dev/null \
    | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: Could not resolve SUPABASE_SERVICE_ROLE_KEY."
  echo "Run: npx supabase status — and set the 'Secret' key as:"
  echo "  export SUPABASE_SERVICE_ROLE_KEY=<sb_secret_...>"
  exit 1
fi

echo "→ Using key: ${SUPABASE_SERVICE_ROLE_KEY:0:20}…"

# ── Select function ───────────────────────────────────────────────────────────
FUNCTION="${1:-items}"
case "$FUNCTION" in
  items|sync-items)
    ENDPOINT="sync-items"
    BODY='{}'
    ;;
  contacts|sync-contacts)
    ENDPOINT="sync-contacts"
    BODY='{"test_limit":50}'   # cap to 50 contacts for local dev
    ;;
  cleanup|session-cleanup)
    ENDPOINT="session-cleanup"
    BODY='{}'
    ;;
  *)
    echo "Unknown function: $FUNCTION"
    echo "Usage: $0 [items|contacts|cleanup]"
    exit 1
    ;;
esac

URL="${FUNCTION_HOST}/functions/v1/${ENDPOINT}"
echo "→ POST ${URL}"
echo "→ Body: ${BODY}"
echo ""

# ── Fire the request ──────────────────────────────────────────────────────────
BODY_FILE=$(mktemp)
HTTP_CODE=$(curl -s -o "$BODY_FILE" -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY")
BODY_OUT=$(cat "$BODY_FILE")
rm -f "$BODY_FILE"

echo "HTTP $HTTP_CODE"
if command -v jq &>/dev/null; then
  echo "$BODY_OUT" | jq .
else
  echo "$BODY_OUT"
fi

[ "$HTTP_CODE" = "200" ] || exit 1
