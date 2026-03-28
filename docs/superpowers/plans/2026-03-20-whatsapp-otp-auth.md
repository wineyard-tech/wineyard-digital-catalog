# WhatsApp OTP Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WhatsApp-initiated auth flow (admin sends magic link) with an app-initiated phone+OTP flow where users enter their phone number and receive an OTP on WhatsApp.

**Architecture:** User enters phone on `/auth/login` → API checks `contacts` table → if registered, hashes and stores OTP in `otp_sessions`, sends via WhatsApp → user enters OTP on `/auth/verify` → API verifies hash, creates custom session cookie. Unregistered users are captured as leads and redirected to browse mode. Existing WhatsApp webhook-initiated flow (`auth_requests`, `sessions`) is preserved for backward compatibility.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role client, custom session cookies), bcryptjs for OTP hashing, Meta WhatsApp Cloud API via native fetch, TypeScript

---

## Chunk 1: Database + Environment

### Task 1: New database migration

**Files:**
- Create: `supabase/migrations/008_otp_auth.sql`

- [ ] **Step 1.1: Create the migration file**

```sql
-- 008_otp_auth.sql
-- New tables for app-initiated phone+OTP authentication.
-- Existing auth_requests / sessions tables are preserved.

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

-- ── auth_attempts: audit log for every login attempt ────────────────────────
CREATE TABLE IF NOT EXISTS auth_attempts (
  id           BIGSERIAL PRIMARY KEY,
  phone        TEXT NOT NULL,
  attempt_type TEXT NOT NULL,              -- 'registered_otp_sent' | 'registered_success' | 'registered_failed' | 'unregistered' | 'rate_limited'
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE otp_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
-- No policies needed: server uses service role key which bypasses RLS.

-- ── Cleanup index: expired/verified otp_sessions ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone_active
  ON otp_sessions (phone, expires_at)
  WHERE verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_auth_attempts_phone_time
  ON auth_attempts (phone, created_at DESC);
```

- [ ] **Step 1.2: Apply to local Supabase**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog
npx supabase db push --local
```
Expected: `Applied 1 new migration` with no errors.

- [ ] **Step 1.3: Verify tables exist**

```bash
npx supabase db diff --local
```
Expected: no diff (migration fully applied).

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/008_otp_auth.sql
git commit -m "feat(auth): add otp_sessions and auth_attempts migration"
```

---

### Task 2: Environment variables

**Files:**
- Modify: `app/.env.local.example`

- [ ] **Step 2.1: Add new env vars to example file**

Append to `app/.env.local.example`:

```
# ─── OTP Auth (WhatsApp-initiated) ────────────────────────────────────────────
WABA_PHONE_NUMBER_ID=           # Same as WHATSAPP_PHONE_NUMBER_ID — used by OTP service
WABA_ACCESS_TOKEN=              # Same as WHATSAPP_TOKEN — Meta system user access token
WABA_TEMPLATE_NAME=wineyard_otp # Pre-approved AUTHENTICATION template name
ADMIN_WHATSAPP_NUMBER=          # E.164 format e.g. 919876543210 (no +)
OTP_EXPIRY_MINUTES=10           # Optional, default 10
MAX_OTP_ATTEMPTS=3              # Optional, default 3
```

Note: The WABA_* vars intentionally alias the existing WHATSAPP_* vars so either name works. Fill actual values in `.env.local`.

- [ ] **Step 2.2: Commit**

```bash
git add app/.env.local.example
git commit -m "feat(auth): document WABA OTP env vars in example"
```

---

## Chunk 2: Core Auth Utilities

### Task 3: Install bcryptjs

**Files:**
- Modify: `app/package.json` (via npm install)

- [ ] **Step 3.1: Install**

```bash
cd app
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

Expected: `app/package.json` gains `"bcryptjs"` in dependencies.

- [ ] **Step 3.2: Verify types**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3.3: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "chore(auth): install bcryptjs for OTP hashing"
```

---

### Task 4: OTP generation + hashing utilities

**Files:**
- Create: `app/src/lib/auth/otp.ts`

- [ ] **Step 4.1: Create the file**

```typescript
// app/src/lib/auth/otp.ts
// Pure utility functions for OTP generation, hashing, and validation.

import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

/**
 * Generates a cryptographically secure 6-digit OTP.
 * Uses Node.js crypto.randomInt — never Math.random().
 */
export function generateOTP(): string {
  const { randomInt } = await import('crypto')  // dynamic to avoid edge runtime issues
  return String(randomInt(100000, 1000000))
}

// Sync version for non-async contexts
export function generateOTPSync(): string {
  const { randomInt } = require('crypto')
  return String(randomInt(100000, 1000000))
}

/**
 * Hashes an OTP code using bcrypt.
 */
export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS)
}

/**
 * Verifies a plain OTP against a stored hash.
 */
export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash)
}

/**
 * Validates Indian mobile number in E.164 format.
 * Accepts: +919876543210
 */
export function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone)
}

/**
 * Strips spaces, hyphens, and normalises to E.164.
 * Input: "91-98765-43210" or "9876543210" → "+919876543210"
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  return `+${digits}`
}
```

- [ ] **Step 4.2: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4.3: Commit**

```bash
git add app/src/lib/auth/otp.ts
git commit -m "feat(auth): OTP generation, hashing, and phone validation utilities"
```

