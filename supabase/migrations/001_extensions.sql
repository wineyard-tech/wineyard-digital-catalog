-- Required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
-- pg_cron and pg_net are pre-installed on Supabase; enable via Dashboard if needed
-- Dashboard → Database → Extensions → search "pg_cron" → Enable
