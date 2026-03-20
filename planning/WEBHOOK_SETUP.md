# Zoho Books → Supabase Real-Time Webhook Setup

**Purpose:** Real-time sync from Zoho Books to Supabase via webhooks for Items and Contacts.

**Architecture:** 4 webhooks → 2 Supabase Edge Functions → Upsert/Delete in Supabase PostgreSQL

---

## 1. Zoho Webhook Configuration

### Webhooks to Configure in Zoho Books

| Entity | Event Type | Webhook URL | Token Header |
|--------|-----------|-------------|--------------|
| **Items** | Create/Update | `https://{PROJECT_REF}.supabase.co/functions/v1/items-webhook` | `x-zoho-webhook-token: {ITEMS_TOKEN}` |
| **Items** | Delete | `https://{PROJECT_REF}.supabase.co/functions/v1/items-webhook` | `x-zoho-webhook-token: {ITEMS_TOKEN}` |
| **Contacts** | Create/Update | `https://{PROJECT_REF}.supabase.co/functions/v1/contacts-webhook` | `x-zoho-webhook-token: {CONTACTS_TOKEN}` |
| **Contacts** | Delete | `https://{PROJECT_REF}.supabase.co/functions/v1/contacts-webhook` | `x-zoho-webhook-token: {CONTACTS_TOKEN}` |

**Security:** Use different tokens for Items vs Contacts (rotate quarterly).

---

## 2. Zoho Webhook Payload Structures

### Items Webhook Payload (Create/Update)
Payload is the entire item entity. Refer https://www.zoho.com/books/api/v3/items/#overview for response example

### Items Webhook Payload (Delete)
Payload is the entire item entity. Refer https://www.zoho.com/books/api/v3/items/#overview for response example

### Contacts Webhook Payload (Create/Update)
Payload is the entire Contact entity. Refer https://www.zoho.com/books/api/v3/contacts/#overview for response example

### Contacts Webhook Payload (Delete)
Payload is the entire Contact entity. Refer https://www.zoho.com/books/api/v3/contacts/#overview for response example
---

## 3. Supabase Database Schema
Use Existing database schema in the database. No changes to the schema. Look up by ID before updating

### Table: `webhook_errors`
Create audit tables for webhooks and track webhook syncs
```sql
CREATE TABLE webhook_errors (
  id SERIAL PRIMARY KEY,
  webhook_type TEXT NOT NULL, -- 'items' | 'contacts'
  event_type TEXT NOT NULL, -- 'created' | 'updated' | 'deleted'
  zoho_entity_id TEXT,
  error_message TEXT NOT NULL,
  payload JSONB,
  retry_count INTEGER DEFAULT 0,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_errors_resolved ON webhook_errors(resolved);
CREATE INDEX idx_webhook_errors_type ON webhook_errors(webhook_type);
```

---

## 4. Field Mapping: Zoho → Supabase
Use existing field mapping as in the database and other sync scripts

---

## 5. Webhook Handler Logic

### Create/Update Flow (Items & Contacts)

```
1. Receive webhook POST
2. Validate token in x-zoho-webhook-token header
3. Extract event type (created/updated)
4. Extract entity data from payload.data
5. Transform Zoho fields → Supabase fields
6. UPSERT into main table (items or contacts)
   - ON CONFLICT (zoho_item_id or zoho_contact_id) DO UPDATE
7. If nested data exists (warehouses/contact_persons):
   - Delete existing child records
   - Insert new child records
8. Update synced_at timestamp
9. Return 200 OK
10. On error: Log to webhook_errors table, still return 200
```

### Delete Flow (Items & Contacts)

```
1. Receive webhook POST
2. Validate token in x-zoho-webhook-token header
3. Extract entity ID from payload.data
4. DELETE from main table WHERE zoho_item_id = ? (or zoho_contact_id)
   - CASCADE deletes child records (item_locations/contact_persons)
5. Return 200 OK
6. On error: Log to webhook_errors table, still return 200
```

### Token Validation

```typescript
const receivedToken = request.headers.get('x-zoho-webhook-token');
const expectedToken = Deno.env.get('ZOHO_WEBHOOK_TOKEN_ITEMS'); // or CONTACTS

if (receivedToken !== expectedToken) {
  return new Response('Unauthorized', { status: 401 });
}
```

