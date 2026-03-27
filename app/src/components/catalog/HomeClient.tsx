'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, ChevronDown, ArrowLeft, LogOut, ClipboardList, MapPin,
  Camera, Plug, Fingerprint, Cable, Link2, Tv, Zap,
  HardDrive, Cpu, Layers, Monitor, Server, Network,
  Sun, Wrench, Wifi, Package, Box, Router, BatteryCharging,
  type LucideIcon,
} from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import ProductCard from '@/components/catalog/ProductCard'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import SearchBar from '@/components/catalog/SearchBar'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useSwipe } from '@/hooks/useSwipe'

// ── Height constants ─────────────────────────────────────────────────────────
const HEADER_FULL      = 120  // location row (44) + padding + search (44) + shadow
const HEADER_COLLAPSED = 52   // search bar only when location row max-height → 0
const TAB_BAR_H        = 44
const BOTTOM_SPACER    = 140  // clears CartBar (52px) + BottomTabs (60px) + breathing room

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
}

interface TabData {
  items: CatalogItem[]
  hasMore: boolean
  page: number
  loading: boolean
}

interface HomeClientProps {
  contactName: string | null
  categories: Category[]
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HomeClient({ contactName, categories }: HomeClientProps) {
  const router = useRouter()
  const hidden = useScrollDirection()

  const [activeTab, setActiveTab] = useState<string>('all')
  const [tabCache, setTabCache] = useState<Record<string, TabData>>({})
  const [locationArea, setLocationArea] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

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
        setLocationArea(data.area || data.city || null)
      }
    } catch { /* ignore malformed cookie */ }
  }, [])

  // ── All tab keys in display order ───────────────────────────────────────
  const allTabs = ['all', ...categories.map(c => c.category_name)]

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
  }, [activeTab])

  // ── Fetch products for a category tab ────────────────────────────────────
  const fetchTabProducts = useCallback(async (
    categoryName: string,
    page: number,
    append: boolean,
  ) => {
    setTabCache(prev => ({
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
      setTabCache(prev => ({
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
      setTabCache(prev => ({
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

  // ── Logout ───────────────────────────────────────────────────────────────
  function handleLogout() {
    setLoggingOut(true)
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.push('/auth/login'))
  }

  const tabTop = hidden ? HEADER_COLLAPSED : HEADER_FULL

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 768, margin: '0 auto' }}>

      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          maxWidth: 768, margin: '0 auto',
          background: '#FFFFFF',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          zIndex: 30,
        }}
      >
        {/* Location row — collapses on scroll-down */}
        <div style={{ overflow: 'hidden', maxHeight: hidden ? 0 : 60, transition: 'max-height 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
            <button
              onClick={() => router.push('/location?from=catalog')}
              style={{
                background: 'none', border: 'none',
                display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer', padding: 0,
                fontSize: 14, fontWeight: 500, color: '#1A1A2E',
              }}
            >
              <MapPin size={15} color="#0066CC" aria-hidden="true" />
              <span>{locationArea ?? 'Set location'}</span>
              <ChevronDown size={15} color="#6B7280" />
            </button>
            <button
              onClick={() => contactName ? setSheetOpen(true) : router.push('/auth/login?from=catalog')}
              aria-label={contactName ? `Hi, ${contactName}` : 'Login'}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: '#E6F0FA', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <User size={18} color="#0066CC" />
            </button>
          </div>
        </div>

        {/* Search bar — always visible; navigates to /catalog?q=... */}
        <SearchBar
          onSearch={(q) => {
            if (q.trim()) router.push(`/catalog?q=${encodeURIComponent(q)}`)
          }}
        />
      </header>

      {/* ── Fixed Category Tab Bar ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: tabTop,
          left: 0, right: 0,
          maxWidth: 768, margin: '0 auto',
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
          zIndex: 20,
          transition: 'top 0.3s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            padding: '0 8px',
            height: TAB_BAR_H,
            alignItems: 'center',
            gap: 4,
          } as React.CSSProperties}
        >
          {allTabs.map((tab) => {
            const isActive = activeTab === tab
            const label = tab === 'all' ? 'All Categories' : tab
            return (
              <button
                key={tab}
                ref={isActive ? activeTabButtonRef : null}
                onClick={() => setActiveTab(tab)}
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #0066CC' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#0066CC' : '#6B7280',
                  whiteSpace: 'nowrap',
                  lineHeight: `${TAB_BAR_H - 2}px`,
                  transition: 'color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Spacer below fixed header + tab bar ──────────────────────────────── */}
      <div style={{ height: HEADER_FULL + TAB_BAR_H }} aria-hidden="true" />

      {/* ── Swipeable Content Area ────────────────────────────────────────────── */}
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

        {/* ALL CATEGORIES TAB */}
        {activeTab === 'all' && (
          <div style={{ padding: '12px 12px 0' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {categories.map((cat) => {
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
                    {/* Thumbnail area — image or icon fallback */}
                    <div
                      style={{
                        flex: 1,
                        background: '#F8FAFC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {cat.icon_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cat.icon_url}
                          alt={cat.category_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <Icon size={32} color="#64748B" strokeWidth={1.5} />
                      )}
                    </div>
                    {/* Name strip */}
                    <div
                      style={{
                        flexShrink: 0,
                        padding: '5px 6px 6px',
                        borderTop: '1px solid #F1F5F9',
                        background: '#FFFFFF',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
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
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* INDIVIDUAL CATEGORY TABS */}
        {activeTab !== 'all' && (() => {
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
                  {items.map((item) => (
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
              <p style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{contactName}</p>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>Registered customer</p>
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
