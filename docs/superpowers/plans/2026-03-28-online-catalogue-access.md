# Online Catalogue Access Gate Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the Zoho `cf_online_catalogue_access` custom field into Supabase and use it to gate OTP login — active contacts without access see a WhatsApp prompt and get guest access instead of an OTP.

**Architecture:** Add a dedicated `online_catalogue_access BOOLEAN` column to `contacts`. All three sync paths (initial_sync, sync-contacts, contacts-webhook) extract the field from Zoho's `custom_fields` array and write it to the column. The `send-otp` route gains a third branch: active-but-no-access returns `{ registered: true, catalogAccess: false }` with no OTP sent. A new `CatalogAccessBlockedMessage` UI component handles this case.

**Tech Stack:** Supabase (Postgres + Deno edge functions), Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui, Zoho Books API v3

---

## Chunk 1: Database + Sync Functions

### Task 1: DB Migration — Add `online_catalogue_access` Column

**Files:**
- Create: `supabase/migrations/20260328000001_online_catalogue_access.sql`

**Context:** Migration naming in this repo uses timestamp prefix `YYYYMMDDNNNNNN_name.sql` for all migrations after the initial numbered set. The Supabase local instance is running via Docker (`npx supabase status` to verify). Apply migrations with `npx supabase db push --local`.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260328000001_online_catalogue_access.sql
-- Adds a dedicated boolean column to gate OTP login for contacts
-- that are registered in Zoho but haven't been granted catalog access.
-- Default false covers all existing rows; next sync run will populate correct values.

ALTER TABLE contacts
  ADD COLUMN online_catalogue_access BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration to local Supabase**

```bash
cd /path/to/project && npx supabase db push --local
```

Expected output: `Applying migration 20260328000001_online_catalogue_access.sql...` with no errors.

- [ ] **Step 3: Verify the column exists**

```bash
npx supabase db execute --local "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'online_catalogue_access';"
```

Expected: one row showing `online_catalogue_access | boolean | false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000001_online_catalogue_access.sql
git commit -m "feat: add online_catalogue_access column to contacts"
```

---

### Task 2: Update `sync-contacts` Edge Function

**Files:**
- Modify: `supabase/functions/sync-contacts/index.ts` (around line 94–114, the `contactRows.push({...})` block)

**Context:** `sync-contacts` is the incremental daily sync. It processes one Zoho API page at a time (async generator). The contact row is built in a `for (const contact of slice)` loop. Zoho returns `custom_fields` as an array of objects: `[{ api_name: "cf_online_catalogue_access", value: true, ... }]`. The value may be a native boolean or a string `"true"`/`"false"`.

- [ ] **Step 1: Add extraction logic and new field to the contactRows.push() call**

In `sync-contacts/index.ts`, find the block starting with `contactRows.push({` (around line 94). Immediately before that push, add the extraction logic. Then add the new field inside the push.

Before the `contactRows.push({` line, insert:

```ts
// Extract cf_online_catalogue_access from Zoho custom_fields array
const cfFields: Array<{ api_name?: string; value?: unknown }> =
  Array.isArray(contact.custom_fields) ? contact.custom_fields : []
const cfCatalogEntry = cfFields.find(f => f.api_name === 'cf_online_catalogue_access')
const online_catalogue_access =
  cfCatalogEntry?.value === true || cfCatalogEntry?.value === 'true' || false
```

Inside `contactRows.push({...})`, add this line after `custom_fields: contact.custom_fields ?? {}`:

```ts
online_catalogue_access,
```

- [ ] **Step 2: Verify the TypeScript is valid (no tsc errors)**

```bash
cd supabase/functions/sync-contacts && npx tsc --noEmit --allowImportingTsExtensions 2>&1 || echo "(tsc errors expected in Deno context — check for syntax errors only)"
```

Alternatively, open the file and visually confirm no red squiggles in your editor.

- [ ] **Step 3: Functional spot-check — confirm upsert writes the new column**

