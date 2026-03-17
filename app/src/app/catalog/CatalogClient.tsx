'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { User, ChevronDown } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import SearchBar from '../../components/catalog/SearchBar'
import ProductGrid from '../../components/catalog/ProductGrid'
import OfflineBanner from '../../components/shared/OfflineBanner'

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
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 120 }}>
      <OfflineBanner />

      {/* Header */}
      <header
        style={{
          background: '#0066CC',
          padding: '14px 16px 12px',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        {/* Top row: location + user icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              padding: 0,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span>📍</span>
            <span>Himayatnagar Warehouse</span>
            <ChevronDown size={16} color="rgba(255,255,255,0.8)" />
          </button>

          <button
            title={contactName ? `Logged in as ${contactName}` : 'Login'}
            aria-label={contactName ? `Logged in as ${contactName}` : 'Login'}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={20} color="#FFFFFF" />
          </button>
        </div>

        {/* Search bar */}
        <div style={{ background: '#FFFFFF', borderRadius: 10, overflow: 'hidden' }}>
          <SearchBar onSearch={setSearch} />
        </div>
      </header>

      {/* Products */}
      <div style={{ padding: '12px 12px 0' }}>
        <ProductGrid items={items} loading={loading} guestMode={false} />
      </div>
    </div>
  )
}
