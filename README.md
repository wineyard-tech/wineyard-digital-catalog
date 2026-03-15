# WineYard Digital Catalog

B2B product catalog for WineYard Technologies (CCTV distributor, Hyderabad).

## Quick Start

See `planning/WineYard_Architecture_v2.md` for full architecture.

### Prerequisites
- Node.js 18+
- Docker (for local Supabase)
- Supabase CLI: `npm install -g supabase`

### Local Development
```bash
cd app && npm install
cd .. && npx supabase start
npx supabase db push
./scripts/generate-types.sh
cp app/.env.local.example app/.env.local  # Fill in credentials
cd app && npm run dev
```

### Test Connections
```bash
# From repo root, with env vars loaded:
npx ts-node scripts/test-zoho-connection.ts
npx ts-node scripts/test-whatsapp.ts +91XXXXXXXXXX "test"
```

## Stack
- Frontend: Next.js 15 (App Router) → Vercel
- Database: Supabase (PostgreSQL 15)
- Sync: Supabase Edge Functions + pg_cron
- WhatsApp: Meta Business Cloud API
