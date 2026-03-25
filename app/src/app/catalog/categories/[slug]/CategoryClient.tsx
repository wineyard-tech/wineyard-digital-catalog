'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import ProductGrid from '@/components/catalog/ProductGrid'

interface CategoryClientProps {
  categoryName: string
  contactName: string | null
  initialItems: CatalogItem[]
}

export default function CategoryClient({ categoryName, initialItems }: CategoryClientProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const isLoadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchMore = useCallback(async (pageNum: number) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), category: categoryName })
      const res = await fetch(`/api/catalog?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setItems(prev => [...prev, ...(data.items ?? [])])
      hasMoreRef.current = data.hasMore ?? false
    } catch (err) {
      console.error('Category fetch failed', err)
    } finally {
      isLoadingRef.current = false
      setLoading(false)
    }
  }, [categoryName])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingRef.current && hasMoreRef.current) {
          const next = pageRef.current + 1
          pageRef.current = next
          fetchMore(next)
        }
      },
      { rootMargin: '1200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchMore])

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 140 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          <button
            onClick={() => router.back()}
            aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={22} color="#0F172A" aria-hidden="true" />
          </button>
          <h1
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: '#0F172A',
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {categoryName}
          </h1>
        </div>
      </header>

      <div style={{ height: 54 }} aria-hidden="true" />

      <div style={{ padding: '12px 12px 0' }}>
        <ProductGrid items={items} loading={loading && items.length === 0} guestMode={false} />
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && items.length > 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#6B7280', fontSize: 14 }}>
          Loading more…
        </div>
      )}
    </div>
  )
}
