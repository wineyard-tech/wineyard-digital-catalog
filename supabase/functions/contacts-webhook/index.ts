// contacts-webhook — Supabase Edge Function (Deno runtime)
//
// Receives Zoho Books webhook notifications for Contact events and syncs
// them to Supabase in real-time. Complements the 4x-daily batch sync
// (sync-contacts) by keeping the contact list current within seconds.
//
// Event routing (single endpoint, all event types):
//   contact_created | contact_updated  →  handleUpsert()
//   contact_deleted                    →  handleDelete()
//
// Always returns HTTP 200 — even on processing errors — to prevent Zoho
// from re-delivering the same webhook endlessly. Failures are logged to
// the webhook_errors table for async investigation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeIndianPhone, extractPhoneFromContact } from '../_shared/phone-normalizer.ts'

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
  // Zoho uses either price_list_id or pricebook_id depending on the API version
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
  custom_fields?: Record<string, unknown>
  contact_persons?: ZohoContactPerson[]
  created_time?: string
  last_modified_time?: string
}

// Zoho sends either "contact_created"/"contact_updated"/"contact_deleted" (snake_case)
// or "Create"/"Update"/"Delete" depending on webhook version — handle both.
interface ZohoWebhookPayload {
  event_type?: string    // "contact_created" | "contact_updated" | "contact_deleted"
  webhook_event?: string // "Create" | "Update" | "Delete" (older format)
  data?: ZohoContactPayload | Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise Zoho's event_type to one of: 'created' | 'updated' | 'deleted' | null.
 * Zoho may send: "contact_created", "contact.created", "Create", "Update", "Delete", etc.
 * Uses an exact allow-list rather than substring match to avoid misrouting future
 * Zoho event types (e.g., "contact_reactivated" would otherwise match 'created').
 */
function normaliseEventType(raw: string | undefined): 'created' | 'updated' | 'deleted' | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/[^a-z]/g, '_')
  const CREATED = new Set(['contact_created', 'create', 'created'])
  const UPDATED = new Set(['contact_updated', 'update', 'updated'])
  const DELETED = new Set(['contact_deleted', 'delete', 'deleted'])
  if (CREATED.has(lower)) return 'created'
  if (UPDATED.has(lower)) return 'updated'
  if (DELETED.has(lower)) return 'deleted'
  return null
}

/** Log a processing failure to webhook_errors. Never throws. */
async function logError(
  supabase: SupabaseClient,
  opts: {
    event_type: string
    zoho_entity_id?: string
    error_message: string
    payload: unknown
  }
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
    console.error('[contacts-webhook] Failed to log webhook error:', e)
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

  // ── 1. Resolve phone ────────────────────────────────────────────────────────
  // contacts.phone is UNIQUE — it's the key used to look up integrators at login.
  // extractPhoneFromContact cascades through mobile → phone → billing_address.phone
  // → contact_persons in priority order.
  const phone = extractPhoneFromContact(contact)
  if (!phone) {
    throw new Error(`No valid Indian phone found for contact "${contact.contact_name}" (${contactId})`)
  }

  // ── 2. Map pricebook ID ─────────────────────────────────────────────────────
  // Older Zoho API sends price_list_id; newer sends pricebook_id. Accept either.
  const pricebookId = contact.pricebook_id || contact.price_list_id || null

  // ── 3. Upsert the contact row ───────────────────────────────────────────────
  // Field mapping mirrors sync-contacts/index.ts for consistency between the
  // real-time and batch sync paths.
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
    custom_fields:             contact.custom_fields ?? {},
    created_time:              contact.created_time || null,
    last_modified_time:        contact.last_modified_time || null,
    updated_at:                new Date().toISOString(),
  }

  const { error: contactErr } = await supabase
    .from('contacts')
    .upsert(contactRow, { onConflict: 'zoho_contact_id' })

  if (contactErr) {
    await logError(supabase, {
      event_type: eventType,
      zoho_entity_id: contactId,
      error_message: `Contact upsert failed: ${contactErr.message}`,
      payload: rawPayload,
    })
    throw contactErr
  }

  // ── 4. Sync contact persons ─────────────────────────────────────────────────
  // Delete-then-insert (not UPSERT) so removed persons are cleaned up.
  // A partial update would leave stale rows for persons no longer on the contact.
  // The contact row exists at this point so FK constraint is satisfied.
  const persons: ZohoContactPerson[] = contact.contact_persons ?? []

  // Always run delete-then-insert when persons are present in the payload.
  // If no persons array is sent, skip to avoid wiping existing persons on a
  // partial-field update (some Zoho events omit child arrays).
  if (persons.length > 0) {
    const { error: delErr } = await supabase
      .from('contact_persons')
      .delete()
      .eq('zoho_contact_id', contactId)

    if (delErr) {
      console.warn(`[contacts-webhook] contact_persons delete warning (${contactId}):`, delErr.message)
    }

    const personRows = persons
      .filter((p) => p.contact_person_id)
      .map((p) => ({
        zoho_contact_person_id: p.contact_person_id,
        zoho_contact_id:        contactId,
        first_name:             p.first_name || null,
        last_name:              p.last_name || null,
        email:                  p.email || null,
        phone:                  normalizeIndianPhone(p.phone),
        mobile:                 normalizeIndianPhone(p.mobile),
        is_primary:             p.is_primary_contact ?? false,
        // communication_preference may be a string or JSON object in Zoho
        communication_preference: p.communication_preference ?? null,
      }))

    if (personRows.length > 0) {
      const { error: personsErr } = await supabase
        .from('contact_persons')
        .insert(personRows)

      if (personsErr) {
        // Non-fatal: contact is already saved; log but don't fail the whole request
        console.warn(`[contacts-webhook] contact_persons insert warning (${contactId}):`, personsErr.message)
        await logError(supabase, {
          event_type: eventType,
          zoho_entity_id: contactId,
          error_message: `contact_persons insert failed: ${personsErr.message}`,
          payload: rawPayload,
        })
      }
    }
  }

  console.log(
    `[contacts-webhook] ${eventType} OK — contact_id=${contactId}, persons=${persons.length}, pricebook=${pricebookId ?? 'none'}`
  )
}

