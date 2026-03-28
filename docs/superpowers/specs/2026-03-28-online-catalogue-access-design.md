# Design: Online Catalogue Access Gate via Zoho `cf_online_catalogue_access`

**Date:** 2026-03-28
**Status:** Draft

---

## Overview

Add a new `online_catalogue_access` boolean field to the contacts sync pipeline and use it to gate OTP login. Contacts registered in Supabase but without catalog access are shown a WhatsApp prompt instead of receiving an OTP, and are still offered guest (browse) access.

---

## 1. Database

**Migration** — add one column to `contacts`:

```sql
ALTER TABLE contacts
  ADD COLUMN online_catalogue_access BOOLEAN NOT NULL DEFAULT false;
```

- Default `false` covers all existing rows and any future contact where Zoho doesn't set the field.
- No backfill needed — the next sync run populates correct values.
- No other tables affected.
- `auth_attempts.attempt_type` is free-form `TEXT NOT NULL` with no CHECK constraint — adding `'registered_no_access'` requires no schema migration.

---

## 2. Sync Functions

Affected files:
- `supabase/functions/initial_sync/index.ts`
- `supabase/functions/sync-contacts/index.ts`
- `supabase/functions/contacts-webhook/index.ts`

**Extraction helper (added inline in each row-builder):**

```ts
const customFields: Array<{api_name?: string; value?: unknown}> =
  Array.isArray(contact.custom_fields) ? contact.custom_fields : []

const catalogEntry = customFields.find(f => f.api_name === 'cf_online_catalogue_access')
const online_catalogue_access =
  catalogEntry?.value === true || catalogEntry?.value === 'true' || false
```

Zoho returns `custom_fields` as an array of `{api_name, value, ...}` objects. The value may be a native boolean or a `"true"`/`"false"` string depending on Zoho API version — both are handled. Absent field defaults to `false`.

Each sync path adds `online_catalogue_access` to the contact row object alongside existing fields.

**`contacts-webhook` — two additional changes:**

1. The `ZohoContactPayload` interface in `contacts-webhook/index.ts` does not currently include `custom_fields`. Add:
   ```ts
   custom_fields?: Array<{ api_name?: string; value?: unknown; [key: string]: unknown }>
   ```

2. Add `'online_catalogue_access'` to the `WATCHED_FIELDS` array so that access grants/revocations (`false → true` or `true → false`) appear in the delta audit log.

---

## 3. `send-otp` API Route

File: `app/src/app/api/auth/send-otp/route.ts`

**Query change** — add `online_catalogue_access` to the select:

```ts
.select('zoho_contact_id, contact_name, company_name, status, online_catalogue_access')
```

**Three-branch logic:**

| Condition | Action | Response |
|---|---|---|
| Not found or `status !== 'active'` | Log `unregistered`, fire admin alert | `{ registered: false }` |
| Active + `online_catalogue_access === false` | Log `registered_no_access` | `{ registered: true, catalogAccess: false }` |
| Active + `online_catalogue_access === true` | Generate + send OTP | `{ registered: true, catalogAccess: true, expiresIn }` |

- No OTP generated or WhatsApp message sent for `catalogAccess: false`.
- New `auth_attempts.attempt_type` value: `'registered_no_access'` for audit trail.
- **Rate limiting for `registered_no_access` path:** The existing rate-limit check counts `otp_sessions` rows, so it does not throttle this branch (no OTP session is created). This is acceptable — no credential is issued and no cost is incurred per request. If abuse becomes a concern in future, `auth_attempts` count by phone+type can be added.
- **`verify-otp` is unaffected** — it makes an independent DB lookup and does not parse the `send-otp` response body. The `catalogAccess` field addition to the successful response is non-breaking.

---

## 4. UI

### `LoginClient.tsx`

Add a third step:

```ts
type Step = 'phone' | 'unregistered' | 'no_access'
```

Handle the new response branch in `handleSendOTP`:

```ts
if (data.registered && data.catalogAccess) {
  router.push(`/auth/verify?phone=...`)
} else if (data.registered && !data.catalogAccess) {
  setStep('no_access')
} else {
  setStep('unregistered')
}
```

### New Component: `CatalogAccessBlockedMessage`

File: `app/src/components/auth/CatalogAccessBlockedMessage.tsx`

- Icon: amber shield/lock (neutral, not error red)
- Headline: "Catalog Access Not Enabled"
- Body: "Your account is registered but catalog access hasn't been activated. Contact us on WhatsApp to get access."
- WhatsApp button: links to `NEXT_PUBLIC_WHATSAPP_ADMIN`. Falls back to `NEXT_PUBLIC_WABA_LINK` if env var is absent (same fallback used by `UnregisteredMessage`).
- "Browse Catalog (General Pricing)" guest button (same as `UnregisteredMessage`)
- "Try a different number" link (same as `UnregisteredMessage`)

### Environment Variable

New: `NEXT_PUBLIC_WHATSAPP_ADMIN`
Format: `https://wa.me/919XXXXXXXXX`
Added to `.env.local` (placeholder) and `.env.example`.

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260328000001_online_catalogue_access.sql` | New migration — add column |
| `supabase/functions/initial_sync/index.ts` | Extract + map field in row builder |
| `supabase/functions/sync-contacts/index.ts` | Extract + map field in row builder |
| `supabase/functions/contacts-webhook/index.ts` | Add `custom_fields` to interface, add to `WATCHED_FIELDS`, extract + map in row builder |
| `app/src/app/api/auth/send-otp/route.ts` | Three-branch logic, new attempt type |
| `app/src/app/auth/login/LoginClient.tsx` | Third step state + handler branch |
| `app/src/components/auth/CatalogAccessBlockedMessage.tsx` | New component |
| `app/.env.local` | Add `NEXT_PUBLIC_WHATSAPP_ADMIN` placeholder |
| `app/.env.example` | Add `NEXT_PUBLIC_WHATSAPP_ADMIN` |
