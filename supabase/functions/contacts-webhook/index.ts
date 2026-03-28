// contacts-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Contact events and syncs
// them to Supabase in real-time. Complements the 4x-daily batch sync
// (sync-contacts) by keeping the contact list current within seconds.
//
// Event routing (single endpoint, all event types):
//   contact_created | contact_updated  →  handleUpsert()  (UPSERT contact + persons; soft-deactivate removed persons)
//   contact_deleted                    →  handleDelete()  (soft-delete: status='inactive', never hard-delete)
//
// Always returns HTTP 200 — even on processing errors — to prevent Zoho
// from re-delivering the same webhook endlessly. Failures are logged to
// the webhook_errors table for async investigation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeIndianPhone, extractPhoneFromContact, describeContactPhones } from '../_shared/phone-normalizer.ts'
import { makeLogger, computeDelta, logEvent } from '../_shared/logger.ts'

const logger = makeLogger('[contacts-webhook]')

// Fields watched for delta logging.
// These are the fields most likely to change and most impactful operationally.
// phone is included explicitly — a phone change is a critical event since it's
// the unique key used to authenticate integrators.
const WATCHED_FIELDS = [
  'status', 'contact_name', 'company_name',
  'pricebook_id', 'phone', 'email',
  'payment_terms', 'payment_terms_label',
  'currency_code', 'contact_type',
  'online_catalogue_access',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZohoContactPerson {
  contact_person_id: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  mobile?: string
  is_primary_contact?: boolean
  communication_preference?: string
}

interface ZohoContactPayload {
  contact_id: string
  contact_name: string
  company_name?: string
  contact_type?: string
  status?: string
  primary_contact_person_id?: string
  price_list_id?: string
  pricebook_id?: string
  mobile?: string
  phone?: string
  email?: string
  billing_address?: Record<string, unknown>
  shipping_address?: Record<string, unknown>
  payment_terms?: number | ''
  payment_terms_label?: string
  currency_id?: string
  currency_code?: string
  custom_fields?: Array<{ api_name?: string; value?: unknown; [key: string]: unknown }>
  contact_persons?: ZohoContactPerson[]
  created_time?: string
  last_modified_time?: string
}

interface ZohoWebhookPayload {
  event_type?: string
  webhook_event?: string
  data?: ZohoContactPayload | Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseEventType(raw: string | undefined): 'created' | 'updated' | 'deleted' | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '_')
  const CREATED = new Set(['contact_created', 'create', 'created'])
  const UPDATED = new Set(['contact_updated', 'update', 'updated', 'upsert'])
  const DELETED = new Set(['contact_deleted', 'delete', 'deleted'])
  if (CREATED.has(lower)) return 'created'
  if (UPDATED.has(lower)) return 'updated'
  if (DELETED.has(lower)) return 'deleted'
  return null
}

async function logError(
  supabase: SupabaseClient,
  opts: { event_type: string; zoho_entity_id?: string; error_message: string; payload: unknown }
): Promise<void> {
  try {
    await supabase.from('webhook_errors').insert({
      webhook_type: 'contacts',
      event_type: opts.event_type,
      zoho_entity_id: opts.zoho_entity_id ?? null,
      error_message: opts.error_message,
      payload: opts.payload,
    })
  } catch (e) {
    logger.error('LOG_ERR', { msg: 'Failed to write to webhook_errors', err: String(e) })
  }
}

// ── Upsert handler (Create + Update) ─────────────────────────────────────────