### Error Handling Pattern

```typescript
try {
  // Process webhook
  await upsertItem(data);
  return new Response('OK', { status: 200 });
} catch (error) {
  // Log error but still return 200 to prevent Zoho retries
  await logWebhookError({
    webhook_type: 'items',
    event_type: eventType,
    zoho_entity_id: data.item_id,
    error_message: error.message,
    payload: payload
  });
  
  return new Response('OK', { status: 200 });
}
```

---

## 6. Non-Functional Requirements

### Performance
- **Response Time:** <500ms (return 200 immediately)
- **Processing:** Async/background if needed (use Supabase client, not blocking)
- **Throughput:** Handle 100 webhooks/minute (bulk import scenario)

### Reliability
- **Idempotency:** UPSERT operations (safe to receive duplicate webhooks)
- **Error Logging:** All failures logged to `webhook_errors` table
- **Always Return 200:** Even on validation/processing errors (prevent Zoho retries)

### Security
- **Token Validation:** Check x-zoho-webhook-token header on every request
- **Environment Variables:** Store tokens in Supabase Edge Function secrets
- **No Sensitive Data in Logs:** Redact PII from error logs

### Monitoring
- **Success Rate:** Track in webhook_errors table (resolved = false count)
- **Processing Time:** Log duration of each webhook handler
- **Alert Thresholds:** >10 errors/hour = notification

---

## 7. Testing Checklist

### Items Webhook
- [ ] Create new item → Verify inserted in `items` table
- [ ] Update existing item → Verify updated in `items` table
- [ ] Delete item → Verify deleted from `items` table
- [ ] Create with warehouses → Verify `item_locations` populated
- [ ] Update warehouses → Verify old locations deleted, new inserted
- [ ] Invalid token → Verify 401 response
- [ ] Malformed payload → Verify logged to `webhook_errors`, returns 200
- [ ] Duplicate webhook → Verify idempotent (no duplicate rows)

### Contacts Webhook
- [ ] Create new contact → Verify inserted in `contacts` table
- [ ] Update existing contact → Verify updated in `contacts` table
- [ ] Delete contact → Verify deleted from `contacts` table
- [ ] Create with contact_persons → Verify `contact_persons` populated
- [ ] Update contact_persons → Verify old persons deleted, new inserted
- [ ] Invalid token → Verify 401 response
- [ ] Malformed payload → Verify logged to `webhook_errors`, returns 200
- [ ] Duplicate webhook → Verify idempotent (no duplicate rows)

### Performance Testing
- [ ] 100 webhooks in 1 minute → All processed without timeout
- [ ] Large payload (500 warehouses) → Processes in <2 seconds
- [ ] Concurrent webhooks → No race conditions (database locks handle)

---

## 8. Deployment Steps

### Step 1: Create Supabase Edge Functions
```bash
# Initialize Supabase project (if not done)
supabase init

# Create functions
supabase functions new items-webhook
supabase functions new contacts-webhook

# Deploy functions
supabase functions deploy items-webhook
supabase functions deploy contacts-webhook
```

### Step 2: Set Environment Variables
```bash
# Set webhook tokens
supabase secrets set ZOHO_WEBHOOK_TOKEN_ITEMS=your_random_token_here
supabase secrets set ZOHO_WEBHOOK_TOKEN_CONTACTS=another_random_token

# Set Supabase credentials (auto-injected in Edge Functions)
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are available by default
```

---

## 9. Troubleshooting Guide

### Webhook Not Received
- Check Zoho webhook delivery logs (Settings → Webhooks → Delivery History)
- Verify Supabase Edge Function URL is correct
- Check Supabase Function logs: `supabase functions logs items-webhook`

### 401 Unauthorized
- Verify token in Zoho webhook config matches Supabase secret
- Check header name is exactly `x-zoho-webhook-token` (case-sensitive)

### Data Not Updating
- Check `webhook_errors` table for logged errors
- Verify field mappings (Zoho field names may differ)
- Check Supabase table constraints (UNIQUE, NOT NULL)

### Performance Issues
- Check Supabase database connection pool usage
- Verify indexes exist on foreign keys
- Consider batching child record inserts (warehouses/contact_persons)

---

**End of WEBHOOK_SETUP.md**
