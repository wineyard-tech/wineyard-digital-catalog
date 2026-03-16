'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogItem } from '../../../../../types/catalog'
import SearchBar from '../../../components/catalog/SearchBar'
import CategoryFilter from '../../../components/catalog/CategoryFilter'
import BrandFilter from '../../../components/catalog/BrandFilter'
import ProductGrid from '../../../components/catalog/ProductGrid'
import OfflineBanner from '../../../components/shared/OfflineBanner'

interface GuestCatalogClientProps {
  initialItems: CatalogItem[]
  initialCategories: string[]
  initialBrands: string[]
}

export default function GuestCatalogClient({
  initialItems,
  initialCategories,
  initialBrands,
}: GuestCatalogClientProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [categories] = useState<string[]>(initialCategories)
  const [brands] = useState<string[]>(initialBrands)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchProducts = useCallback(async (q: string, cat: string | null, br: string | null) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const params = new URLSearchParams({ price_type: 'base' })
      if (q) params.set('q', q)
      if (cat) params.set('category', cat)
      if (br) params.set('brand', br)
      const res = await fetch(`/api/catalog?${params}`, { signal: abortRef.current.signal })
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    fetchProducts(search, category, brand)
  }, [search, category, brand, fetchProducts])

  return (
    <>
      <OfflineBanner />

      {/* Search */}
      <div style={{ background: '#FFFFFF', padding: '10px 0 0', borderBottom: '1px solid #F3F4F6' }}>
        <SearchBar onSearch={setSearch} />
        <CategoryFilter categories={categories} active={category} onSelect={setCategory} />
        <BrandFilter brands={brands} active={brand} onSelect={setBrand} />
      </div>

      {/* GST note for guests */}
      <p style={{ margin: '8px 16px', fontSize: 12, color: '#6B7280' }}>
        Prices + 18% GST applicable
      </p>

      {/* Products (guest mode — cart disabled) */}
      <ProductGrid items={items} loading={loading} guestMode={true} />
    </>
  )
}
