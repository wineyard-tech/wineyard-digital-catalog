#!/usr/bin/env bash
# trigger-sync.sh — Manually trigger Edge Functions (local or remote Supabase)
#
# Usage:
#   ./scripts/trigger-sync.sh                      # sync-items → local
#   ./scripts/trigger-sync.sh contacts             # sync-contacts → local
#   ./scripts/trigger-sync.sh cleanup              # session-cleanup → local
#   ./scripts/trigger-sync.sh items remote         # sync-items → remote staging
#   ./scripts/trigger-sync.sh contacts remote      # sync-contacts → remote (no test_limit)
#
# Local requires:
#   - npx supabase functions serve --no-verify-jwt (separate terminal)
#
# Remote requires:
#   - npx supabase functions deploy <fn> --no-verify-jwt (done once)
#   - SUPABASE_SERVICE_ROLE_KEY set (auto-read from app/.env.local)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/app/.env.local"

# ── Target: local or remote ───────────────────────────────────────────────────
TARGET="${2:-local}"

if [ "$TARGET" = "remote" ]; then
  # Read the remote project URL from .env.local
  REMOTE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
  if [ -z "$REMOTE_URL" ]; then
    echo "Error: NEXT_PUBLIC_SUPABASE_URL not found in app/.env.local"
    exit 1
  fi
  FUNCTION_HOST="${REMOTE_URL}"
  echo "→ Target: REMOTE (${REMOTE_URL})"
else
  FUNCTION_HOST="http://localhost:54321"
  echo "→ Target: LOCAL (${FUNCTION_HOST})"
fi

# ── Resolve service role key ──────────────────────────────────────────────────
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if [ -f "$ENV_FILE" ]; then
    SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
  fi
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ "$TARGET" != "remote" ]; then
  # Local fallback: pull JWT key from supabase status
  SUPABASE_SERVICE_ROLE_KEY=$(cd "$REPO_ROOT" && npx supabase status --output env 2>/dev/null \
    | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: Could not resolve SUPABASE_SERVICE_ROLE_KEY."
  echo "Ensure app/.env.local has SUPABASE_SERVICE_ROLE_KEY=<jwt>"
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
    # Only apply test_limit for local runs to avoid capping real data on remote
    if [ "$TARGET" = "remote" ]; then
      BODY='{}'
    else
      BODY='{"test_limit":50}'
    fi
    ;;
  cleanup|session-cleanup)
    ENDPOINT="session-cleanup"
    BODY='{}'
    ;;
  *)
    echo "Unknown function: $FUNCTION"
    echo "Usage: $0 [items|contacts|cleanup] [local|remote]"
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
