'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogItem } from '../../../../types/catalog'
import SearchBar from '../../components/catalog/SearchBar'
import CategoryFilter from '../../components/catalog/CategoryFilter'
import BrandFilter from '../../components/catalog/BrandFilter'
import ProductGrid from '../../components/catalog/ProductGrid'
import CartBar from '../../components/cart/CartBar'
import OfflineBanner from '../../components/shared/OfflineBanner'

interface CatalogClientProps {
  sessionToken: string
  contactName: string
  initialItems: CatalogItem[]
  initialCategories: string[]
  initialBrands: string[]
}

export default function CatalogClient({
  contactName,
  initialItems,
  initialCategories,
  initialBrands,
}: CatalogClientProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [brands, setBrands] = useState<string[]>(initialBrands)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchProducts = useCallback(
    async (q: string, cat: string | null, br: string | null) => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      setLoading(true)

      try {
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (cat) params.set('category', cat)
        if (br) params.set('brand', br)

        const res = await fetch(`/api/catalog?${params}`, {
          signal: abortRef.current.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        setItems(data.items ?? [])
        if (data.categories?.length) setCategories(data.categories)
        if (data.brands?.length) setBrands(data.brands)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Catalog fetch failed', err)
        }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Re-fetch when filters change (skip initial render — we have SSR data)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    fetchProducts(search, category, brand)
  }, [search, category, brand, fetchProducts])

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 80 }}>
      <OfflineBanner />

      {/* Header */}
      <header
        style={{
          background: '#0066CC',
          padding: '16px 16px 12px',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>WineYard Catalog</h1>
            {contactName && (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Hi, {contactName}</p>
            )}
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                borderRadius: 8,
                color: '#FFFFFF',
                fontSize: 12,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </form>
        </div>
        <div style={{ background: '#FFFFFF', borderRadius: 10, overflow: 'hidden' }}>
          <SearchBar onSearch={setSearch} />
        </div>
      </header>

      {/* Filters */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #F3F4F6', paddingTop: 10 }}>
        <CategoryFilter categories={categories} active={category} onSelect={setCategory} />
        <BrandFilter brands={brands} active={brand} onSelect={setBrand} />
      </div>

      {/* Products */}
      <div style={{ paddingTop: 12 }}>
        <ProductGrid items={items} loading={loading} guestMode={false} />
      </div>

      {/* Sticky cart bar */}
      <CartBar />
    </div>
  )
}
