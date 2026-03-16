# WineYard Digital Catalog — Claude Code Context

## Project
B2B digital catalog for WineYard Technologies (CCTV distributor, Hyderabad).
~1,000 integrators. Stack: Next.js 15 + Supabase + Vercel + Meta WhatsApp API.

## Architecture
Full architecture: planning/WineYard_Architecture_v2.md  ← READ THIS FIRST

## Stack
- Frontend: Next.js 15 App Router in /app/
- Database: Supabase PostgreSQL (schema already applied, types in types/)
- Sync: Supabase Edge Functions in /supabase/functions/ (Deno runtime)
- Auth: Custom OTP via WhatsApp (sessions table) + Supabase Auth for /admin
- Search: PostgreSQL full-text + pg_trgm (no Typesense in Phase 1)
- Images: Supabase Storage (items/ and brands/ buckets)
- Hosting: Vercel (Next.js) + Supabase (DB/EF/storage)

## Key constraints
- Zoho Books (India: https://www.zohoapis.in/books/v3/) is source of truth.
  App syncs from Zoho via Edge Functions. Writes estimates + contacts back.
- Single "General" pricebook. Contacts get custom_rate or fall back to base_rate.
- GST is flat 18% hardcoded. No payment collection in Phase 1.
- All WhatsApp messaging via Meta Business Cloud API (WABA is WineYard's personal WABA).
- No Typesense, no Cloudflare R2, no Sentry in Phase 1.
- Lazy contact creation: contacts NOT bulk-synced. Created on-demand on first WhatsApp.

## Repo layout
/app/              → Next.js app (Frontend Agent domain)
/supabase/         → DB migrations + Edge Functions (Sync Agent domain)
/types/            → Shared TypeScript types (read-only for agents)
/scripts/          → Dev utilities (test-zoho-connection.ts, test-whatsapp.ts, trigger-sync.sh)
/planning/         → Architecture docs + setup prompts
/docs/             → claude-context.md (this file)

## Git setup — do this before writing any code
1. Ensure you are on the correct branch:
   git fetch origin
   git checkout develop 2>/dev/null || git checkout -b develop origin/main
   git checkout -b {BRANCH_NAME} 2>/dev/null || git checkout {BRANCH_NAME}
2. Commit rules:
   - Commit after each completed task (not at the end of everything)
   - Message format: feat(scope): description  e.g. feat(sync): add zoho-client shared util
   - Never commit: .env.local, secrets, node_modules
   - Never push to main or develop — your branch only
3. When all acceptance criteria pass:
   git add -p          ← review every hunk before staging
   git commit -m "feat(scope): final task description"
   git push origin {BRANCH_NAME}
   Then tell me: "Branch {BRANCH_NAME} is ready for review."
4. Do NOT merge. I will review the diff and merge.