async function handleUpsert(
  supabase: SupabaseClient,
  contact: ZohoContactPayload,
  eventType: string,
  rawPayload: unknown
): Promise<void> {
  const contactId = contact.contact_id
  if (!contactId) throw new Error('Missing contact_id in payload')
  if (!contact.contact_name) throw new Error('Missing contact_name in payload')

  // ── 1. Phone extraction — log source for debugging ─────────────────────────
  // contacts.phone is UNIQUE and is the key used to look up integrators at login.
  // extractPhoneFromContact cascades through mobile → phone → billing_address →
  // contact_persons. We log which source the phone came from to aid debugging.
  const phoneResult = extractPhoneFromContact(contact)
  if (!phoneResult) {
    const phoneSummary = describeContactPhones(contact)
    logger.warn('PHONE_FAIL', {
      contact_id: contactId,
      contact_name: contact.contact_name,
      reason: 'no valid Indian phone found',
      phone_summary: phoneSummary,
    })
    throw new Error(`No valid Indian phone found for contact "${contact.contact_name}" (${contactId}) — ${phoneSummary}`)
  }
  const { phone, source } = phoneResult
  logger.info('PHONE', { contact_id: contactId, phone, source })

  // ── 2. Resolve pricebook ID ─────────────────────────────────────────────────
  const pricebookId = contact.pricebook_id || contact.price_list_id || null
  logger.info('PRICEBOOK', { contact_id: contactId, pricebook_id: pricebookId ?? 'none' })

  // ── 3. Build contact row ───────────────────────────────────────────────────
  // Extract cf_online_catalogue_access from Zoho custom_fields array
  const cfFields: Array<{ api_name?: string; value?: unknown }> =
    Array.isArray(contact.custom_fields) ? contact.custom_fields : []
  const cfCatalogEntry = cfFields.find(f => f.api_name === 'cf_online_catalogue_access')
  const online_catalogue_access =
    cfCatalogEntry?.value === true || cfCatalogEntry?.value === 'true' || false

  const contactRow = {
    zoho_contact_id:           contactId,
    contact_name:              contact.contact_name,
    company_name:              contact.company_name || null,
    contact_type:              contact.contact_type || 'customer',
    status:                    contact.status ?? 'active',
    primary_contact_person_id: contact.primary_contact_person_id || null,
    pricebook_id:              pricebookId,
    phone,
    email:                     contact.email || null,
    billing_address:           contact.billing_address ?? null,
    shipping_address:          contact.shipping_address ?? null,
    payment_terms:             contact.payment_terms === '' ? null : (contact.payment_terms ?? null),
    payment_terms_label:       contact.payment_terms_label || null,
    currency_id:               contact.currency_id || null,
    currency_code:             contact.currency_code || 'INR',
    custom_fields:             contact.custom_fields ?? [],
    online_catalogue_access,
    created_time:              contact.created_time || null,
    last_modified_time:        contact.last_modified_time || null,
    updated_at:                new Date().toISOString(),
  }

  // ── 4. Delta: fetch existing record and log what changed ───────────────────
  // This is the primary diagnostic for "contact update not reflecting" issues.
  // If DELTA shows changed=0 for an expected update, Zoho sent stale or identical
  // data. If DELTA shows changes but UPSERT_FAIL follows, there's a DB constraint
  // issue (most likely a duplicate phone collision on another contact row).
  const { data: existing } = await supabase
    .from('contacts')
    .select(WATCHED_FIELDS.join(','))
    .eq('zoho_contact_id', contactId)
    .maybeSingle()

  const { op, changed, changedCount } = computeDelta(
    existing as Record<string, unknown> | null,
    contactRow as unknown as Record<string, unknown>,
    WATCHED_FIELDS
  )
  if (op === 'insert') {
    logger.info('DELTA', { contact_id: contactId, op: 'insert', contact_name: contact.contact_name })
  } else if (changedCount === 0) {
    logger.info('DELTA', { contact_id: contactId, op: 'update', changed: 0, note: 'no watched fields changed — Zoho may have sent unchanged data' })
  } else {
    logger.info('DELTA', { contact_id: contactId, op: 'update', changed: changedCount, ...changed })
  }

  // ── 5. Upsert the contact row ──────────────────────────────────────────────
  const { error: contactErr } = await supabase
    .from('contacts')
    .upsert(contactRow, { onConflict: 'zoho_contact_id' })

  if (contactErr) {
    // The most common failure here is a duplicate phone on another contact row.
    // Log the phone to help identify which existing contact collides.
    logger.error('UPSERT_FAIL', {
      contact_id: contactId,
      event: eventType,
      phone,
      err: contactErr.message,
      hint: 'check for duplicate phone on another contacts row',
    })
    await logError(supabase, {
      event_type: eventType,
      zoho_entity_id: contactId,
      error_message: `Contact upsert failed: ${contactErr.message}`,
      payload: rawPayload,
    })
    throw contactErr
  }

  logger.info('UPSERT_OK', { contact_id: contactId, op, phone, pricebook_id: pricebookId ?? 'none' })

  // ── 6. Sync contact persons ─────────────────────────────────────────────────
  // If payload omits contact_persons entirely (Zoho partial updates), skip both
  // upsert and deactivation to avoid incorrectly removing existing persons.
  const persons: ZohoContactPerson[] = contact.contact_persons ?? []
  const personsArrayPresent = Array.isArray(contact.contact_persons)

  if (!personsArrayPresent) {
    logger.info('PERSONS', { contact_id: contactId, note: 'contact_persons absent from payload — skipping persons sync' })
  } else {
    const validPersons = persons.filter((p) => p.contact_person_id)
    const incomingIds  = validPersons.map((p) => p.contact_person_id)

    logger.info('PERSONS', { contact_id: contactId, incoming: validPersons.length, ids: incomingIds })

    // ── a) UPSERT active persons from payload ──────────────────────────────
    if (validPersons.length > 0) {
      const personRows = validPersons.map((p) => ({
        zoho_contact_person_id:   p.contact_person_id,
        zoho_contact_id:          contactId,
        first_name:               p.first_name || null,
        last_name:                p.last_name || null,
        email:                    p.email || null,
        phone:                    normalizeIndianPhone(p.phone),
        mobile:                   normalizeIndianPhone(p.mobile),
        is_primary:               p.is_primary_contact ?? false,
        communication_preference: p.communication_preference ?? null,
        status:                   'active',
        updated_at:               new Date().toISOString(),
      }))

      const { error: upsertErr } = await supabase
        .from('contact_persons')
        .upsert(personRows, { onConflict: 'zoho_contact_person_id' })

      if (upsertErr) {
        logger.warn('PERSONS_UPSERT_WARN', { contact_id: contactId, count: validPersons.length, err: upsertErr.message })
        await logError(supabase, {
          event_type: eventType,
          zoho_entity_id: contactId,
          error_message: `contact_persons upsert failed: ${upsertErr.message}`,
          payload: rawPayload,
        })
      } else {
        logger.info('PERSONS_UPSERT_OK', { contact_id: contactId, upserted: validPersons.length })
      }
    }

    // ── b) Soft-deactivate persons no longer in payload ────────────────────
    let deactivateQuery = supabase
      .from('contact_persons')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('zoho_contact_id', contactId)
      .eq('status', 'active')

    if (incomingIds.length > 0) {
      deactivateQuery = deactivateQuery.not(
        'zoho_contact_person_id', 'in', `(${incomingIds.join(',')})`
      )
    }

    const { error: deactivateErr, count: deactivatedCount } = await deactivateQuery
    if (deactivateErr) {
      logger.warn('PERSONS_DEACTIVATE_WARN', { contact_id: contactId, err: deactivateErr.message })
    } else {
      logger.info('PERSONS_DEACTIVATE_OK', { contact_id: contactId, deactivated: deactivatedCount ?? 0 })
    }
  }

  logger.info('DONE', {
    contact_id: contactId,
    event: eventType,
    op,
    changed: changedCount,
    persons: persons.filter(p => p.contact_person_id).length,
    pricebook_id: pricebookId ?? 'none',
  })

  return { op, changed, changedCount }
}

