-- 008_otp_auth.sql
-- New tables for app-initiated phone+OTP authentication.
-- Existing auth_requests / sessions / guest_sessions tables are preserved.

-- ── otp_sessions: temporary hashed OTP storage ───────────────────────────────
CREATE TABLE IF NOT EXISTS otp_sessions (
  id           BIGSERIAL PRIMARY KEY,
  phone        TEXT NOT NULL,
  otp_hash     TEXT NOT NULL,              -- bcrypt hash, never plaintext
  expires_at   TIMESTAMPTZ NOT NULL,       -- now() + 10 minutes
  attempts     INTEGER NOT NULL DEFAULT 0,
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── auth_attempts: audit log for every login attempt ─────────────────────────
CREATE TABLE IF NOT EXISTS auth_attempts (
  id           BIGSERIAL PRIMARY KEY,
  phone        TEXT NOT NULL,
  attempt_type TEXT NOT NULL,
  -- 'registered_otp_sent' | 'registered_success' | 'registered_failed'
  -- | 'unregistered' | 'rate_limited'
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE otp_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
-- No anon policies: server uses service role key which bypasses RLS.

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Active (unverified, unexpired) OTP lookups by phone
CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone_active
  ON otp_sessions (phone, expires_at)
  WHERE verified = FALSE;

-- Recent auth attempts by phone (rate limiting + audit)
CREATE INDEX IF NOT EXISTS idx_auth_attempts_phone_time
  ON auth_attempts (phone, created_at DESC);
