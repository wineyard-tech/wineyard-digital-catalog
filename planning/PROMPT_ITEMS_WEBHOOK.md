# ClaudeCode Prompt: Items Webhook (Supabase Edge Function)

## Context

You're building a real-time sync system from Zoho Books to Supabase for WineYard Technologies, a CCTV distributor. This webhook receives notifications when Items (products) are created, updated, or deleted in Zoho Books and syncs them to Supabase PostgreSQL.

**Business Domain:** B2B catalog platform for CCTV distributors. Items = products like cameras, NVRs, cables. Integrators (installers) browse catalog via mobile app.

**Technical Context:**
- **Platform:** Supabase Edge Functions (Deno runtime)
- **Database:** Supabase PostgreSQL with tables: `items`, `item_locations`, `webhook_errors`
- **Zoho Books:** Source of truth for product catalog, stock levels, pricing
- **Sync Strategy:** Real-time webhooks (this function) + 4x daily batch sync (separate cron job)

**Reference Document:** `/home/claude/WEBHOOK_SETUP.md` contains complete specs (payload structure, field mappings, error handling patterns, database schema).

---

## Domain (What This Function Can Touch)

**ALLOWED:**
- Read from `WEBHOOK_SETUP.md` for complete specifications
- Create/modify Supabase Edge Function at `supabase/functions/items-webhook/index.ts`
- Interact with Supabase tables: `items`, `item_locations`, `webhook_errors`
- Use Supabase service role client (credentials auto-injected in Edge Functions)
- Write test fixtures for webhook payloads (mock Zoho data)
- Create helper functions for field mapping, validation, error logging

**NOT ALLOWED:**
- Modify database schema (tables already exist per WEBHOOK_SETUP.md)
- Touch Contacts webhook (separate ClaudeCode session)
- Modify existing sync jobs (cron-based batch sync is separate system)
- Change Zoho Books configuration (webhooks configured by client)

---

## Task

Build a production-ready Supabase Edge Function that:

1. **Receives Zoho Books webhooks** for Items (Create/Update/Delete events)
2. **Validates webhook authenticity** using `x-zoho-webhook-token` header
3. **Processes payloads** and syncs to Supabase:
   - **Create/Update:** UPSERT into `items` table + child records in `item_locations`
   - **Delete:** DELETE from `items` table (cascades to `item_locations`)
4. **Handles errors gracefully:**
   - Log failures to `webhook_errors` table
   - Always return 200 OK (prevent Zoho retries on transient errors)
5. **Ensures idempotency:** Safe to receive duplicate webhooks (use UPSERT)

**Key Scenarios to Handle:**
- Item with multiple warehouse locations (child records in `item_locations`)
- Item update that changes warehouse stock allocation (delete old + insert new)
- Malformed payloads (missing required fields)
- Invalid/missing authentication token
- Database constraint violations (duplicate SKU, missing category)

---

## Acceptance Criteria

### Functional Requirements
- [ ] **Auth:** Rejects requests with missing/invalid `x-zoho-webhook-token` (401 response)
- [ ] **Create:** New item in Zoho → Inserted into `items` + `item_locations` tables
- [ ] **Update:** Existing item change → Updated in `items` table
- [ ] **Update (Warehouses):** Stock location changes → Old `item_locations` deleted, new inserted
- [ ] **Delete:** Item deleted in Zoho → Deleted from `items` (cascades to `item_locations`)
- [ ] **Idempotency:** Duplicate webhook with same data → No duplicate rows, no errors

### Non-Functional Requirements
- [ ] **Performance:** Responds in <500ms (return 200 immediately, process async if needed)
- [ ] **Error Handling:** All exceptions logged to `webhook_errors` with full payload
- [ ] **Logging:** Console logs for: received event type, item ID, processing result
- [ ] **Field Mapping:** Follows exact mappings in WEBHOOK_SETUP.md (e.g., `rate` → `base_rate`)
- [ ] **Type Safety:** TypeScript types for Zoho payloads, Supabase rows

### Code Quality
- [ ] **Structured:** Clear separation: auth → parse → validate → upsert → respond
- [ ] **Commented:** Document non-obvious logic (e.g., why delete-then-insert for warehouses)
- [ ] **Environment Variables:** Use `Deno.env.get('ZOHO_WEBHOOK_TOKEN_ITEMS')` for token
- [ ] **Supabase Client:** Use service role client (full access, bypass RLS)

### Testing
- [ ] **Test Fixtures:** Create 3 mock payloads (create, update, delete)
- [ ] **Test Instructions:** Document how to test locally using `supabase functions serve`
- [ ] **Manual Test Cases:** List scenarios to verify (e.g., "Create item with 3 warehouses")

---

## Deliverables

1. **Edge Function Code:** `supabase/functions/items-webhook/index.ts`
2. **Test Fixtures:** `supabase/functions/items-webhook/test-payloads.json`
3. **README:** `supabase/functions/items-webhook/README.md` with:
   - Setup instructions (environment variables)
   - Local testing commands
   - Deployment steps
   - Troubleshooting guide

---

## Success Metrics

- Function deploys without errors
- Handles all 3 event types (create/update/delete) correctly
- Passes idempotency test (send same webhook twice → no duplicate rows)
- Error logging works (force error, verify entry in `webhook_errors`)
- Response time <500ms (check Supabase function logs)