---

### Task 5: WhatsApp OTP service

**Files:**
- Create: `app/src/lib/whatsapp/otp-service.ts`

Note: The existing `app/src/lib/whatsapp.ts` handles quotation sending. This new file handles auth-specific WhatsApp messages. Do NOT modify the existing file.

- [ ] **Step 5.1: Create the file**

```typescript
// app/src/lib/whatsapp/otp-service.ts
// WhatsApp auth messages: OTP delivery and unregistered-user admin alerts.
// Uses Meta Graph API v19.0 directly (no additional SDK needed).

const WA_API_BASE = 'https://graph.facebook.com/v19.0'

function getConfig() {
  return {
    phoneNumberId: process.env.WABA_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken:   process.env.WABA_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN ?? '',
    templateName:  process.env.WABA_TEMPLATE_NAME ?? 'wineyard_otp',
    adminNumber:   process.env.ADMIN_WHATSAPP_NUMBER ?? '',
  }
}

async function postMessage(payload: Record<string, unknown>): Promise<string> {
  const { phoneNumberId, accessToken } = getConfig()

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${WA_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })

    if (res.ok) {
      const data = await res.json() as { messages?: Array<{ id: string }> }
      return data.messages?.[0]?.id ?? ''
    }

    const body = await res.text()
    if (attempt < 2) {
      // Exponential backoff: 200ms, 400ms
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)))
      console.warn(`[whatsapp/otp-service] retry ${attempt + 1}: ${body}`)
      continue
    }

    throw new Error(`WhatsApp API error ${res.status}: ${body}`)
  }

  throw new Error('WhatsApp: max retries exceeded')
}

/**
 * Sends OTP via a pre-approved AUTHENTICATION template.
 * Template body: "Your WineYard login OTP is {{1}}. Valid for 10 minutes. Do not share."
 * Returns Meta message ID for tracking.
 */
export async function sendOTP(
  phoneNumber: string,
  otpCode: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { templateName } = getConfig()
    const messageId = await postMessage({
      to: phoneNumber.replace('+', ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: otpCode }],
          },
          {
            // Button component for AUTHENTICATION category — copy code button
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: otpCode }],
          },
        ],
      },
    })
    return { success: true, messageId }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown WhatsApp error'
    console.error('[whatsapp/otp-service] sendOTP failed:', error)
    return { success: false, error }
  }
}

/**
 * Sends an unregistered login alert to the admin number.
 * Non-blocking — caller should NOT await if it should not block the response.
 */
export async function sendUnregisteredAlert(
  phoneNumber: string,
  timestamp: Date
): Promise<void> {
  const { adminNumber } = getConfig()
  if (!adminNumber) {
    console.warn('[whatsapp/otp-service] ADMIN_WHATSAPP_NUMBER not set — skipping alert')
    return
  }

  const formatted = phoneNumber.replace('+91', '+91-').replace(/(\d{5})(\d{5})$/, '$1-$2')
  const ts = timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  try {
    await postMessage({
      to: adminNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: `⚠️ Unregistered login attempt: ${formatted} at ${ts} IST`,
      },
    })
  } catch (err) {
    // Non-blocking: log but don't rethrow
    console.error('[whatsapp/otp-service] sendUnregisteredAlert failed:', err)
  }
}
```

- [ ] **Step 5.2: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 5.3: Commit**

```bash
git add app/src/lib/whatsapp/otp-service.ts
git commit -m "feat(auth): WhatsApp OTP delivery and unregistered admin alert service"
```

---

## Chunk 3: API Routes

### Task 6: POST /api/auth/send-otp

**Files:**
- Create: `app/src/app/api/auth/send-otp/route.ts`

- [ ] **Step 6.1: Create the route**

