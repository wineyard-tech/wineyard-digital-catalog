# items-webhook

Supabase Edge Function that receives Zoho Books webhook notifications for **Item** events (create / update / delete) and syncs them to Supabase in real-time.

---

## How It Works

```
Zoho Books ──POST──▶ /functions/v1/items-webhook
                          │
                    Token validation
                          │
              ┌───────────┴───────────┐
           create/update           delete
              │                       │
         UPSERT items            DELETE items
         UPSERT categories       (cascades to
         UPSERT brands            item_locations)
         DELETE+INSERT
          item_locations
```

- **Single endpoint** handles all event types, routing on `event_type` field.
- **Always returns HTTP 200** (even on errors) to prevent Zoho from infinitely retrying.
- **Failures** are logged to `webhook_errors` table for async investigation.
- **Idempotent** — sending the same webhook twice produces no duplicate rows.

---

## Environment Variables

| Variable | Where Set | Description |
|---|---|---|
| `ZOHO_WEBHOOK_TOKEN_ITEMS` | Supabase secrets | Token Zoho sends in `x-zoho-webhook-token` header |
| `SUPABASE_URL` | Auto-injected | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected | Full DB access, bypasses RLS |

Set the token:
```bash
supabase secrets set ZOHO_WEBHOOK_TOKEN_ITEMS=your_secure_random_token_here
```

Generate a secure token:
```bash
openssl rand -hex 32
```

---

## Local Testing

### 1. Apply the webhook_errors migration

```bash
cd /path/to/wineyard-catalog
supabase db push --local
```

### 2. Start the function locally

```bash
supabase functions serve items-webhook --env-file supabase/functions/.env
```

Make sure `supabase/functions/.env` contains:
```
ZOHO_WEBHOOK_TOKEN_ITEMS=test-token
```

### 3. Send test payloads

**Create item with 3 warehouses:**
```bash
curl -s -X POST http://localhost:54321/functions/v1/items-webhook \
  -H "x-zoho-webhook-token: test-token" \
  -H "Content-Type: application/json" \
  -d "$(cat supabase/functions/items-webhook/test-payloads.json | jq '.create_item_with_warehouses')"
```

**Update item (price change + warehouse reallocation):**
```bash
curl -s -X POST http://localhost:54321/functions/v1/items-webhook \
  -H "x-zoho-webhook-token: test-token" \
  -H "Content-Type: application/json" \
  -d "$(cat supabase/functions/items-webhook/test-payloads.json | jq '.update_item_stock_change')"
```

**Delete item:**
```bash
curl -s -X POST http://localhost:54321/functions/v1/items-webhook \
  -H "x-zoho-webhook-token: test-token" \
  -H "Content-Type: application/json" \
  -d "$(cat supabase/functions/items-webhook/test-payloads.json | jq '.delete_item')"
```

**Test invalid token (expect 401):**
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:54321/functions/v1/items-webhook \
  -H "x-zoho-webhook-token: wrong-token" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 401
```

### 4. Verify in Supabase Studio

```bash
# Open local Studio
open http://localhost:54323
```

Check:
- `items` table: row with `zoho_item_id = '4600000012345'`
- `item_locations` table: 3 rows for create, 2 rows after update
- `categories` table: "IP Cameras" row
- `brands` table: "Hikvision" row

---

## Manual Test Cases

| Scenario | How to Test | Expected Result |
|---|---|---|
| Create item with 3 warehouses | Send `create_item_with_warehouses` payload | 1 item row + 3 location rows inserted |
| Idempotency (duplicate create) | Send same create payload twice | No duplicate rows, no error |
| Update with price change | Send `update_item_stock_change` after create | `base_rate` updated to 9200 |
| Warehouse reallocation | Update payload has 2 warehouses (was 3) | Old 3 location rows replaced with 2 new rows |
| Delete item | Send `delete_item` payload | Item row deleted; location rows cascade-deleted |
| Delete non-existent item | Send delete for unknown item_id | Returns 200, no error in `webhook_errors` |
| Invalid token | Send with wrong `x-zoho-webhook-token` | Returns 401 |
| Missing token | Send without header | Returns 401 |
| Malformed JSON | Send invalid JSON body | Returns 200 (no error logged) |
| Force error logging | Temporarily break DB connection | Entry appears in `webhook_errors` |

---

## Deployment

```bash
# Deploy to Supabase
supabase functions deploy items-webhook

# Verify deployment
supabase functions list

# Check logs
supabase functions logs items-webhook --tail
```

---

## Zoho Books Configuration

In Zoho Books → **Settings → Webhooks → New Webhook**:

| Field | Value |
|---|---|
| Webhook Name | WineYard Items Sync |
| URL | `https://{PROJECT_REF}.supabase.co/functions/v1/items-webhook` |
| Method | POST |
| Module | Items |
| Events | Item Created, Item Updated, Item Deleted |
| Custom Headers | `x-zoho-webhook-token: {ITEMS_TOKEN}` |

Use the same token value you set via `supabase secrets set ZOHO_WEBHOOK_TOKEN_ITEMS=...`.

---

## Troubleshooting

### 401 Unauthorized
- Token in Zoho webhook config must exactly match `ZOHO_WEBHOOK_TOKEN_ITEMS` secret.
- Header name is case-sensitive: `x-zoho-webhook-token`.

### Data not appearing
1. Check function logs: `supabase functions logs items-webhook`
2. Query `webhook_errors` table for logged failures.
3. Verify the `items` table schema matches expected columns.

### item_locations not updating
- The function deletes all existing locations then re-inserts. If delete fails (logged as warning), insert still runs.
- Check FK constraint: `item_locations.zoho_item_id` must reference an existing `items.zoho_item_id`.

### webhook_errors table missing
```bash
supabase db push --local  # applies 20260319000001_webhook_errors migration
```

### Zoho not sending webhooks
- Check Zoho delivery history: Settings → Webhooks → {webhook name} → Delivery History
- Ensure function URL is publicly accessible (not localhost).
- Verify the function returns 200 (check logs).
