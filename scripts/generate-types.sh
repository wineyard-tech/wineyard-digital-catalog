#!/bin/bash
# scripts/generate-types.sh
# Generates TypeScript types from Supabase schema.
# Auto-detects remote vs local based on NEXT_PUBLIC_SUPABASE_URL in app/.env.local.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../app/.env.local"

SUPABASE_URL=""
if [ -f "$ENV_FILE" ]; then
  SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')
fi

echo "Generating Supabase TypeScript types..."

if [[ "$SUPABASE_URL" == *".supabase.co"* ]]; then
  # Remote project — extract project ref from URL (https://<ref>.supabase.co)
  PROJECT_ID=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)
  echo "  → Remote project: ${PROJECT_ID}"
  npx supabase gen types typescript --project-id "$PROJECT_ID" > types/database.generated.ts
else
  # Local Supabase
  echo "  → Local Supabase"
  npx supabase gen types typescript --local > types/database.generated.ts
fi

echo "✅ Types written to types/database.generated.ts"