```typescript
// app/src/app/api/auth/send-otp/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidIndianPhone, normalisePhone, generateOTPSync, hashOTP } from '@/lib/auth/otp'
import { sendOTP, sendUnregisteredAlert } from '@/lib/whatsapp/otp-service'

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES ?? 10)
const RATE_LIMIT_WINDOW_MINUTES = 5
const RATE_LIMIT_MAX = 3

export async function POST(request: NextRequest) {
  let body: { phoneNumber?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawPhone = body.phoneNumber ?? ''
  const phone = normalisePhone(rawPhone)

  if (!isValidIndianPhone(phone)) {
    return NextResponse.json(
      { error: 'Invalid phone number. Please enter a valid 10-digit Indian mobile number.' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
  const userAgent = request.headers.get('user-agent') ?? null
  const now = new Date()

  // ── Rate limiting: max 3 OTP requests per phone per 5 minutes ────────────
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString()
  const { count: recentCount } = await supabase
    .from('otp_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', windowStart)
    .then(r => ({ count: r.count ?? 0 }))

  if (recentCount >= RATE_LIMIT_MAX) {
    await supabase.from('auth_attempts').insert({
      phone, attempt_type: 'rate_limited', ip_address: ip, user_agent: userAgent,
    })
    return NextResponse.json(
      { error: `Too many OTP requests. Please wait ${RATE_LIMIT_WINDOW_MINUTES} minutes before trying again.` },
      { status: 429 }
    )
  }

  // ── Check contacts table ─────────────────────────────────────────────────
  const { data: contact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name, company_name, status')
    .eq('phone', phone)
    .maybeSingle()

  if (!contact || contact.status !== 'active') {
    // Log attempt and alert admin (non-blocking)
    await supabase.from('auth_attempts').insert({
      phone, attempt_type: 'unregistered', ip_address: ip, user_agent: userAgent,
    })
    sendUnregisteredAlert(phone, now) // fire and forget
    return NextResponse.json(
      { success: true, registered: false, message: 'Please contact WineYard to register.' },
      { status: 200 }
    )
  }

  // ── Generate and store hashed OTP ────────────────────────────────────────
  const otp = generateOTPSync()
  const otpHash = await hashOTP(otp)
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000).toISOString()

  const { error: insertError } = await supabase.from('otp_sessions').insert({
    phone,
    otp_hash: otpHash,
    expires_at: expiresAt,
  })

  if (insertError) {
    console.error('[send-otp] otp_sessions insert error:', insertError)
    return NextResponse.json({ error: 'Internal error. Please try again.' }, { status: 500 })
  }

  // ── Send OTP via WhatsApp ─────────────────────────────────────────────────
  const result = await sendOTP(phone, otp)

  if (!result.success) {
    // In dev mode, log OTP to console for testing
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] OTP for ${phone}: ${otp}`)
    }
    // Don't fail in dev if WhatsApp isn't configured
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Failed to send OTP. Please try again.' }, { status: 500 })
    }
  }

  await supabase.from('auth_attempts').insert({
    phone,
    attempt_type: 'registered_otp_sent',
    ip_address: ip,
    user_agent: userAgent,
    metadata: result.messageId ? { message_id: result.messageId } : {},
  })

  return NextResponse.json(
    { success: true, registered: true, expiresIn: OTP_EXPIRY_MINUTES * 60 },
    { status: 200 }
  )
}
```

- [ ] **Step 6.2: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6.3: Smoke-test (dev server must be running)**

```bash
# Start dev server in one terminal: cd app && npm run dev
# In another terminal:
curl -s -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9999999999"}' | jq .
```
Expected for unregistered number: `{"success":true,"registered":false,"message":"Please contact WineYard to register."}`

```bash
curl -s -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "bad"}' | jq .
```
Expected: `{"error":"Invalid phone number..."}`

- [ ] **Step 6.4: Commit**

```bash
git add app/src/app/api/auth/send-otp/route.ts
git commit -m "feat(auth): POST /api/auth/send-otp — phone lookup, OTP gen, WhatsApp delivery"
```

---

### Task 7: POST /api/auth/verify-otp

**Files:**
- Create: `app/src/app/api/auth/verify-otp/route.ts`

- [ ] **Step 7.1: Create the route**

```typescript
// app/src/app/api/auth/verify-otp/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isValidIndianPhone, normalisePhone, verifyOTP } from '@/lib/auth/otp'
import { setSessionCookie } from '@/lib/auth'

const MAX_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS ?? 3)

