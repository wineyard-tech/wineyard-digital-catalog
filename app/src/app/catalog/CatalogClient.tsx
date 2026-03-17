'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { User, ChevronDown } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import SearchBar from '../../components/catalog/SearchBar'
import ProductGrid from '../../components/catalog/ProductGrid'
import OfflineBanner from '../../components/shared/OfflineBanner'
import { useScrollDirection } from '../../hooks/useScrollDirection'

interface CatalogClientProps {
  contactName: string | null
  initialItems: CatalogItem[]
  initialCategories: string[]
  initialBrands: string[]
}

export default function CatalogClient({
  contactName,
  initialItems,
}: CatalogClientProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const hidden = useScrollDirection()

  // Refs used inside the stable IntersectionObserver callback — avoids stale closures
  // and prevents the observer from disconnecting/reconnecting on every loading state change.
  const isLoadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const pageRef = useRef(1)
  const searchRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchProducts = useCallback(async (q: string, pageNum: number, append: boolean) => {
    if (isLoadingRef.current) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    isLoadingRef.current = true
    setLoading(true)

    try {
      const params = new URLSearchParams({ page: String(pageNum) })
      if (q) params.set('q', q)

      const res = await fetch(`/api/catalog?${params}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) return
      const data = await res.json()
      setItems(prev => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []))
      hasMoreRef.current = data.hasMore ?? false
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Catalog fetch failed', err)
      }
    } finally {
      isLoadingRef.current = false
      setLoading(false)
    }
  }, [])

  // Re-fetch from page 1 when search changes (skip initial render — we have SSR data)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    pageRef.current = 1
    searchRef.current = search
    hasMoreRef.current = true
    fetchProducts(search, 1, false)
  }, [search, fetchProducts])

  // Infinite scroll observer — set up once, reads from refs so it never reconnects.
  // rootMargin of 1200px triggers ~65% through a 30-item page, well before the user
  // reaches the bottom.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingRef.current && hasMoreRef.current) {
          const next = pageRef.current + 1
          pageRef.current = next
          fetchProducts(searchRef.current, next, true)
        }
      },
      { rootMargin: '1200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchProducts])

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 140 }}>
      <OfflineBanner />

      {/* Header */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          maxWidth: 768,
          margin: '0 auto',
          background: '#FFFFFF',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          zIndex: 30,
        }}
      >
        {/* Location row — collapses on scroll-down; search bar always stays visible */}
        <div style={{ overflow: 'hidden', maxHeight: hidden ? 0 : 60, transition: 'max-height 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
            <button
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                padding: 0,
                fontSize: 14,
                fontWeight: 500,
                color: '#1A1A2E',
              }}
            >
              <span>📍</span>
              <span>Himayatnagar Warehouse</span>
              <ChevronDown size={15} color="#6B7280" />
            </button>

            <button
              aria-label={contactName ? `Hi, ${contactName}` : 'Login'}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#E6F0FA',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={18} color="#0066CC" />
            </button>
          </div>
        </div>

        <SearchBar onSearch={setSearch} />
      </header>

      {/* Spacer so content doesn't start under the fixed header */}
      <div style={{ height: 100 }} aria-hidden="true" />

      {/* Products */}
      <div style={{ padding: '12px 12px 0' }}>
        <ProductGrid items={items} loading={loading && items.length === 0} guestMode={false} />
      </div>

      {/* Infinite scroll sentinel — sits at the end of the list */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && items.length > 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#6B7280', fontSize: 14 }}>
          Loading more…
        </div>
      )}
    </div>
  )
}
