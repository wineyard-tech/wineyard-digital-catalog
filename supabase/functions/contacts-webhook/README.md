# contacts-webhook

Supabase Edge Function that receives Zoho Books webhook events for Contacts and syncs them to Supabase in real-time.

## What It Does

| Zoho Event | Action |
|-----------|--------|
| `contact_created` | UPSERT into `contacts` + DELETE-then-INSERT `contact_persons` |
| `contact_updated` | UPSERT into `contacts` + DELETE-then-INSERT `contact_persons` |
| `contact_deleted` | DELETE from `contacts` (CASCADEs to `contact_persons`) |

Returns **HTTP 200** for all responses (including errors) to prevent Zoho retry storms. Failures are logged to `webhook_errors`.

---

## Environment Variables

| Variable | Description | Where to Set |
|----------|-------------|-------------|
| `ZOHO_WEBHOOK_TOKEN_CONTACTS` | Secret token Zoho sends in `x-zoho-webhook-token` header | Supabase Secrets |
| `SUPABASE_URL` | Auto-injected by Supabase Edge Functions runtime | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase Edge Functions runtime | — |

### Setting the token

```bash
# Generate a strong token
openssl rand -hex 32

# Set in Supabase
supabase secrets set ZOHO_WEBHOOK_TOKEN_CONTACTS=<your-token>
```

---

## Local Testing

### Prerequisites
- Supabase CLI running locally (`supabase start`)
- `supabase/functions/.env` file with local secrets

### Start function server

```bash
supabase functions serve contacts-webhook --env-file supabase/functions/.env
```

### Send test payloads

**Create contact with 2 contact persons:**
```bash
curl -X POST http://localhost:54321/functions/v1/contacts-webhook \
  -H 'x-zoho-webhook-token: test-token' \
  -H 'Content-Type: application/json' \
  -d "$(jq '.create_contact_with_persons' supabase/functions/contacts-webhook/test-payloads.json)"
```

**Update contact (pricebook changed, person swapped):**
```bash
curl -X POST http://localhost:54321/functions/v1/contacts-webhook \
  -H 'x-zoho-webhook-token: test-token' \
  -H 'Content-Type: application/json' \
  -d "$(jq '.update_contact_pricebook_change' supabase/functions/contacts-webhook/test-payloads.json)"
```

**Delete contact:**
```bash
curl -X POST http://localhost:54321/functions/v1/contacts-webhook \
  -H 'x-zoho-webhook-token: test-token' \
  -H 'Content-Type: application/json' \
  -d "$(jq '.delete_contact' supabase/functions/contacts-webhook/test-payloads.json)"
```

**Test invalid token (should return 401):**
```bash
curl -X POST http://localhost:54321/functions/v1/contacts-webhook \
  -H 'x-zoho-webhook-token: wrong-token' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## Manual Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|----------------|
| Create contact with 2 persons | Send `create_contact_with_persons` | Row in `contacts` + 2 rows in `contact_persons` |
| Update pricebook | Send `update_contact_pricebook_change` | `pricebook_id` updated in `contacts` |
| Update persons (swap) | Send update payload with different person IDs | Old `contact_persons` deleted, new ones inserted |
| Delete contact | Send `delete_contact` | Row removed from `contacts`, `contact_persons` cascaded |
| Idempotency | Send same payload twice | No duplicate rows, no errors |
| Invalid token | Send with wrong header | 401 response |
| Missing phone | Send payload without any phone field | Error logged to `webhook_errors`, returns 200 |
| Older Zoho format | Use `webhook_event: "Update"` instead of `event_type` | Handled correctly |

---

## Deployment

```bash
# Deploy to production
supabase functions deploy contacts-webhook

# Verify deployment
supabase functions list
```

Register this URL in Zoho Books (Settings → Webhooks):
- **URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/contacts-webhook`
- **Token Header:** `x-zoho-webhook-token: <ZOHO_WEBHOOK_TOKEN_CONTACTS>`
- **Events:** Contact Created, Contact Updated, Contact Deleted

---

## Troubleshooting

**401 Unauthorized**
- Check `ZOHO_WEBHOOK_TOKEN_CONTACTS` secret matches the token configured in Zoho
- Header name must be exactly `x-zoho-webhook-token` (lowercase)

**Contact upsert failed: duplicate key value violates unique constraint "contacts_phone_key"**
- Two contacts share the same phone number in Zoho. Resolve the duplicate in Zoho Books first.
- The failing contact is logged in `webhook_errors` with the full payload.

**No valid Indian phone found**
- Contact has no mobile/phone in Zoho Books (required for OTP login)
- Add a phone to the contact in Zoho Books; next sync or webhook will pick it up

**Data not updating**
```sql
-- Check recent errors
SELECT * FROM webhook_errors
WHERE webhook_type = 'contacts'
ORDER BY created_at DESC
LIMIT 20;
```

**View function logs**
```bash
supabase functions logs contacts-webhook --tail
```