export async function POST(request: NextRequest) {
  let body: { phoneNumber?: string; otpCode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawPhone = body.phoneNumber ?? ''
  const otpCode = (body.otpCode ?? '').trim()
  const phone = normalisePhone(rawPhone)

  if (!isValidIndianPhone(phone) || !/^\d{6}$/.test(otpCode)) {
    return NextResponse.json({ error: 'Invalid phone or OTP format.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ip = request.headers.get('x-forwarded-for') ?? null
  const userAgent = request.headers.get('user-agent') ?? null
  const now = new Date().toISOString()

  // ── Fetch active OTP session ─────────────────────────────────────────────
  const { data: otpSession } = await supabase
    .from('otp_sessions')
    .select('id, otp_hash, attempts')
    .eq('phone', phone)
    .eq('verified', false)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpSession) {
    return NextResponse.json(
      { success: false, error: 'OTP expired or not found. Please request a new OTP.' },
      { status: 401 }
    )
  }

  // ── Increment attempts ───────────────────────────────────────────────────
  const newAttempts = otpSession.attempts + 1
  await supabase.from('otp_sessions').update({ attempts: newAttempts }).eq('id', otpSession.id)

  if (newAttempts > MAX_ATTEMPTS) {
    // Invalidate session
    await supabase.from('otp_sessions').update({ verified: true }).eq('id', otpSession.id)
    await supabase.from('auth_attempts').insert({
      phone, attempt_type: 'registered_failed',
      ip_address: ip, user_agent: userAgent,
      metadata: { reason: 'max_attempts_exceeded' },
    })
    return NextResponse.json(
      { success: false, error: 'Too many incorrect attempts. Please request a new OTP.', attemptsLeft: 0 },
      { status: 401 }
    )
  }

  // ── Verify OTP hash ──────────────────────────────────────────────────────
  const isCorrect = await verifyOTP(otpCode, otpSession.otp_hash)

  if (!isCorrect) {
    const attemptsLeft = MAX_ATTEMPTS - newAttempts
    await supabase.from('auth_attempts').insert({
      phone, attempt_type: 'registered_failed',
      ip_address: ip, user_agent: userAgent,
      metadata: { attempts_left: attemptsLeft },
    })
    return NextResponse.json(
      { success: false, error: 'Incorrect OTP.', attemptsLeft },
      { status: 401 }
    )
  }

  // ── OTP correct: mark session verified ──────────────────────────────────
  await supabase.from('otp_sessions').update({ verified: true }).eq('id', otpSession.id)

  // ── Fetch contact record ─────────────────────────────────────────────────
  const { data: contact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name, company_name, pricebook_id, status')
    .eq('phone', phone)
    .maybeSingle()

  if (!contact) {
    // Should not happen if send-otp validated, but guard anyway
    return NextResponse.json({ error: 'Contact not found.' }, { status: 500 })
  }

  // ── Create session ───────────────────────────────────────────────────────
  const sessionExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      zoho_contact_id: contact.zoho_contact_id,
      phone,
      ip_address: ip,
      user_agent: userAgent,
      expires_at: sessionExpiry,
    })
    .select('token')
    .single()

  if (sessionError || !session) {
    console.error('[verify-otp] session insert error:', sessionError)
    return NextResponse.json({ error: 'Internal error creating session.' }, { status: 500 })
  }

  await supabase.from('auth_attempts').insert({
    phone, attempt_type: 'registered_success',
    ip_address: ip, user_agent: userAgent,
    metadata: { zoho_contact_id: contact.zoho_contact_id },
  })

  const response = NextResponse.json({
    success: true,
    user: {
      zoho_contact_id: contact.zoho_contact_id,
      contact_name: contact.contact_name,
      company_name: contact.company_name,
      phone,
      pricebook_id: contact.pricebook_id,
    },
  }, { status: 200 })

  setSessionCookie(response, session.token)
  return response
}
```

- [ ] **Step 7.2: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7.3: Commit**

```bash
git add app/src/app/api/auth/verify-otp/route.ts
git commit -m "feat(auth): POST /api/auth/verify-otp — bcrypt verify, session cookie creation"
```

---

### Task 8: POST /api/auth/refresh and POST /api/auth/logout

**Files:**
- Create: `app/src/app/api/auth/refresh/route.ts`
- Modify: `app/src/app/api/auth/logout/route.ts`

- [ ] **Step 8.1: Create refresh route**

```typescript
// app/src/app/api/auth/refresh/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { setSessionCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
  let session
  try {
    session = await requireSession(request)
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const token = request.cookies.get('session_token')?.value!

  // Extend session by 15 days from now
  const newExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('sessions')
    .update({ expires_at: newExpiry, last_activity_at: new Date().toISOString() })
    .eq('token', token)

  if (error) {
    return NextResponse.json({ error: 'Could not refresh session' }, { status: 500 })
  }

  // Re-fetch latest contact metadata
  const { data: contact } = await supabase
    .from('contacts')
    .select('contact_name, company_name, pricebook_id, status')
    .eq('phone', session.phone)
    .maybeSingle()

  const response = NextResponse.json({
    success: true,
    user: {
      zoho_contact_id: session.zoho_contact_id,
      contact_name: contact?.contact_name ?? session.contact_name,
      company_name: contact?.company_name ?? null,
      phone: session.phone,
      pricebook_id: contact?.pricebook_id ?? session.pricebook_id,
    },
  }, { status: 200 })

  setSessionCookie(response, token)
  return response
}
```

- [ ] **Step 8.2: Implement logout route** (replacing the TODO stub)

```typescript
// app/src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value

  if (token) {
    const supabase = createServiceClient()
    // Expire the session immediately
    await supabase
      .from('sessions')
      .update({ expires_at: new Date().toISOString() })
      .eq('token', token)
  }

  const response = NextResponse.json({ success: true }, { status: 200 })
  response.cookies.set('session_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
```

- [ ] **Step 8.3: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors. (If `contact_name` is not on `SessionPayload`, you may need to add it to `@/types/catalog.ts` — see note below.)

> **Note on `SessionPayload`:** The `refresh` route uses `session.contact_name` which already exists in the interface. No change needed to `catalog.ts`.

- [ ] **Step 8.4: Commit**

```bash
git add app/src/app/api/auth/refresh/route.ts app/src/app/api/auth/logout/route.ts
git commit -m "feat(auth): implement refresh and logout API routes"
```

---

## Chunk 4: Frontend Components

### Task 9: PhoneInput component

**Files:**
- Create: `app/src/components/auth/PhoneInput.tsx`

- [ ] **Step 9.1: Create the component**

```typescript
// app/src/components/auth/PhoneInput.tsx
'use client'

import { useState, ChangeEvent, FormEvent } from 'react'

interface PhoneInputProps {
  onSubmit: (phoneNumber: string) => Promise<void>
  loading?: boolean
}

export default function PhoneInput({ onSubmit, loading = false }: PhoneInputProps) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10)
    setDigits(raw)
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    setError('')
    await onSubmit(`+91${digits}`)
  }

  const formatted = digits
    ? digits.slice(0, 5) + (digits.length > 5 ? '-' + digits.slice(5) : '')
    : ''

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%' }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        Mobile Number
      </label>

      <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#FFF' }}>
        <span style={{ padding: '0 12px', fontSize: 16, fontWeight: 600, color: '#6B7280', borderRight: '1px solid #E5E7EB', lineHeight: '48px', whiteSpace: 'nowrap' }}>
          +91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          placeholder="98765-43210"
          value={formatted}
          onChange={handleChange}
          disabled={loading}
          aria-label="Mobile number"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: '12px 14px',
            fontSize: 17,
            fontWeight: 600,
            color: '#1A1A2E',
            background: 'transparent',
            letterSpacing: '0.04em',
          }}
        />
      </div>

      {error && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#DC2626' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={digits.length !== 10 || loading}
        style={{
          marginTop: 16,
          width: '100%',
          background: digits.length !== 10 || loading ? '#9CA3AF' : '#059669',
          color: '#FFF',
          border: 'none',
          borderRadius: 10,
          padding: '14px 0',
          fontSize: 16,
          fontWeight: 700,
          cursor: digits.length !== 10 || loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {loading ? (
          <>
            <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            Sending OTP…
          </>
        ) : (
          'Send OTP on WhatsApp'
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  )
}
```

- [ ] **Step 9.2: Type-check**

```bash
cd app && npx tsc --noEmit
```

- [ ] **Step 9.3: Commit**

```bash
git add app/src/components/auth/PhoneInput.tsx
git commit -m "feat(auth): PhoneInput component with +91 prefix and live formatting"
```

---

### Task 10: OTPInput component

**Files:**
- Create: `app/src/components/auth/OTPInput.tsx`

Note: The existing `OtpForm.tsx` uses `ref_id` (link-based). This new component is phone-based (user entered phone first). Keep both files — they serve different flows.

- [ ] **Step 10.1: Create the component**

```typescript
// app/src/components/auth/OTPInput.tsx
'use client'

import { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react'

interface OTPInputProps {
  phoneNumber: string        // Display-only, for UX context
  expiresIn: number          // Seconds from mount until OTP expires
  onSubmit: (otp: string) => Promise<{ attemptsLeft?: number; error?: string } | void>
  onResend: () => Promise<void>
}

type State = 'idle' | 'loading' | 'error' | 'locked'

export default function OTPInput({ phoneNumber, expiresIn, onSubmit, onResend }: OTPInputProps) {
  const [digits, setDigits] = useState(Array(6).fill(''))
  const [uiState, setUiState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(expiresIn)
  const [resendCooldown, setResendCooldown] = useState(30)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown(s => s - 1), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  function focusAt(idx: number) { inputs.current[idx]?.focus() }

  function handleChange(idx: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = digit
    setDigits(next)
    if (digit && idx < 5) focusAt(idx + 1)
    if (idx === 5 && digit) {
      const code = next.join('')
      if (code.length === 6) doSubmit(code)
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) focusAt(idx - 1)
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = Array(6).fill('')
    pasted.split('').forEach((ch, i) => { next[i] = ch })
    setDigits(next)
    focusAt(Math.min(pasted.length, 5))
    if (pasted.length === 6) doSubmit(pasted)
  }

  async function doSubmit(code: string) {
    setUiState('loading')
    setErrorMsg('')
    try {
      const result = await onSubmit(code)
      if (!result) return  // success: parent handles redirect
      if ((result.attemptsLeft ?? 1) <= 0) {
        setUiState('locked')
        setErrorMsg(result.error ?? 'Too many attempts. Please request a new OTP.')
      } else {
        setAttemptsLeft(result.attemptsLeft ?? null)
        setErrorMsg(result.error ?? 'Incorrect OTP.')
        setUiState('error')
        setDigits(Array(6).fill(''))
        focusAt(0)
      }
    } catch {
      setUiState('error')
      setErrorMsg('Network error. Please check your connection.')
      setDigits(Array(6).fill(''))
      focusAt(0)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setUiState('idle')
    setDigits(Array(6).fill(''))
    setErrorMsg('')
    setAttemptsLeft(null)
    setSecondsLeft(expiresIn)
    setResendCooldown(30)
    await onResend()
  }

  const code = digits.join('')
  const isLocked = uiState === 'locked'
  const isLoading = uiState === 'loading'

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const displayPhone = phoneNumber.replace('+91', '+91 ').replace(/(\d{5})(\d{5})$/, '$1 $2')

  return (
    <div style={{ width: '100%' }}>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
        OTP sent to <strong style={{ color: '#1A1A2E' }}>{displayPhone}</strong>
      </p>

      {/* Digit boxes */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={el => { inputs.current[idx] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={isLocked || isLoading}
            onChange={e => handleChange(idx, e.target.value)}
            onKeyDown={e => handleKeyDown(idx, e)}
            onPaste={idx === 0 ? handlePaste : undefined}
            aria-label={`OTP digit ${idx + 1}`}
            style={{
              width: 44, height: 52,
              textAlign: 'center',
              fontSize: 22, fontWeight: 700,
              border: uiState === 'error' ? '2px solid #EF4444' : '2px solid #E5E7EB',
              borderRadius: 10, outline: 'none',
              background: isLocked ? '#F3F4F6' : '#FFF',
              color: isLocked ? '#9CA3AF' : '#1A1A2E',
              transition: 'border-color 0.15s',
            }}
          />
        ))}
      </div>

      {/* Timer */}
      {!isLocked && secondsLeft > 0 && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
          Expires in <span style={{ fontWeight: 700, color: secondsLeft < 60 ? '#DC2626' : '#1A1A2E' }}>{mm}:{ss}</span>
        </p>
      )}

      {/* Error */}
      {(uiState === 'error' || isLocked) && (
        <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>
          {errorMsg}
          {attemptsLeft !== null && attemptsLeft > 0 && ` (${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} left)`}
        </p>
      )}

      {/* Submit */}
      {!isLocked && (
        <button
          onClick={() => code.length === 6 && doSubmit(code)}
          disabled={code.length < 6 || isLoading}
          style={{
            width: '100%',
            background: code.length < 6 || isLoading ? '#9CA3AF' : '#059669',
            color: '#FFF', border: 'none', borderRadius: 10,
            padding: '14px 0', fontSize: 16, fontWeight: 700,
            cursor: code.length < 6 || isLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {isLoading ? (
            <><span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFF', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Verifying…</>
          ) : 'Verify OTP'}
        </button>
      )}

      {/* Resend */}
      <button
        onClick={handleResend}
        disabled={resendCooldown > 0}
        style={{
          marginTop: 12, width: '100%', background: 'none',
          border: 'none', color: resendCooldown > 0 ? '#9CA3AF' : '#0066CC',
          fontSize: 14, fontWeight: 600, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', padding: '4px 0',
        }}
      >
        {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
```

- [ ] **Step 10.2: Type-check**

```bash
cd app && npx tsc --noEmit
```

- [ ] **Step 10.3: Commit**

```bash
git add app/src/components/auth/OTPInput.tsx
git commit -m "feat(auth): OTPInput component with countdown timer and resend"
```

---

### Task 11: UnregisteredMessage component

**Files:**
- Create: `app/src/components/auth/UnregisteredMessage.tsx`

- [ ] **Step 11.1: Create the component**

```typescript
// app/src/components/auth/UnregisteredMessage.tsx
'use client'

interface UnregisteredMessageProps {
  phoneNumber: string
  onBrowseCatalog: () => void
  onTryAgain: () => void
}

export default function UnregisteredMessage({ phoneNumber, onBrowseCatalog, onTryAgain }: UnregisteredMessageProps) {
  const wabaLink = process.env.NEXT_PUBLIC_WABA_LINK ?? 'https://wa.me/91'
  const displayPhone = phoneNumber.replace('+91', '+91 ').replace(/(\d{5})(\d{5})$/, '$1 $2')

  return (
    <div style={{ textAlign: 'center', width: '100%' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1A1A2E' }}>
        Number Not Registered
      </h2>
      <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>
        <strong style={{ color: '#1A1A2E' }}>{displayPhone}</strong> is not registered with WineYard.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6B7280' }}>
        Contact us to get access to personalised pricing.
      </p>

      <a
        href={wabaLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', background: '#25D366', color: '#FFF',
          border: 'none', borderRadius: 10, padding: '13px 0',
          fontSize: 15, fontWeight: 700, textDecoration: 'none',
          marginBottom: 12,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Contact on WhatsApp
      </a>

      <button
        onClick={onBrowseCatalog}
        style={{
          width: '100%', background: '#F3F4F6', color: '#374151',
          border: '2px solid #E5E7EB', borderRadius: 10, padding: '12px 0',
          fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12,
        }}
      >
        Browse Catalog (General Pricing)
      </button>

      <button
        onClick={onTryAgain}
        style={{
          background: 'none', border: 'none', color: '#0066CC',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Try a different number
      </button>
    </div>
  )
}
```

- [ ] **Step 11.2: Type-check + commit**

```bash
cd app && npx tsc --noEmit
git add app/src/components/auth/UnregisteredMessage.tsx
git commit -m "feat(auth): UnregisteredMessage component with WhatsApp CTA and browse option"
```

---

## Chunk 5: Pages + Hook + Middleware

### Task 12: useAuth hook

**Files:**
- Create: `app/src/hooks/useAuth.ts`

- [ ] **Step 12.1: Create the hook**

```typescript
// app/src/hooks/useAuth.ts
'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  zoho_contact_id: string
  contact_name: string
  company_name: string | null
  phone: string
  pricebook_id: string | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  isRegistered: boolean
}

interface SendOTPResult {
  registered: boolean
  expiresIn?: number  // seconds
  error?: string
}

interface VerifyOTPResult {
  attemptsLeft?: number
  error?: string
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
    isRegistered: false,
  })

  // On mount: check session by calling /api/auth/refresh
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        if (res.ok) {
          const data = await res.json() as { user: AuthUser }
          setState({ user: data.user, loading: false, isAuthenticated: true, isRegistered: true })
        } else {
          setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
        }
      } catch {
        setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
      }
    }
    checkSession()
  }, [])

  const sendOTP = useCallback(async (phoneNumber: string): Promise<SendOTPResult> => {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    })
    const data = await res.json() as SendOTPResult & { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to send OTP')
    return data
  }, [])

  const verifyOTP = useCallback(async (phoneNumber: string, otp: string): Promise<VerifyOTPResult | void> => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, otpCode: otp }),
    })
    const data = await res.json() as { success?: boolean; user?: AuthUser } & VerifyOTPResult

    if (res.ok && data.success && data.user) {
      setState({ user: data.user, loading: false, isAuthenticated: true, isRegistered: true })
      return  // success
    }

    return { attemptsLeft: data.attemptsLeft, error: data.error }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
  }, [])

  const refreshSession = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/auth/refresh', { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { user: AuthUser }
      setState(prev => ({ ...prev, user: data.user }))
    }
  }, [])

  return {
    ...state,
    sendOTP,
    verifyOTP,
    logout,
    refreshSession,
  }
}
```

- [ ] **Step 12.2: Type-check + commit**

```bash
cd app && npx tsc --noEmit
git add app/src/hooks/useAuth.ts
git commit -m "feat(auth): useAuth hook with sendOTP, verifyOTP, logout, and session check"
```

---

### Task 13: Auth pages

**Files:**
- Create: `app/src/app/auth/login/page.tsx`
- Create: `app/src/app/auth/verify/page.tsx`
- Create: `app/src/app/auth/browse/page.tsx`

- [ ] **Step 13.1: Create login page**

```typescript
// app/src/app/auth/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PhoneInput from '@/components/auth/PhoneInput'
import UnregisteredMessage from '@/components/auth/UnregisteredMessage'

