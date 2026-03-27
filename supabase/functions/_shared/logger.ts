// _shared/logger.ts — Structured logging utilities for webhook Edge Functions.
//
// All webhook handlers import makeLogger + computeDelta from here so that
// log format is consistent across handlers and easy to grep in Supabase logs.
//
// Log line format:
//   [tag] STAGE | key=val key=val ...
//
// Example:
//   [contacts-webhook] DELTA | contact_id="123" op=update changed=2 pricebook_id={"from":"OLD","to":"NEW"}

// ── Logger factory ────────────────────────────────────────────────────────────

export interface WebhookLogger {
  info:    (stage: string, data?: Record<string, unknown>) => void
  warn:    (stage: string, data?: Record<string, unknown>) => void
  error:   (stage: string, data?: Record<string, unknown>) => void
  elapsed: (t0: number) => number
}

export function makeLogger(tag: string): WebhookLogger {
  function fmt(data: Record<string, unknown>): string {
    const parts = Object.entries(data).map(([k, v]) =>
      typeof v === 'object' && v !== null ? `${k}=${JSON.stringify(v)}` : `${k}=${v}`
    )
    return parts.length ? ' | ' + parts.join(' ') : ''
  }

  return {
    info:    (stage, data = {}) => console.log(`${tag} ${stage}${fmt(data)}`),
    warn:    (stage, data = {}) => console.warn(`${tag} ${stage}${fmt(data)}`),
    error:   (stage, data = {}) => console.error(`${tag} ${stage}${fmt(data)}`),
    elapsed: (t0: number) => Date.now() - t0,
  }
}

// ── Webhook event persistence ─────────────────────────────────────────────────

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface WebhookEventOpts {
  supabase:       SupabaseClient
  webhook_type:   string
  event_type:     string
  zoho_entity_id: string | null
  op:             'insert' | 'update' | 'soft-delete' | null
  changed_count:  number | null
  changed_fields: Record<string, { from: unknown; to: unknown }> | null
  status:         'success' | 'error'
  error_ref?:     number | null
  duration_ms:    number
}

/**
 * Persist a webhook event row to webhook_events for long-term queryability.
 * Never throws — a failure here must not affect the main handler response.
 */
export async function logEvent(opts: WebhookEventOpts): Promise<void> {
  try {
    await opts.supabase.from('webhook_events').insert({
      webhook_type:   opts.webhook_type,
      event_type:     opts.event_type,
      zoho_entity_id: opts.zoho_entity_id,
      op:             opts.op,
      changed_count:  opts.changed_count,
      changed_fields: opts.changed_fields && Object.keys(opts.changed_fields).length > 0
        ? opts.changed_fields
        : null,
      status:         opts.status,
      error_ref:      opts.error_ref ?? null,
      duration_ms:    opts.duration_ms,
    })
  } catch (e) {
    // Log to function output but never propagate — event persistence is best-effort
    console.error(`[logger] logEvent failed: ${String(e)}`)
  }
}

// ── Delta computation ─────────────────────────────────────────────────────────

export interface DeltaResult {
  op:           'insert' | 'update'
  changed:      Record<string, { from: unknown; to: unknown }>
  changedCount: number
}

/**
 * Compare watched fields between the existing DB record and the incoming payload.
 * Returns op='insert' if no existing record, otherwise op='update' with a diff of
 * every watched field whose value differs (JSON-equality, null-safe).
 *
 * Pass only the fields you care about to keep log lines compact.
 */
export function computeDelta(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  watchedFields: string[]
): DeltaResult {
  if (!existing) return { op: 'insert', changed: {}, changedCount: 0 }

  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of watchedFields) {
    const from = existing[field] ?? null
    const to   = incoming[field] ?? null
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changed[field] = { from, to }
    }
  }
  return { op: 'update', changed, changedCount: Object.keys(changed).length }
}
