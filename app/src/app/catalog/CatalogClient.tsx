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
  const abortRef = useRef<AbortController | null>(null)
  const hidden = useScrollDirection()

  const fetchProducts = useCallback(async (q: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)

    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)

      const res = await fetch(`/api/catalog?${params}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Catalog fetch failed', err)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch when search changes (skip initial render — we have SSR data)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    fetchProducts(search)
  }, [search, fetchProducts])

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
          transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Location row */}
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

        <SearchBar onSearch={setSearch} />
      </header>

      {/* Spacer so content doesn't start under the fixed header */}
      <div style={{ height: 100 }} aria-hidden="true" />

      {/* Products */}
      <div style={{ padding: '12px 12px 0' }}>
        <ProductGrid items={items} loading={loading} guestMode={false} />
      </div>
    </div>
  )
}
