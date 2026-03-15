#!/bin/bash
# scripts/generate-types.sh
# Generates TypeScript types from local Supabase schema

echo "Generating Supabase TypeScript types..."
npx supabase gen types typescript --local > types/database.generated.ts
echo "✅ Types written to types/database.generated.ts"