type Step = 'phone' | 'unregistered'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSendOTP(phoneNumber: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      })
      const data = await res.json() as { success: boolean; registered: boolean; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setPhone(phoneNumber)
      if (data.registered) {
        router.push(`/auth/verify?phone=${encodeURIComponent(phoneNumber)}`)
      } else {
        setStep('unregistered')
      }
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 64, height: 64, background: '#0066CC', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>
          📷
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>WineYard Catalog</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
          {step === 'phone' ? 'Enter your mobile number to get an OTP on WhatsApp' : 'Account not found'}
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 380, background: '#FFF', borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', padding: 24 }}>
        {step === 'phone' ? (
          <>
            <PhoneInput onSubmit={handleSendOTP} loading={loading} />
            {error && <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, color: '#DC2626' }}>{error}</p>}
          </>
        ) : (
          <UnregisteredMessage
            phoneNumber={phone}
            onBrowseCatalog={() => router.push('/auth/browse')}
            onTryAgain={() => { setStep('phone'); setPhone('') }}
          />
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 13.2: Create verify page**

```typescript
// app/src/app/auth/verify/page.tsx
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OTPInput from '@/components/auth/OTPInput'

const DEFAULT_EXPIRES_IN = 600  // 10 minutes

function VerifyContent() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = params.get('phone') ?? ''
  const [expiresIn] = useState(DEFAULT_EXPIRES_IN)

  useEffect(() => {
    if (!phone) router.replace('/auth/login')
  }, [phone, router])

  async function handleVerify(otp: string) {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, otpCode: otp }),
    })
    const data = await res.json() as { success?: boolean; attemptsLeft?: number; error?: string }

    if (res.ok && data.success) {
      router.replace('/catalog')
      return  // success — parent OTPInput handles no return = success
    }
    return { attemptsLeft: data.attemptsLeft, error: data.error }
  }

  async function handleResend() {
    await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })
  }

  if (!phone) return null

  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 64, height: 64, background: '#0066CC', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>
          📷
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>Enter OTP</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Check your WhatsApp for the 6-digit code</p>
      </div>

      <div style={{ width: '100%', maxWidth: 380, background: '#FFF', borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', padding: 24 }}>
        <OTPInput
          phoneNumber={phone}
          expiresIn={expiresIn}
          onSubmit={handleVerify}
          onResend={handleResend}
        />
      </div>
    </main>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  )
}
```

- [ ] **Step 13.3: Create browse page**

```typescript
// app/src/app/auth/browse/page.tsx
import { redirect } from 'next/navigation'

// Browse page: redirects to catalog with a flag set in the URL.
// The catalog reads ?mode=browse and shows general pricing + a registration banner.
// No cart, estimates, or order features are shown in browse mode.
export default function BrowsePage() {
  redirect('/catalog?mode=browse')
}
```

- [ ] **Step 13.4: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 13.5: Commit**

```bash
git add app/src/app/auth/login/page.tsx app/src/app/auth/verify/page.tsx app/src/app/auth/browse/page.tsx
git commit -m "feat(auth): login, verify, and browse auth pages"
```

---

### Task 14: Update middleware for route protection

**Files:**
- Modify: `app/src/middleware.ts`

The current middleware only protects `/admin` routes. We need to extend it to protect catalog/cart/orders routes using the existing `session_token` cookie + `getSession()`.

- [ ] **Step 14.1: Read current middleware**

Current file: `app/src/middleware.ts` — protects `/admin` via Supabase Auth. The integrator-facing routes use a custom session cookie (not Supabase Auth).

- [ ] **Step 14.2: Update middleware**

```typescript
// app/src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'

// Routes that require a valid integrator session_token
const PROTECTED_PREFIXES = ['/catalog', '/cart', '/orders', '/profile']
// Public routes that never need auth
const PUBLIC_PREFIXES = ['/auth', '/browse', '/', '/guest', '/offline', '/api', '/admin']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── Admin routes: Supabase Auth ──────────────────────────────────────────
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const response = NextResponse.next()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: name => request.cookies.get(name)?.value,
          set: (name, value, options) => response.cookies.set({ name, value, ...options }),
          remove: (name, options) => response.cookies.set({ name, value: '', ...options }),
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))
    return response
  }

  // ── Protected integrator routes: session_token cookie ───────────────────
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  // Check browse mode — allow unauthenticated catalog browsing
  const url = request.nextUrl
  if (pathname.startsWith('/catalog') && url.searchParams.get('mode') === 'browse') {
    return NextResponse.next()
  }

  const token = request.cookies.get('session_token')?.value
  if (!token) {
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, request.url))
  }

  const session = await getSession(token)
  if (!session) {
    // Invalid/expired session — clear cookie and redirect
    const redirect = NextResponse.redirect(new URL('/auth/login', request.url))
    redirect.cookies.set('session_token', '', { maxAge: 0, path: '/' })
    return redirect
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/catalog/:path*',
    '/cart/:path*',
    '/orders/:path*',
    '/profile/:path*',
  ],
}
```

- [ ] **Step 14.3: Type-check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 14.4: Verify the root redirect still works**

`app/src/app/page.tsx` currently does `redirect('/catalog')`. With middleware in place, visiting `/` will hit `/catalog` which redirects to `/auth/login` for unauthenticated users. This is the correct flow.

- [ ] **Step 14.5: Commit**

```bash
git add app/src/middleware.ts
git commit -m "feat(auth): middleware — protect catalog/cart/orders, allow browse mode"
```

---

### Task 15: Update root page redirect

**Files:**
- Modify: `app/src/app/page.tsx`

The root currently redirects to `/catalog`. After auth, we want the root to go to `/auth/login` for unauthenticated users. The middleware already handles this for `/catalog`, but let's keep the root redirect intact — it's the correct UX.

- [ ] **Step 15.1: No change needed**

The existing `redirect('/catalog')` in `app/src/app/page.tsx` is correct. The middleware will intercept `/catalog` and redirect to `/auth/login` for unauthenticated users. No change needed.

---

### Task 16: End-to-end flow test

- [ ] **Step 16.1: Start dev server**

```bash
cd app && npm run dev
```

- [ ] **Step 16.2: Test unregistered flow**

1. Open `http://localhost:3000` — should redirect to `/auth/login`
2. Enter an unregistered number (e.g. `9000000000`)
3. Should see UnregisteredMessage with WhatsApp CTA and "Browse Catalog" button
4. Click "Browse Catalog" — should redirect to `/catalog?mode=browse`

- [ ] **Step 16.3: Test registered flow (with a number from contacts table)**

```bash
# Find a test phone in local DB:
# npx supabase db execute --local -- "SELECT phone FROM contacts LIMIT 3"
```
1. Enter a registered phone number
2. Check dev console for `[DEV] OTP for +91...: XXXXXX`
3. Navigate to `/auth/verify?phone=+91XXXXXXXXXX`
4. Enter the OTP
5. Should redirect to `/catalog`

- [ ] **Step 16.4: Test rate limiting**

```bash
for i in 1 2 3 4; do
  curl -s -X POST http://localhost:3000/api/auth/send-otp \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber": "+919000000001"}' | jq .success
done
```
Expected: first 3 return `true`, 4th returns 429.

- [ ] **Step 16.5: Test logout**

```bash
# With a valid session cookie:
curl -s -X POST http://localhost:3000/api/auth/logout \
  -H "Cookie: session_token=<your-token>" | jq .
```
Expected: `{"success":true}` with `Set-Cookie: session_token=; Max-Age=0`

- [ ] **Step 16.6: Final type check**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 16.7: Final commit**

```bash
git add -A
git commit -m "feat(auth): WhatsApp OTP auth — complete implementation"
```

---

## Summary

### Files Created
| File | Purpose |
|------|---------|
| `supabase/migrations/008_otp_auth.sql` | `otp_sessions` + `auth_attempts` tables |
| `app/src/lib/auth/otp.ts` | OTP generation, hashing, phone validation |
| `app/src/lib/whatsapp/otp-service.ts` | WhatsApp OTP delivery + admin alert |
| `app/src/app/api/auth/send-otp/route.ts` | POST: validate phone, send OTP |
| `app/src/app/api/auth/verify-otp/route.ts` | POST: verify OTP, create session |
| `app/src/app/api/auth/refresh/route.ts` | POST: extend session |
| `app/src/components/auth/PhoneInput.tsx` | Phone entry form |
| `app/src/components/auth/OTPInput.tsx` | 6-digit OTP entry with timer |
| `app/src/components/auth/UnregisteredMessage.tsx` | Not-registered state |
| `app/src/app/auth/login/page.tsx` | Login page |
| `app/src/app/auth/verify/page.tsx` | OTP verification page |
| `app/src/app/auth/browse/page.tsx` | Browse mode redirect |
| `app/src/hooks/useAuth.ts` | Auth state hook |

### Files Modified
| File | Change |
|------|--------|
| `app/src/app/api/auth/logout/route.ts` | Implement (was TODO stub) |
| `app/src/middleware.ts` | Add integrator route protection |
| `app/.env.local.example` | Document WABA_* env vars |

### Preserved (Do Not Touch)
- `app/src/app/auth/[ref_id]/page.tsx` — existing WhatsApp-initiated flow
- `app/src/app/api/auth/verify/route.ts` — existing OTP verify for link-based flow
- `app/src/lib/whatsapp.ts` — quotation/guest link functions
- All catalog, cart, enquiry, and admin pages/routes
