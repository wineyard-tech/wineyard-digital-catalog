'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useCart } from './CartContext'
import ProductCard from '../catalog/ProductCard'
import type { CatalogItem } from '@/types/catalog'

const DISMISS_KEY = 'cart_rec_dismissed'

/**
 * "Complete your Order" — horizontal recommendation strip shown between the
 * cart item list and the Bill Details section.
 *
 * Behaviour:
 *  - Fetches up to 4 suggestions from /api/recommendations based on cart IDs.
 *  - When a suggested item is added to cart, it disappears from the strip.
 *  - The strip hides when all suggestions are added/dismissed or dismissed via X.
 *  - Dismiss state is persisted in sessionStorage for the current cart session.
 */
export default function CompleteYourOrder() {
  const { items } = useCart()
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // Track the last cart key we fetched for — only refetch when cart composition changes
  const fetchedForRef = useRef<string>('')

  // Read dismiss state from sessionStorage on mount
  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true)
    }
  }, [])

  // Fetch recommendations when cart changes (but not on every re-render)
  useEffect(() => {
    if (dismissed || items.length === 0) return

    const cartKey = items
      .map((i) => i.zoho_item_id)
      .sort()
      .join(',')

    if (cartKey === fetchedForRef.current) return
    fetchedForRef.current = cartKey

    setLoading(true)
    fetch(`/api/recommendations?ids=${encodeURIComponent(cartKey)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: CatalogItem[] }) => {
        // Filter out anything already in cart at response time
        const currentCartIds = new Set(items.map((i) => i.zoho_item_id))
        setSuggestions(
          (data.items ?? []).filter((s) => !currentCartIds.has(s.zoho_item_id))
        )
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false))
  }, [items, dismissed])

  // Remove items from the strip as they're added to cart
  useEffect(() => {
    const cartIds = new Set(items.map((i) => i.zoho_item_id))
    setSuggestions((prev) => prev.filter((s) => !cartIds.has(s.zoho_item_id)))
  }, [items])

  function handleDismiss() {
    setDismissed(true)
    sessionStorage.setItem(DISMISS_KEY, '1')
  }

  // Hide section entirely: dismissed, empty cart, no suggestions (and not loading)
  if (dismissed || items.length === 0) return null
  if (!loading && suggestions.length === 0) return null

  return (
    <div style={{ background: '#FFFFFF', marginBottom: 8 }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px 6px',
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>
          Complete your Order
        </p>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss recommendations"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            color: '#9CA3AF',
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Horizontal card strip */}
      <div
        className="rec-scroll"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '4px 16px 14px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        } as React.CSSProperties}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 140,
                  height: 200,
                  background: '#F3F4F6',
                  borderRadius: 8,
                  flexShrink: 0,
                  animation: 'rec-pulse 1.5s ease-in-out infinite',
                }}
              />
            ))
          : suggestions.map((item) => (
              <div key={item.zoho_item_id} style={{ width: 140, flexShrink: 0 }}>
                <ProductCard item={item} />
              </div>
            ))}
      </div>

      <style>{`
        .rec-scroll::-webkit-scrollbar { display: none; }
        @keyframes rec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </div>
  )
}