After the migration is applied (Task 1), insert a test row via Supabase local to confirm the column is writable:
```sql
INSERT INTO contacts (zoho_contact_id, contact_name, phone, status, online_catalogue_access)
VALUES ('test-sync-001', 'Sync Test', '+919000000001', 'active', true)
ON CONFLICT (zoho_contact_id) DO UPDATE SET online_catalogue_access = EXCLUDED.online_catalogue_access;

SELECT zoho_contact_id, online_catalogue_access FROM contacts WHERE zoho_contact_id = 'test-sync-001';
```
Expected: `online_catalogue_access = true`. Delete after verifying: `DELETE FROM contacts WHERE zoho_contact_id = 'test-sync-001';`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sync-contacts/index.ts
git commit -m "feat: sync online_catalogue_access in sync-contacts"
```

---

### Task 3: Update `initial_sync` Edge Function

**Files:**
- Modify: `supabase/functions/initial_sync/index.ts` (around line 573–593, the contacts `contactRows.push({...})` block)

**Context:** `initial_sync` is the full-batch sync used for first-run or large resyncs. The contacts section has the same row-builder pattern as `sync-contacts`. Make the identical extraction change here.

- [ ] **Step 1: Add extraction logic and new field to the contactRows.push() call**

Find the `contactRows.push({` block in the contacts section (around line 573). The contacts section is identifiable by the surrounding `// ── Build contact rows ──` comment. Immediately before the push, add:

```ts
// Extract cf_online_catalogue_access from Zoho custom_fields array
const cfFields: Array<{ api_name?: string; value?: unknown }> =
  Array.isArray(contact.custom_fields) ? contact.custom_fields : []
const cfCatalogEntry = cfFields.find(f => f.api_name === 'cf_online_catalogue_access')
const online_catalogue_access =
  cfCatalogEntry?.value === true || cfCatalogEntry?.value === 'true' || false
```

Inside `contactRows.push({...})`, add after `custom_fields: contact.custom_fields ?? {}`:

```ts
online_catalogue_access,
```

- [ ] **Step 2: Verify no syntax errors** (visual check or tsc as above)

- [ ] **Step 3: Functional spot-check**

Verify the column is writable (if not already done in Task 2, Step 3 — skip if already confirmed).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/initial_sync/index.ts
git commit -m "feat: sync online_catalogue_access in initial_sync"
```

---

### Task 4: Update `contacts-webhook` Edge Function

**Files:**
- Modify: `supabase/functions/contacts-webhook/index.ts`
  - Line 64: `custom_fields` type in `ZohoContactPayload` interface
  - Lines 26–31: `WATCHED_FIELDS` array
  - Lines 142–162: `contactRow` object in `handleUpsert()`

**Context:** The webhook handles real-time Zoho contact events. Three distinct changes are needed:

1. `ZohoContactPayload.custom_fields` is currently typed as `Record<string, unknown>` — Zoho actually returns an array; fix the type.
2. `WATCHED_FIELDS` drives the delta audit log — add `online_catalogue_access` so access grants/revocations are recorded.
3. The `contactRow` object in `handleUpsert()` needs the new field.

- [ ] **Step 1: Fix the `custom_fields` type in `ZohoContactPayload`**

Find line 64:
```ts
custom_fields?: Record<string, unknown>
```

Replace with:
```ts
custom_fields?: Array<{ api_name?: string; value?: unknown; [key: string]: unknown }>
```

- [ ] **Step 2: Add `online_catalogue_access` to `WATCHED_FIELDS`**

Find the `WATCHED_FIELDS` array (lines 26–31):
```ts
const WATCHED_FIELDS = [
  'status', 'contact_name', 'company_name',
  'pricebook_id', 'phone', 'email',
  'payment_terms', 'payment_terms_label',
  'currency_code', 'contact_type',
]
```

Replace with:
```ts
const WATCHED_FIELDS = [
  'status', 'contact_name', 'company_name',
  'pricebook_id', 'phone', 'email',
  'payment_terms', 'payment_terms_label',
  'currency_code', 'contact_type',
  'online_catalogue_access',
]
```

- [ ] **Step 3: Add extraction + new field to `contactRow` in `handleUpsert()`**

Find the `contactRow` object (around line 142). Immediately before `const contactRow = {`, add:

```ts
// Extract cf_online_catalogue_access from Zoho custom_fields array
const cfFields: Array<{ api_name?: string; value?: unknown }> =
  Array.isArray(contact.custom_fields) ? contact.custom_fields : []
const cfCatalogEntry = cfFields.find(f => f.api_name === 'cf_online_catalogue_access')
const online_catalogue_access =
  cfCatalogEntry?.value === true || cfCatalogEntry?.value === 'true' || false
```

Inside `contactRow`, add after `custom_fields: contact.custom_fields ?? {}`:

```ts
online_catalogue_access,
```

Also update the fallback on the `custom_fields` line itself — now that the type is `Array<...>`, an empty object fallback is semantically wrong. Find:
```ts
custom_fields:             contact.custom_fields ?? {},
```
Replace with:
```ts
custom_fields:             contact.custom_fields ?? [],
```

- [ ] **Step 4: Verify no syntax errors** (visual check)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/contacts-webhook/index.ts
git commit -m "feat: sync online_catalogue_access in contacts-webhook"
```

---

## Chunk 2: Auth Route + UI

### Task 5: Update `send-otp` API Route

**Files:**
- Modify: `app/src/app/api/auth/send-otp/route.ts`

**Context:** The route currently has two outcomes after looking up the contact: `registered: false` (not found / inactive) and `registered: true` (send OTP). We add a third: `registered: true, catalogAccess: false` for active contacts without access. Key points:
- The existing rate-limit check (`otp_sessions` count) does NOT cover this branch — that's intentional and acceptable (no OTP is issued, no cost incurred).
- `attempt_type` in `auth_attempts` is free-form TEXT — no schema change needed for the new value `'registered_no_access'`.
- `verify-otp` does not read the `send-otp` response body — the new `catalogAccess` field on the success response is non-breaking.

- [ ] **Step 1: Update the contact select query to include `online_catalogue_access`**

Find (around line 63–67):
```ts
  const { data: contact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name, company_name, status')
    .eq('phone', phone)
    .maybeSingle()
```

Replace with:
```ts
  const { data: contact } = await supabase
    .from('contacts')
    .select('zoho_contact_id, contact_name, company_name, status, online_catalogue_access')
    .eq('phone', phone)
    .maybeSingle()
```

- [ ] **Step 2: Add the three-branch contact check logic**

Find the existing two-branch check (lines 69–82):
```ts
  if (!contact || contact.status !== 'active') {
    // Capture as lead — fire-and-forget admin alert
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'unregistered',
      ip_address: ip,
      user_agent: userAgent,
    })
    sendUnregisteredAlert(phone, now) // intentionally not awaited
    return NextResponse.json(
      { success: true, registered: false, message: 'Please contact WineYard to register.' },
      { status: 200 },
    )
  }
```

Replace with:
```ts
  if (!contact || contact.status !== 'active') {
    // Capture as lead — fire-and-forget admin alert
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'unregistered',
      ip_address: ip,
      user_agent: userAgent,
    })
    sendUnregisteredAlert(phone, now) // intentionally not awaited
    return NextResponse.json(
      { success: true, registered: false, message: 'Please contact WineYard to register.' },
      { status: 200 },
    )
  }

  if (!contact.online_catalogue_access) {
    // Registered and active but not granted catalog access — no OTP sent
    await supabase.from('auth_attempts').insert({
      phone,
      attempt_type: 'registered_no_access',
      ip_address: ip,
      user_agent: userAgent,
    })
    return NextResponse.json(
      { success: true, registered: true, catalogAccess: false },
      { status: 200 },
    )
  }
```

- [ ] **Step 3: Add `catalogAccess: true` to the existing success response (line ~123)**

Find:
```ts
  return NextResponse.json(
    { success: true, registered: true, expiresIn: OTP_EXPIRY_MINUTES * 60 },
    { status: 200 },
  )
```

Replace with:
```ts
  return NextResponse.json(
    { success: true, registered: true, catalogAccess: true, expiresIn: OTP_EXPIRY_MINUTES * 60 },
    { status: 200 },
  )
```

- [ ] **Step 4: Manual verification — test the three branches with curl**

Start the dev server: `cd app && npm run dev`

**Branch 1 — unregistered number:**
```bash
curl -s -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9000000000"}' | jq .
```
Expected: `{ "success": true, "registered": false, ... }`

**Branch 2 — registered, no access:** Insert a test contact with `online_catalogue_access = false` in local Supabase:
```sql
INSERT INTO contacts (zoho_contact_id, contact_name, phone, status, online_catalogue_access)
VALUES ('test-001', 'Test No Access', '+919111111111', 'active', false)
ON CONFLICT DO NOTHING;
```
Then:
```bash
curl -s -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9111111111"}' | jq .
```
Expected: `{ "success": true, "registered": true, "catalogAccess": false }`

**Branch 3 — registered, has access:** Update the test contact:
```sql
UPDATE contacts SET online_catalogue_access = true WHERE zoho_contact_id = 'test-001';
```
Then re-run the curl — expected: `{ "success": true, "registered": true, "catalogAccess": true, "expiresIn": 600 }`

- [ ] **Step 5: Commit**

```bash
git add app/src/app/api/auth/send-otp/route.ts
git commit -m "feat: three-branch OTP gate using online_catalogue_access"
```

---

### Task 6: Create `CatalogAccessBlockedMessage` Component

**Files:**
- Create: `app/src/components/auth/CatalogAccessBlockedMessage.tsx`

**Context:** This component is shown when a registered, active contact has `online_catalogue_access = false`. It should feel different from `UnregisteredMessage` (which is shown for unknown numbers) — the user IS registered, they just need to request access. Tone: informational/amber, not error/red. Matches the existing Tailwind + design system used in `UnregisteredMessage.tsx`. References `NEXT_PUBLIC_WHATSAPP_ADMIN` env var; falls back to `NEXT_PUBLIC_WABA_LINK` if absent.

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/auth/CatalogAccessBlockedMessage.tsx
'use client'

import { ShieldAlert, MessageCircle } from 'lucide-react'

interface CatalogAccessBlockedMessageProps {
  phoneNumber: string
  onBrowseCatalog: () => void
  onTryAgain: () => void
}

export default function CatalogAccessBlockedMessage({
  phoneNumber,
  onBrowseCatalog,
  onTryAgain,
}: CatalogAccessBlockedMessageProps) {
  const adminLink =
    process.env.NEXT_PUBLIC_WHATSAPP_ADMIN ??
    process.env.NEXT_PUBLIC_WABA_LINK ??
    'https://wa.me/91'

  const displayPhone = phoneNumber
    .replace('+91', '+91 ')
    .replace(/(\d{5})(\d{5})$/, '$1 $2')

  return (
    <div className="w-full text-center">
      <div className="w-14 h-14 bg-[#FFFBEB] rounded-full flex items-center justify-center mx-auto mb-3">
        <ShieldAlert className="w-6 h-6 text-[#D97706]" />
      </div>
      <h2 className="text-base font-bold text-[#0F172A] mb-1">
        Catalog Access Not Enabled
      </h2>
      <p className="text-sm text-[#64748B] mb-1">
        <span className="font-semibold text-[#0F172A]">{displayPhone}</span> is registered
        but hasn&apos;t been granted catalog access.
      </p>
      <p className="text-sm text-[#64748B] mb-6">
        Contact us on WhatsApp to activate your digital catalog access.
      </p>

      <a
        href={adminLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 bg-[#25D366] text-white rounded-xl text-sm font-bold mb-3 no-underline active:bg-[#1EBE5A]"
      >
        <MessageCircle className="w-4 h-4" />
        Request Access on WhatsApp
      </a>

      <button
        onClick={onBrowseCatalog}
        className="w-full h-12 bg-[#F1F5F9] text-[#334155] rounded-xl text-sm font-semibold mb-3 border-0 active:bg-[#E2E8F0]"
      >
        Browse Catalog (General Pricing)
      </button>

      <button
        onClick={onTryAgain}
        className="text-sm font-semibold text-[#0066CC] bg-transparent border-0 active:opacity-70"
      >
        Try a different number
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/auth/CatalogAccessBlockedMessage.tsx
git commit -m "feat: add CatalogAccessBlockedMessage component"
```

---

### Task 7: Update `LoginClient.tsx`

**Files:**
- Modify: `app/src/app/auth/login/LoginClient.tsx`

**Context:** `LoginClient` drives the login page state machine. Currently it has two steps: `'phone'` (entry) and `'unregistered'` (unknown number). We add `'no_access'` (registered but blocked). The `handleSendOTP` response type also needs `catalogAccess` added. The new step renders `CatalogAccessBlockedMessage`.

- [ ] **Step 1: Add the import for the new component**

At the top of `LoginClient.tsx`, add after the existing `UnregisteredMessage` import:
```ts
import CatalogAccessBlockedMessage from '@/components/auth/CatalogAccessBlockedMessage'
```

- [ ] **Step 2: Extend the `Step` type**

Find:
```ts
type Step = 'phone' | 'unregistered'
```

Replace with:
```ts
type Step = 'phone' | 'unregistered' | 'no_access'
```

- [ ] **Step 3: Update the `handleSendOTP` response type and branching logic**

Find the fetch response type (around line 33):
```ts
const data = (await res.json()) as {
  success: boolean
  registered: boolean
  error?: string
}
```

Replace with:
```ts
const data = (await res.json()) as {
  success: boolean
  registered: boolean
  catalogAccess?: boolean
  error?: string
}
```

Find the routing logic (around lines 45–49):
```ts
setPhone(phoneNumber)
if (data.registered) {
  router.push(`/auth/verify?phone=${encodeURIComponent(phoneNumber)}`)
} else {
  setStep('unregistered')
}
```

Replace with:
```ts
setPhone(phoneNumber)
if (data.registered && data.catalogAccess) {
  router.push(`/auth/verify?phone=${encodeURIComponent(phoneNumber)}`)
} else if (data.registered && !data.catalogAccess) {
  setStep('no_access')
} else {
  setStep('unregistered')
}
```

- [ ] **Step 4: Add the subtitle for the `no_access` step**

Find (around line 66–68):
```tsx
          {step === 'phone'
            ? 'Enter your mobile number to receive an OTP on WhatsApp'
            : 'Account not found'}
```

Replace with:
```tsx
          {step === 'phone'
            ? 'Enter your mobile number to receive an OTP on WhatsApp'
            : step === 'no_access'
            ? 'Access not enabled'
            : 'Account not found'}
```

- [ ] **Step 5: Add the `no_access` step render in the card**

Find (around line 74–91):
```tsx
        {step === 'phone' ? (
          <>
            <PhoneInput onSubmit={handleSendOTP} loading={loading} />
            {error && (
              <p className="mt-3 text-center text-xs text-[#DC2626]">{error}</p>
            )}
          </>
        ) : (
          <UnregisteredMessage
            phoneNumber={phone}
            onBrowseCatalog={() => router.push('/auth/browse')}
            onTryAgain={() => {
              setStep('phone')
              setPhone('')
              setError('')
            }}
          />
        )}
```

Replace with:
```tsx
        {step === 'phone' ? (
          <>
            <PhoneInput onSubmit={handleSendOTP} loading={loading} />
            {error && (
              <p className="mt-3 text-center text-xs text-[#DC2626]">{error}</p>
            )}
          </>
        ) : step === 'no_access' ? (
          <CatalogAccessBlockedMessage
            phoneNumber={phone}
            onBrowseCatalog={() => router.push('/auth/browse')}
            onTryAgain={() => {
              setStep('phone')
              setPhone('')
              setError('')
            }}
          />
        ) : (
          <UnregisteredMessage
            phoneNumber={phone}
            onBrowseCatalog={() => router.push('/auth/browse')}
            onTryAgain={() => {
              setStep('phone')
              setPhone('')
              setError('')
            }}
          />
        )}
```

- [ ] **Step 6: Manual browser verification**

With the test contact (`online_catalogue_access = false`) still in local Supabase:
1. Navigate to `http://localhost:3000/auth/login`
2. Enter the test phone number (`9111111111`)
3. Tap "Send OTP"
4. Confirm: amber shield icon, "Catalog Access Not Enabled" headline, "Request Access on WhatsApp" green button, "Browse Catalog" button visible
5. Tap "Browse Catalog" — confirm redirect to `/auth/browse`
6. Go back, tap "Try a different number" — confirm return to phone entry step

- [ ] **Step 7: Commit**

```bash
git add app/src/app/auth/login/LoginClient.tsx
git commit -m "feat: handle no_access step in LoginClient"
```

---

### Task 8: Environment Variables

**Files:**
- Create: `app/.env.example`
- Modify: `app/.env.local` (add placeholder line — do not commit this file)

**Context:** `.env.example` does not yet exist. Create it as a template for new developers. `.env.local` holds real credentials and is gitignored — just add the new var as a placeholder for the current dev to fill in.

- [ ] **Step 1: Create `app/.env.example`**

```bash
# app/.env.example
# Copy to .env.local and fill in real values before running the app.

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WhatsApp / WABA
NEXT_PUBLIC_WABA_LINK=https://wa.me/91XXXXXXXXXX
NEXT_PUBLIC_WHATSAPP_ADMIN=https://wa.me/91XXXXXXXXXX

# OTP config
OTP_EXPIRY_MINUTES=10
```

- [ ] **Step 2: Add `NEXT_PUBLIC_WHATSAPP_ADMIN` placeholder to `.env.local`**

Open `app/.env.local` (it already exists with real credentials). Add this line:
```
NEXT_PUBLIC_WHATSAPP_ADMIN=https://wa.me/91XXXXXXXXXX
```
Replace `XXXXXXXXXX` with the real admin WhatsApp number.

- [ ] **Step 3: Confirm `.env.local` is gitignored**

```bash
cat app/.gitignore | grep env
```

Expected: `.env*.local` or `.env.local` is listed.

- [ ] **Step 4: Commit only `.env.example`**

```bash
git add app/.env.example
git commit -m "chore: add .env.example with NEXT_PUBLIC_WHATSAPP_ADMIN"
```

---

## Final Verification

- [ ] Run `cd app && npm run build` — confirm no TypeScript or build errors
- [ ] Run `cd app && npm run lint` — confirm no lint errors
- [ ] Confirm the three `send-otp` branches all return the expected JSON (curl commands in Task 5, Step 4)
- [ ] Confirm the `no_access` UI renders correctly in the browser (Task 7, Step 6)
- [ ] Open a PR against `main` with all commits from this branch
