'use client'

// PricingContext — client-side cache for pricebook rates.
//
// Loads rate overrides once on mount via /api/pricing-rates, then exposes:
//   getPrice(item)     — returns the effective price (custom_rate or base_rate)
//   rates              — the raw { zoho_item_id: custom_rate } map
//   pricebookId        — the resolved pricebook_id (null = use base_rate)
//   isLoading          — true while the initial fetch is in-flight
//
// This avoids per-component DB queries for pricebook data.
// Rates are loaded once per page session and kept in memory.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import type { CatalogItem } from '@/types/catalog'

type PricingRates = Record<string, number>

interface PricingContextValue {
  rates: PricingRates
  pricebookId: string | null
  isLoading: boolean
  /** Returns the effective price for an item (custom_rate if available, base_rate otherwise). */
  getPrice: (item: Pick<CatalogItem, 'zoho_item_id' | 'base_rate'>) => number
  /** Returns the price_type for an item: 'custom' if overridden, 'base' otherwise. */
  getPriceType: (zoho_item_id: string) => 'custom' | 'base'
}

const PricingContext = createContext<PricingContextValue | null>(null)

interface PricingProviderProps {
  children: ReactNode
  /** Pass the guest token when rendering a guest catalog view. */
  guestToken?: string
}

export function PricingProvider({ children, guestToken }: PricingProviderProps) {
  const [rates, setRates] = useState<PricingRates>({})
  const [pricebookId, setPricebookId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const url = guestToken
      ? `/api/pricing-rates?guest_token=${encodeURIComponent(guestToken)}`
      : '/api/pricing-rates'

    fetch(url, { credentials: 'same-origin' })
      .then(res => res.json())
      .then((data: { rates: PricingRates; pricebook_id: string | null }) => {
        setRates(data.rates ?? {})
        setPricebookId(data.pricebook_id ?? null)
      })
      .catch(() => {
        // Non-fatal: fall back to base_rate for all items
        setRates({})
      })
      .finally(() => setIsLoading(false))
  }, [guestToken])

  const getPrice = useCallback(
    (item: Pick<CatalogItem, 'zoho_item_id' | 'base_rate'>): number => {
      return rates[item.zoho_item_id] ?? item.base_rate
    },
    [rates]
  )

  const getPriceType = useCallback(
    (zoho_item_id: string): 'custom' | 'base' => {
      return zoho_item_id in rates ? 'custom' : 'base'
    },
    [rates]
  )

  return (
    <PricingContext.Provider value={{ rates, pricebookId, isLoading, getPrice, getPriceType }}>
      {children}
    </PricingContext.Provider>
  )
}

export function usePricing(): PricingContextValue {
  const ctx = useContext(PricingContext)
  if (!ctx) throw new Error('usePricing must be used inside PricingProvider')
  return ctx
}
