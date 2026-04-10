'use client'

import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EnquiryResponse } from '@/types/catalog'
import { mergeEnquirySyncPayload } from '@/lib/catalog/merge-enquiry-sync-payload'

interface EstimatePollJson {
  zoho_sync_status?: string
  estimate_number?: string | null
  estimate_url?: string | null
  status?: string
}

/**
 * Subscribes to Realtime broadcast `estimate:{public_id}` and polls GET /api/estimates/[id]
 * until `zoho_sync_status` is no longer PENDING.
 */
export function useEnquirySyncUpdates(
  quoteResult: EnquiryResponse | null,
  setQuoteResult: Dispatch<SetStateAction<EnquiryResponse | null>>
): void {
  useEffect(() => {
    const id = quoteResult?.estimate_id
    if (!id || !quoteResult.sync_pending) return

    const supabase = createClient()
    const channel = supabase
      .channel(`estimate:${id}`)
      .on(
        'broadcast',
        { event: 'sync' },
        ({ payload }: { payload?: Record<string, unknown> }) => {
          if (!payload || typeof payload !== 'object') return
          setQuoteResult((prev) => (prev ? mergeEnquirySyncPayload(prev, payload) : prev))
        }
      )
      .subscribe()

    let ticks = 0
    const maxTicks = 24
    const poll = setInterval(() => {
      ticks++
      if (ticks > maxTicks) {
        clearInterval(poll)
        return
      }
      void (async () => {
        try {
          const r = await fetch(`/api/estimates/${id}`)
          if (!r.ok) return
          const d = (await r.json()) as EstimatePollJson
          if (d.zoho_sync_status && d.zoho_sync_status !== 'PENDING') {
            setQuoteResult((prev) =>
              prev
                ? {
                    ...prev,
                    estimate_number: d.estimate_number ?? prev.estimate_number,
                    estimate_url: d.estimate_url ?? prev.estimate_url,
                    zoho_sync_status: d.zoho_sync_status,
                    sync_pending: false,
                  }
                : prev
            )
            clearInterval(poll)
          }
        } catch {
          /* ignore */
        }
      })()
    }, 3500)

    return () => {
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
    // setQuoteResult is stable from useState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteResult?.estimate_id, quoteResult?.sync_pending])
}
