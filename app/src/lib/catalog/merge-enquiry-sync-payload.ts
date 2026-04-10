import type { EnquiryResponse } from '@/types/catalog'

/** Merges Realtime broadcast payload from sync-estimate-to-zoho into enquiry UI state. */
export function mergeEnquirySyncPayload(
  prev: EnquiryResponse,
  payload: Record<string, unknown>
): EnquiryResponse {
  const zs =
    typeof payload.zoho_sync_status === 'string'
      ? payload.zoho_sync_status
      : (prev.zoho_sync_status ?? 'PENDING')

  const dup = payload.duplicate_of
  const duplicate_of =
    dup !== null &&
    dup !== undefined &&
    typeof dup === 'object' &&
    !Array.isArray(dup) &&
    'public_id' in dup
      ? (() => {
          const o = dup as unknown as Record<string, unknown>
          return {
            public_id: String(o.public_id),
            estimate_number: o.estimate_number != null ? String(o.estimate_number) : null,
            estimate_url: o.estimate_url != null ? String(o.estimate_url) : null,
            zoho_estimate_id: o.zoho_estimate_id != null ? String(o.zoho_estimate_id) : null,
          }
        })()
      : prev.duplicate_of

  return {
    ...prev,
    estimate_number:
      payload.estimate_number !== undefined
        ? (payload.estimate_number as string | null)
        : prev.estimate_number,
    estimate_url:
      payload.estimate_url !== undefined
        ? (payload.estimate_url as string | null)
        : prev.estimate_url,
    zoho_sync_status: zs,
    sync_pending: zs === 'PENDING',
    duplicate_of,
  }
}
