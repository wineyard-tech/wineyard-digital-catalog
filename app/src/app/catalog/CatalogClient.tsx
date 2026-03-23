'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, ChevronDown, X, LogOut, ClipboardList } from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
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
  const router = useRouter()
  const [locationArea, setLocationArea] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Read wl cookie on mount (client-side only)
  useEffect(() => {
    try {
      const match = document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('wl='))
      if (match) {
        const data = JSON.parse(decodeURIComponent(match.slice(3)))
        setLocationArea(data.area || data.city || null)
      }
    } catch {
      // cookie malformed — ignore
    }
  }, [])

  function handleLogout() {
    setLoggingOut(true)
    fetch('/api/auth/logout', { method: 'POST' })
      .finally(() => router.push('/auth/login'))
  }

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
              onClick={() => router.push('/location')}
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
              <span>{locationArea ?? 'Set location'}</span>
              <ChevronDown size={15} color="#6B7280" />
            </button>

            <button
              onClick={() => {
                if (contactName) {
                  setSheetOpen(true)
                } else {
                  router.push('/auth/login')
                }
              }}
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

      {/* User bottom sheet — authenticated only */}
      {sheetOpen && (
        <>
          {/* Backdrop — z=45 sits above header(30), CartBar(39), BottomTabs(40) */}
          <div
            onClick={() => setSheetOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 45,
            }}
          />
          {/* Sheet — z=46 sits above backdrop */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxWidth: 768,
              margin: '0 auto',
              background: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: '20px 20px 36px',
              zIndex: 46,
              boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
            }}
          >
            {/* Handle + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ width: 40, height: 4, background: '#E2E8F0', borderRadius: 2, margin: '0 auto' }} />
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="#94A3B8" aria-hidden="true" />
              </button>
            </div>

            {/* Greeting */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#E6F0FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={20} color="#0066CC" aria-hidden="true" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                  Hi, {contactName}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Registered customer</p>
              </div>
            </div>

            {/* My Orders */}
            <button
              onClick={() => { setSheetOpen(false); router.push('/catalog/orders') }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 0',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
                fontSize: 15,
                color: '#0F172A',
                fontWeight: 500,
              }}
            >
              <ClipboardList size={18} color="#0066CC" aria-hidden="true" />
              My Orders
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 0',
                background: 'none',
                border: 'none',
                cursor: loggingOut ? 'not-allowed' : 'pointer',
                fontSize: 15,
                color: loggingOut ? '#94A3B8' : '#DC2626',
                fontWeight: 500,
              }}
            >
              <LogOut size={18} color={loggingOut ? '#94A3B8' : '#DC2626'} aria-hidden="true" />
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
