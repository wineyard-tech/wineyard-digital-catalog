'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, MapPin, ChevronDown, ArrowLeft, LogOut, Clock, TrendingUp } from 'lucide-react'
import SearchBar from '@/components/catalog/SearchBar'
import ProductCard from '@/components/catalog/ProductCard'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useAuth } from '@/hooks/useAuth'
import type { CatalogItem } from '@/types/catalog'
import type { PurchasedProduct } from '@/app/api/buy-again/route'

// ── Sort toggle ───────────────────────────────────────────────────────────────

type SortMode = 'recent' | 'popular'

function SortButton({
  mode, label, Icon, current, onSelect,
}: {
  mode: SortMode
  label: string
  Icon: React.ComponentType<{ size: number }>
  current: SortMode
  onSelect: (m: SortMode) => void
}) {
  const active = current === mode
  return (
    <button
      onClick={() => onSelect(mode)}
      style={{
        padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 20,
        border: `1.5px solid ${active ? '#059669' : '#E5E7EB'}`,
        background: active ? '#ECFDF5' : '#FFFFFF',
        color: active ? '#059669' : '#6B7280',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={11} />
      {label}
    </button>
  )
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function groupByCategory(
  products: PurchasedProduct[],
  categoryOrder: Map<string, number>,
): { category: string; items: PurchasedProduct[] }[] {
  const map = new Map<string, PurchasedProduct[]>()
  for (const p of products) {
    const cat = p.category_name ?? 'Other'
    const existing = map.get(cat)
    if (existing) {
      existing.push(p)
    } else {
      map.set(cat, [p])
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (categoryOrder.get(a) ?? 999) - (categoryOrder.get(b) ?? 999))
    .map(([category, items]) => ({ category, items }))
}

function applySortMode(products: PurchasedProduct[], mode: SortMode): PurchasedProduct[] {
  return [...products].sort((a, b) =>
    mode === 'recent'
      ? b.last_purchased_at.localeCompare(a.last_purchased_at)
      : b.total_qty - a.total_qty,
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuyAgainPage() {
  const router = useRouter()
  const hidden = useScrollDirection()
  const { user, isAuthenticated, loading: authLoading } = useAuth()

  // Location area from wl cookie (same as CatalogClient)
  const [locationArea, setLocationArea] = useState<string | null>(null)
  useEffect(() => {
    try {
      const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('wl='))
      if (match) {
        const data = JSON.parse(decodeURIComponent(match.slice(3)))
        setLocationArea(data.area || data.city || null)
      }
    } catch { /* ignore malformed cookie */ }
  }, [])

  // Profile sheet (mirrors CatalogClient)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  function handleLogout() {
    setLoggingOut(true)
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.push('/auth/login'))
  }

  // Category display_order lookup
  const [categoryOrder, setCategoryOrder] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then((d: { categories: { category_name: string; display_order: number }[] }) => {
        const m = new Map<string, number>()
        for (const c of d.categories ?? []) m.set(c.category_name, c.display_order)
        setCategoryOrder(m)
      })
      .catch(() => {})
  }, [])

  // Buy-again data
  const [products, setProducts] = useState<PurchasedProduct[]>([])
  const [hasOrders, setHasOrders] = useState(false)
  const [unauthenticated, setUnauthenticated] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [searchQuery, setSearchQuery] = useState('')

  // Bestsellers (always shown in the empty/guest state)
  const [bestsellers, setBestsellers] = useState<CatalogItem[]>([])

  const fetchData = useCallback(async () => {
    const [orderRes, bestRes] = await Promise.allSettled([
      fetch('/api/buy-again'),
      fetch('/api/bestsellers'),
    ])

    // Bestsellers (public — always available)
    if (bestRes.status === 'fulfilled' && bestRes.value.ok) {
      const bd = await bestRes.value.json() as { items: CatalogItem[] }
      setBestsellers(bd.items ?? [])
    }

    // Order history
    if (orderRes.status === 'fulfilled') {
      const r = orderRes.value
      if (r.status === 403) {
        setUnauthenticated(true)
      } else if (r.ok) {
        const od = await r.json() as { has_orders: boolean; products: PurchasedProduct[] }
        setHasOrders(od.has_orders)
        if (od.has_orders) setProducts(od.products)
      }
    }

    setDataLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Local search filter ──────────────────────────────────────────────────────
  function matchesQuery(q: string, ...fields: (string | undefined | null)[]) {
    const lower = q.toLowerCase()
    return fields.some(f => f?.toLowerCase().includes(lower))
  }
  const trimmedQuery = searchQuery.trim()
  const displayProducts = trimmedQuery
    ? products.filter(p => matchesQuery(trimmedQuery, p.item_name, p.sku, p.brand, p.category_name))
    : products
  const displayBestsellers = trimmedQuery
    ? bestsellers.filter(b => matchesQuery(trimmedQuery, b.item_name, b.sku, b.brand, b.category_name))
    : bestsellers

  // ── Sticky catalog-style header ─────────────────────────────────────────────
  const header = (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        maxWidth: 768, margin: '0 auto',
        background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        zIndex: 30,
      }}
    >
      {/* Location row — collapses on scroll-down */}
      <div style={{ overflow: 'hidden', maxHeight: hidden ? 0 : 60, transition: 'max-height 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
          <button
            onClick={() => router.push('/location?from=catalog')}
            style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 500, color: '#1A1A2E' }}
          >
            <MapPin size={15} color="#0066CC" aria-hidden="true" />
            <span>{locationArea ?? 'Set location'}</span>
            <ChevronDown size={15} color="#6B7280" />
          </button>

          <button
            onClick={() => isAuthenticated ? setSheetOpen(true) : router.push('/auth/login?from=catalog')}
            aria-label={isAuthenticated ? `Hi, ${user?.contact_name}` : 'Login'}
            style={{ width: 34, height: 34, borderRadius: '50%', background: '#E6F0FA', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <User size={18} color="#0066CC" />
          </button>
        </div>
      </div>

      {/* Search — filters within this tab */}
      <SearchBar
        onSearch={setSearchQuery}
        defaultValue={searchQuery}
      />
    </header>
  )

  // ── Empty / unauthenticated state ──────────────────────────────────────────
  const showEmptyState = unauthenticated || (!dataLoading && !hasOrders)

  if (showEmptyState || dataLoading) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 140 }}>
        {header}
        <div style={{ height: 100 }} aria-hidden="true" />

        {/* Loading skeleton */}
        {dataLoading && (
          <div style={{ paddingTop: 12 }}>
            <LoadingSkeleton count={6} />
          </div>
        )}

        {/* Banner */}
        {!dataLoading && (
          <div
            style={{
              margin: '12px 12px 0',
              background: '#ECFDF5',
              borderRadius: 16,
              padding: '28px 20px 24px',
              textAlign: 'center',
            }}
          >
            {/* Simple shopping-bag illustration using emoji + lucide layering */}
            <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 12 }}>🛍️</div>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#1A1A2E' }}>
              Reordering will be easy
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#6B7280', maxWidth: 260, marginInline: 'auto' }}>
              Items you order will show up here so you can buy them again easily
            </p>
          </div>
        )}

        {/* Bestsellers grid */}
        {!dataLoading && displayBestsellers.length > 0 && (
          <div style={{ padding: '20px 12px 0' }}>
            <p style={{ margin: '0 0 12px 4px', fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
              {trimmedQuery ? 'Matching products' : 'Bestsellers'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {displayBestsellers.map((item) => (
                <ProductCard key={item.zoho_item_id} item={item} />
              ))}
            </div>
          </div>
        )}
        {!dataLoading && trimmedQuery && displayBestsellers.length === 0 && (
          <p style={{ padding: '32px 16px', textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
            No matching products
          </p>
        )}

        {/* Profile sheet */}
        {sheetOpen && <ProfileSheet name={user?.contact_name ?? ''} loggingOut={loggingOut} onClose={() => setSheetOpen(false)} onLogout={handleLogout} />}
      </div>
    )
  }

  // ── Has orders — grouped by category with sort toggle ──────────────────────
  const groups = groupByCategory(applySortMode(displayProducts, sortMode), categoryOrder)

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: 140 }}>
      {header}
      <div style={{ height: 100 }} aria-hidden="true" />

      {/* Sort bar */}
      <div style={{ padding: '20px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <SortButton mode="recent" label="Recent" Icon={Clock} current={sortMode} onSelect={setSortMode} />
        <SortButton mode="popular" label="Most Ordered" Icon={TrendingUp} current={sortMode} onSelect={setSortMode} />
      </div>

      {/* No results when searching */}
      {trimmedQuery && groups.length === 0 && (
        <p style={{ padding: '40px 16px', textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
          No matching products
        </p>
      )}

      {/* Category groups */}
      <div style={{ marginTop: 8 }}>
        {groups.map(({ category, items }) => (
          <div key={category} style={{ marginBottom: 4 }}>
            <div style={{ padding: '10px 16px 6px', background: '#F9FAFB' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {category}
              </p>
            </div>
            <div style={{ padding: '12px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {items.map((item) => (
                <ProductCard key={item.zoho_item_id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {sheetOpen && <ProfileSheet name={user?.contact_name ?? ''} loggingOut={loggingOut} onClose={() => setSheetOpen(false)} onLogout={handleLogout} />}
    </div>
  )
}

// ── Profile sheet (matches CatalogClient sheet exactly) ───────────────────────

function ProfileSheet({
  name, loggingOut, onClose, onLogout,
}: {
  name: string
  loggingOut: boolean
  onClose: () => void
  onLogout: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F8FAFB', zIndex: 50, display: 'flex', flexDirection: 'column', maxWidth: 768, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <button onClick={onClose} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={22} color="#0F172A" />
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A' }}>Account</h1>
      </div>

      <div style={{ margin: '24px 16px 0', background: '#fff', borderRadius: 16, padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E6F0FA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <User size={26} color="#0066CC" />
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{name}</p>
          <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>Registered customer</p>
        </div>
      </div>

      <div style={{ margin: '16px 16px 0', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <button
          onClick={onLogout}
          disabled={loggingOut}
          style={{ width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: loggingOut ? 'default' : 'pointer', opacity: loggingOut ? 0.6 : 1 }}
        >
          <LogOut size={18} color="#EF4444" />
          <span style={{ fontSize: 15, fontWeight: 500, color: '#EF4444' }}>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </span>
        </button>
      </div>
    </div>
  )
}
