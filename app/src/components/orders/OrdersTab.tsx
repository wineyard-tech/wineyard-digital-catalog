'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { ClipboardList } from 'lucide-react'
import { TransactionCard } from './TransactionCard'
import { OrderRowSkeleton } from './OrderRowSkeleton'
import type { TransactionListItem } from '@/types/catalog'

function Spinner() {
  return (
    <>
      <span style={{
        width: 24, height: 24,
        border: '3px solid #059669', borderTopColor: 'transparent',
        borderRadius: '50%', display: 'inline-block',
        animation: 'spin 0.6s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', padding: '40px 16px', textAlign: 'center' }}>
      <ClipboardList size={48} color="#D1D5DB" strokeWidth={1.5} style={{ marginBottom: 16 }} />
      {children}
    </div>
  )
}

export function OrdersTab() {
  const [items, setItems] = useState<TransactionListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [initialDone, setInitialDone] = useState(false)

  // Refs to avoid stale closures in IntersectionObserver
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const offsetRef = useRef(0)

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const fetchPage = useCallback(async (pageOffset: number) => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders?offset=${pageOffset}`)
      if (res.status === 403) throw new Error('Please log in to view your orders.')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems((prev) => {
        const incoming: TransactionListItem[] = pageOffset === 0 ? data.items : [...prev, ...data.items]
        return incoming.filter((i) => i.kind === 'invoice')
      })
      hasMoreRef.current = data.has_more
      setHasMore(data.has_more)
      offsetRef.current = data.next_offset
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      loadingRef.current = false
      setLoading(false)
      setInitialDone(true)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchPage(0)
  }, [fetchPage])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && hasMoreRef.current) {
          fetchPage(offsetRef.current)
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchPage])

  if (!initialDone && loading) {
    return <OrderRowSkeleton count={4} />
  }

  if (error && items.length === 0) {
    return (
      <EmptyState>
        <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>{error}</p>
      </EmptyState>
    )
  }

  if (initialDone && items.length === 0 && !hasMore) {
    return (
      <EmptyState>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A2E', margin: '0 0 6px' }}>No invoices yet</p>
        <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Your invoices will appear here.</p>
      </EmptyState>
    )
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <TransactionCard key={`${item.kind}-${item.id}`} item={item} />
      ))}

      {/* Load-more sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Spinner />
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>
          All invoices loaded
        </p>
      )}
    </div>
  )
}