// ── Delete handler ────────────────────────────────────────────────────────────

async function handleDelete(
  supabase: SupabaseClient,
  contact: ZohoContactPayload,
  rawPayload: unknown
): Promise<void> {
  const contactId = contact.contact_id
  if (!contactId) throw new Error('Missing contact_id in delete payload')

  // CASCADE on contact_persons means child rows are auto-deleted when the contact row goes.
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('zoho_contact_id', contactId)

  if (error) {
    await logError(supabase, {
      event_type: 'deleted',
      zoho_entity_id: contactId,
      error_message: `Delete failed: ${error.message}`,
      payload: rawPayload,
    })
    throw error
  }

  console.log(`[contacts-webhook] deleted OK — contact_id=${contactId}`)
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const expectedToken = Deno.env.get('ZOHO_WEBHOOK_TOKEN_CONTACTS')
  if (!expectedToken) {
    // Misconfigured deployment — log clearly so ops can diagnose, still reject
    console.error('[contacts-webhook] ZOHO_WEBHOOK_TOKEN_CONTACTS env var is not set')
    return new Response('Unauthorized', { status: 401 })
  }

  const receivedToken = req.headers.get('x-zoho-webhook-token')
  if (!receivedToken) {
    console.warn('[contacts-webhook] 401 — x-zoho-webhook-token header is MISSING from request. Zoho custom header not configured.')
    return new Response('Unauthorized', { status: 401 })
  }
  if (receivedToken !== expectedToken) {
    // Log first/last 4 chars of received token to diagnose mismatch without exposing full secret
    const masked = `${receivedToken.slice(0, 4)}...${receivedToken.slice(-4)}`
    console.warn(`[contacts-webhook] 401 — token MISMATCH. Received: "${masked}" (len=${receivedToken.length}), Expected len=${expectedToken.length}`)
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let rawPayload: ZohoWebhookPayload
  try {
    rawPayload = await req.json()
  } catch {
    console.error('[contacts-webhook] Failed to parse JSON body')
    // Malformed body — return 200 anyway (Zoho should not retry parse failures)
    return new Response('OK', { status: 200 })
  }

  // Resolve event type from either field Zoho might send
  const rawEventType = rawPayload.event_type ?? rawPayload.webhook_event
  const eventType = normaliseEventType(rawEventType)

  if (!eventType) {
    console.error(`[contacts-webhook] Unknown event_type: "${rawEventType}"`)
    return new Response('OK', { status: 200 })
  }

  // Zoho normally embeds the contact under rawPayload.data, but some webhook
  // versions send the contact at the top level (rawPayload.contact_id directly).
  // Fall back to the top-level payload shape if .data is absent.
  const contact = (rawPayload.data ?? rawPayload) as ZohoContactPayload | undefined
  if (!contact?.contact_id) {
    console.error('[contacts-webhook] Cannot extract contact_id from payload:', JSON.stringify(rawPayload))
    return new Response('OK', { status: 200 })
  }

  console.log(`[contacts-webhook] Received event="${eventType}" contact_id="${contact.contact_id}"`)

  // ── Process ────────────────────────────────────────────────────────────────
  // Create a fresh client per request — Edge Functions are stateless and
  // reusing a module-level singleton risks cross-request token contamination.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    if (eventType === 'deleted') {
      await handleDelete(supabase, contact, rawPayload)
    } else {
      // 'created' or 'updated' — same upsert path
      await handleUpsert(supabase, contact, eventType, rawPayload)
    }
  } catch (err) {
    // Error already logged inside handlers; return 200 to stop Zoho retries.
    console.error(`[contacts-webhook] Processing error (${eventType}):`, err)
  }

  return new Response('OK', { status: 200 })
})
