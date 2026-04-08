'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, ArrowLeft, LogOut, ClipboardList,
  Camera, Plug, Fingerprint, Cable, Link2, Tv, Zap,
  HardDrive, Cpu, Layers, Monitor, Server, Network,
  Sun, Wrench, Wifi, Package, Box, Router, BatteryCharging,
  type LucideIcon,
} from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import ProductCard from '@/components/catalog/ProductCard'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import CatalogPageHeader from '@/components/catalog/CatalogPageHeader'
import { getWlHeaderLabelFromParsed } from '@/lib/catalog/wl-cookie-header-label'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useSwipe } from '@/hooks/useSwipe'

// ── Height constants ─────────────────────────────────────────────────────────
// Location row: padding 10+4 + avatar 34 = 48px
// Search bar:   padding 8+8  + input 40 = 56px
const HEADER_FULL   = 104  // location row (48) + search bar (56) when expanded
const TAB_BAR_H     = 44
const BOTTOM_SPACER = 140  // clears CartBar (52px) + BottomTabs (60px) + breathing room

// ── Category icon mapping ────────────────────────────────────────────────────
function getCategoryIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (n.includes('camera')) return Camera
  if (n.includes('adaptor') || n.includes('adapter')) return Plug
  if (n.includes('bio') || n.includes('biometric') || n.includes('access control')) return Fingerprint
  if (n.includes('cable')) return Cable
  if (n.includes('connector')) return Link2
  if (n.includes('dvr')) return Tv
  if (n.includes('fiber') || n.includes('fibre')) return Zap
  if (n.includes('hard disk') || n.includes('hdd') || n.includes('hard drive')) return HardDrive
  if (n.includes('memory')) return Cpu
  if (n.includes('rack') || n.includes('stand') || n.includes('fixture')) return Layers
  if (n.includes('monitor')) return Monitor
  if (n.includes('nvr')) return Server
  if (n.includes('poe') || n.includes('switch')) return Network
  if (n.includes('pvc') || n.includes('accessor')) return Box
  if (n.includes('router') || n.includes('routers')) return Router
  if (n.includes('smps') || n.includes('power supply')) return BatteryCharging
  if (n.includes('solar')) return Sun
  if (n.includes('tool')) return Wrench
  if (n.includes('wifi') || n.includes('wi-fi') || n.includes('wireless')) return Wifi
  return Package
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface Category {
  zoho_category_id: string
  category_name: string
  display_order: number
  icon_url: string | null
  product_count?: number
}

interface TabData {
  items: CatalogItem[]
  hasMore: boolean
  page: number
  loading: boolean
}

interface HomeClientProps {
  /** Primary line: contact person name, or integrator contact name. */
  accountPrimary: string | null
  /** Secondary line: integrator name when logged in as person; else company or empty. */
  accountSubtitle: string | null
  categories: Category[]
  initialQuery?: string
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HomeClient({ accountPrimary, accountSubtitle, categories, initialQuery = '' }: HomeClientProps) {
  const router = useRouter()
  const hidden = useScrollDirection()

  const [activeTab, setActiveTab] = useState<string>('all')
  const [tabCache, setTabCache] = useState<Record<string, TabData>>({})
  const [locationArea, setLocationArea] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [searchItems, setSearchItems] = useState<CatalogItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<string>('all')
  const tabCacheRef  = useRef<Record<string, TabData>>({})
  const activeTabButtonRef = useRef<HTMLButtonElement | null>(null)

  // Mirror state → refs so observer/effect closures read fresh values
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { tabCacheRef.current = tabCache }, [tabCache])