// ── Delete handler (soft-delete) ─────────────────────────────────────────────

async function handleDelete(
  supabase: SupabaseClient,
  contact: ZohoContactPayload,
  rawPayload: unknown
): Promise<void> {
  const contactId = contact.contact_id
  if (!contactId) throw new Error('Missing contact_id in delete payload')

  logger.info('DELETE', { contact_id: contactId, note: 'soft-deleting contact + persons' })

  const { error: contactErr } = await supabase
    .from('contacts')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('zoho_contact_id', contactId)

  if (contactErr) {
    logger.error('DELETE_FAIL', { contact_id: contactId, err: contactErr.message })
    await logError(supabase, {
      event_type: 'deleted',
      zoho_entity_id: contactId,
      error_message: `Soft-delete failed: ${contactErr.message}`,
      payload: rawPayload,
    })
    throw contactErr
  }

  const { error: personsErr } = await supabase
    .from('contact_persons')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('zoho_contact_id', contactId)

  if (personsErr) {
    logger.warn('PERSONS_DEACTIVATE_WARN', { contact_id: contactId, err: personsErr.message })
  }

  logger.info('DONE', { contact_id: contactId, event: 'deleted', op: 'soft-delete' })
  return { op: 'soft-delete' as const, changed: {}, changedCount: 0 }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const t0 = Date.now()

  // ── Auth ───────────────────────────────────────────────────────────────────
  const expectedToken = Deno.env.get('ZOHO_WEBHOOK_TOKEN_CONTACTS')
  if (!expectedToken) {
    logger.error('AUTH_FAIL', { reason: 'ZOHO_WEBHOOK_TOKEN_CONTACTS env var not set' })
    return new Response('Unauthorized', { status: 401 })
  }

  const receivedToken = req.headers.get('x-zoho-webhook-token')
  if (!receivedToken) {
    logger.warn('AUTH_FAIL', { reason: 'x-zoho-webhook-token header missing' })
    return new Response('Unauthorized', { status: 401 })
  }
  if (receivedToken !== expectedToken) {
    const masked = `${receivedToken.slice(0, 4)}...${receivedToken.slice(-4)}`
    logger.warn('AUTH_FAIL', { reason: 'token mismatch', received_masked: masked, expected_len: expectedToken.length })
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let rawPayload: ZohoWebhookPayload
  try {
    rawPayload = await req.json()
  } catch {
    logger.error('PARSE_FAIL', { reason: 'invalid JSON body' })
    return new Response('OK', { status: 200 })
  }

  const url = new URL(req.url)
  const rawEventType = rawPayload.event_type
    ?? rawPayload.webhook_event
    ?? url.searchParams.get('action')
    ?? undefined
  const eventType = normaliseEventType(rawEventType)

  logger.info('RECV', { event_raw: rawEventType ?? '(none)', event: eventType ?? 'unknown', url: url.pathname + url.search })

  if (!eventType) {
    logger.error('PARSE_FAIL', { reason: `unknown event_type "${rawEventType}"`, hint: 'add ?action=upsert or ?action=delete to the Zoho webhook URL' })
    return new Response('OK', { status: 200 })
  }

  const raw = rawPayload as Record<string, unknown>
  const contact = (raw['contact'] ?? raw['data'] ?? rawPayload) as ZohoContactPayload | undefined
  if (!contact?.contact_id) {
    logger.error('PARSE_FAIL', { reason: 'cannot extract contact_id', payload_keys: Object.keys(raw) })
    return new Response('OK', { status: 200 })
  }

  logger.info('PARSE', {
    contact_id: contact.contact_id,
    event: eventType,
    contact_name: contact.contact_name,
    has_persons: Array.isArray(contact.contact_persons),
    persons_count: contact.contact_persons?.length ?? 'absent',
    last_modified: contact.last_modified_time ?? 'absent',
  })

  // ── Process ────────────────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    const result = eventType === 'deleted'
      ? await handleDelete(supabase, contact, rawPayload)
      : await handleUpsert(supabase, contact, eventType, rawPayload)

    await logEvent({
      supabase,
      webhook_type:   'contacts',
      event_type:     eventType,
      zoho_entity_id: contact.contact_id,
      op:             result.op,
      changed_count:  result.changedCount,
      changed_fields: result.changed,
      status:         'success',
      duration_ms:    logger.elapsed(t0),
    })
  } catch (err) {
    const duration_ms = logger.elapsed(t0)
    logger.error('HANDLER_FAIL', { contact_id: contact.contact_id, event: eventType, err: String(err), duration_ms })
    await logEvent({
      supabase,
      webhook_type:   'contacts',
      event_type:     eventType,
      zoho_entity_id: contact.contact_id,
      op:             null,
      changed_count:  null,
      changed_fields: null,
      status:         'error',
      duration_ms,
    })
  }

  return new Response('OK', { status: 200 })
})