  // ── Read location from wl cookie ────────────────────────────────────────
  useEffect(() => {
    try {
      const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('wl='))
      if (match) {
        const data = JSON.parse(decodeURIComponent(match.slice(3)))
        setLocationArea(getWlHeaderLabelFromParsed(data))
      }
    } catch { /* ignore malformed cookie */ }
  }, [])

  // ── All tab keys in display order ───────────────────────────────────────
  const sortedCategories = [...categories].sort(
    (a, b) => (a.display_order - b.display_order) || a.category_name.localeCompare(b.category_name)
  )
  const allTabs = ['all', ...sortedCategories.map(c => c.category_name)]

  // ── Swipe gestures ───────────────────────────────────────────────────────
  const { handleTouchStart, handleTouchEnd } = useSwipe({
    onSwipeLeft: () => {
      const idx = allTabs.indexOf(activeTabRef.current)
      if (idx < allTabs.length - 1) setActiveTab(allTabs[idx + 1])
    },
    onSwipeRight: () => {
      const idx = allTabs.indexOf(activeTabRef.current)
      if (idx > 0) setActiveTab(allTabs[idx - 1])
    },
  })

  // ── Auto-scroll tab bar to keep active tab visible ───────────────────────
  useEffect(() => {
    activeTabButtonRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
    // Scroll page to top so items in the newly selected category start from the top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeTab])

  // ── Fetch products for a category tab ────────────────────────────────────
  const fetchTabProducts = useCallback(async (
    categoryName: string,
    page: number,
    append: boolean,
  ) => {
    setTabCache((prev: Record<string, TabData>) => ({
      ...prev,
      [categoryName]: {
        items: append ? (prev[categoryName]?.items ?? []) : [],
        hasMore: prev[categoryName]?.hasMore ?? true,
        page,
        loading: true,
      },
    }))

    try {
      const params = new URLSearchParams({ page: String(page), category: categoryName })
      const res = await fetch(`/api/catalog?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setTabCache((prev: Record<string, TabData>) => ({
        ...prev,
        [categoryName]: {
          items: append
            ? [...(prev[categoryName]?.items ?? []), ...(data.items ?? [])]
            : (data.items ?? []),
          hasMore: data.hasMore ?? false,
          page,
          loading: false,
        },
      }))
    } catch (err) {
      console.error(`[HomeClient] fetch failed for "${categoryName}":`, err)
      setTabCache((prev: Record<string, TabData>) => ({
        ...prev,
        [categoryName]: {
          ...(prev[categoryName] ?? { items: [], page: 1, hasMore: false }),
          loading: false,
        },
      }))
    }
  }, [])

  // ── Load on first tab visit (reads from ref — no re-fires on cache updates) ─
  useEffect(() => {
    if (activeTab === 'all') return
    if (tabCacheRef.current[activeTab]) return // already loaded or loading
    fetchTabProducts(activeTab, 1, false)
  }, [activeTab, fetchTabProducts])

  // ── Infinite scroll (reads from refs — only re-registers on tab change) ──
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      const tab = activeTabRef.current
      if (tab === 'all') return
      const cached = tabCacheRef.current[tab]
      if (!cached || !cached.hasMore || cached.loading) return
      fetchTabProducts(tab, cached.page + 1, true)
    }, { rootMargin: '600px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeTab, fetchTabProducts])

  // ── Fetch search results when query changes ───────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchItems([])
      return
    }
    setSearchLoading(true)
    const params = new URLSearchParams({ q: searchQuery.trim() })
    fetch(`/api/catalog?${params}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setSearchItems(data.items ?? []))
      .catch(() => setSearchItems([]))
      .finally(() => setSearchLoading(false))
  }, [searchQuery])

  // ── Logout ───────────────────────────────────────────────────────────────
  function handleLogout() {
    setLoggingOut(true)
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.push('/auth/login'))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 768, margin: '0 auto' }}>

      {/* ── Fixed Header (includes tab bar so there's no gap) ─────────────── */}
      <header
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          maxWidth: 768, margin: '0 auto',
          background: '#FFFFFF',
          zIndex: 30,
        }}
      >
        <CatalogPageHeader
          hidden={hidden}
          locationArea={locationArea}
          contactName={accountPrimary}
          onAvatarClick={() => accountPrimary ? setSheetOpen(true) : router.push('/auth/login?from=catalog')}
          onSearch={(q) => setSearchQuery(q)}
          searchDefaultValue={initialQuery}
        />

        {/* Category tab bar — pill style, lives inside header to eliminate positional gap */}
        <div
          style={{
            borderBottom: '1px solid #E5E7EB',
            boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
            background: '#F8FAFC',
          }}
        >
          <div
            style={{
              display: 'flex',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              padding: '6px 8px',
              height: TAB_BAR_H,
              alignItems: 'center',
              gap: 6,
            } as React.CSSProperties}
          >
            {allTabs.map((tab) => {
              const isActive = activeTab === tab
              const label = tab === 'all' ? 'All' : tab
              return (
                <button
                  key={tab}
                  ref={isActive ? activeTabButtonRef : null}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 14px',
                    background: isActive ? '#0066CC' : '#FFFFFF',
                    border: isActive ? 'none' : '1px solid #E2E8F0',
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#FFFFFF' : '#475569',
                    whiteSpace: 'nowrap',
                    lineHeight: '20px',
                    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                    boxShadow: isActive ? '0 1px 4px rgba(0,102,204,0.3)' : 'none',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── Spacer below fixed header + tab bar ──────────────────────────────── */}
      <div style={{ height: HEADER_FULL + TAB_BAR_H }} aria-hidden="true" />

      {/* ── Swipeable Content Area ────────────────────────────────────────────── */}
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

        {/* SEARCH RESULTS — shown when a query is active */}
        {searchQuery.trim() && (
          <div style={{ padding: '12px 12px 0' }}>
            {searchLoading ? (
              <LoadingSkeleton count={6} />
            ) : searchItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6B7280' }}>
                <p style={{ fontSize: 32, margin: '0 0 12px' }}>🔍</p>
                <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: '#374151' }}>No results for &ldquo;{searchQuery}&rdquo;</p>
                <p style={{ fontSize: 13, margin: 0 }}>Try a different keyword or browse by category</p>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6B7280' }}>
                  {searchItems.length} result{searchItems.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {searchItems.map((item: CatalogItem) => (
                    <ProductCard key={item.zoho_item_id} item={item} guestMode={false} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ALL CATEGORIES TAB */}
        {!searchQuery.trim() && activeTab === 'all' && (
          <div style={{ padding: '12px 12px 0' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {sortedCategories.map((cat) => {
                const Icon = getCategoryIcon(cat.category_name)
                return (
                  <button
                    key={cat.zoho_category_id}
                    onClick={() => setActiveTab(cat.category_name)}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #F1F5F9',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                      padding: 0,
                      aspectRatio: '1 / 1.2',
                    }}
                  >
                    {/* Thumbnail area — image fills container with padding on the img itself */}
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        background: '#F8FAFC',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {cat.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cat.icon_url}
                          alt={cat.category_name}
                          style={{
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            padding: 8,
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
                        <Icon size={34} color="#64748B" strokeWidth={1.5} />
                      )}
                    </div>
                    {/* Name strip */}
                    <div
                      style={{
                        flexShrink: 0,
                        padding: '6px 8px 8px',
                        borderTop: '1px solid #F1F5F9',
                        background: '#FFFFFF',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#1A1A2E',
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        } as React.CSSProperties}
                      >
                        {cat.category_name}
                      </span>
                      {cat.product_count != null && cat.product_count > 0 && (
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.2 }}>
                          {cat.product_count} products
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* INDIVIDUAL CATEGORY TABS */}
        {!searchQuery.trim() && activeTab !== 'all' && (() => {
          const cached = tabCache[activeTab]
          const isLoading = !cached || cached.loading
          const items = cached?.items ?? []

          return (
            <div style={{ padding: '12px 12px 0' }}>
              {isLoading && items.length === 0 ? (
                <LoadingSkeleton count={6} />
              ) : items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6B7280' }}>
                  <p style={{ fontSize: 32, margin: '0 0 12px' }}>📦</p>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: '#374151' }}>No products yet</p>
                  <p style={{ fontSize: 13, margin: 0 }}>Check back soon</p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                  }}
                >
                  {items.map((item: CatalogItem) => (
                    <ProductCard key={item.zoho_item_id} item={item} guestMode={false} />
                  ))}
                </div>
              )}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} style={{ height: 1 }} />
              {cached?.loading && items.length > 0 && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#6B7280', fontSize: 14 }}>
                  Loading more…
                </div>
              )}
            </div>
          )
        })()}

      </div>

      {/* Bottom spacer — clears CartBar + BottomTabs so last product cards are accessible */}
      <div style={{ height: BOTTOM_SPACER }} aria-hidden="true" />

      {/* ── Account profile sheet (authenticated users only) ─────────────────── */}
      {sheetOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: '#F8FAFB',
            zIndex: 50, display: 'flex', flexDirection: 'column',
            maxWidth: 768, margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button
              onClick={() => setSheetOpen(false)}
              aria-label="Back"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            >
              <ArrowLeft size={22} color="#0F172A" aria-hidden="true" />
            </button>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0F172A' }}>Account</h1>
          </div>
          <div style={{ margin: '24px 16px 0', background: '#fff', borderRadius: 16, padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E6F0FA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={26} color="#0066CC" aria-hidden="true" />
            </div>
            <div>
              <p style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{accountPrimary}</p>
              {accountSubtitle ? (
                <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>{accountSubtitle}</p>
              ) : null}
            </div>
          </div>
          <div style={{ margin: '16px 16px 0', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button
              onClick={() => { setSheetOpen(false); router.push('/catalog/orders') }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: 15, color: '#0F172A', fontWeight: 500, textAlign: 'left' }}
            >
              <ClipboardList size={19} color="#0066CC" aria-hidden="true" />
              My Orders
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'none', border: 'none', cursor: loggingOut ? 'not-allowed' : 'pointer', fontSize: 15, color: loggingOut ? '#94A3B8' : '#DC2626', fontWeight: 500, textAlign: 'left' }}
            >
              <LogOut size={19} color={loggingOut ? '#94A3B8' : '#DC2626'} aria-hidden="true" />
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
