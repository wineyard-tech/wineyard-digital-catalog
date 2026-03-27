# Category-Based Home Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home screen's carousel layout with a sticky category tab bar + per-category product grid, archiving the standalone Categories and Category Detail views.

**Architecture:** A new `HomeClient.tsx` replaces the carousel home. `catalog/page.tsx` fetches categories server-side and passes them as a prop. `HomeClient` maintains `activeTab` state, lazily fetches per-category products on first tab visit, and uses touch-event swipe detection for horizontal tab switching. The category tab bar is `position: fixed` at a `top` that tracks whether the collapsible header is expanded or collapsed. Old views are commented out (not deleted).

**Tech Stack:** Next.js 16 App Router, React hooks, Supabase JS (server client), TypeScript, inline styles (matches codebase pattern), no new dependencies.

---

## Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/initial_sync/index.ts` | Modify | Add sequential `display_order` to category upsert in `syncAllItems` |
| `app/src/app/catalog/page.tsx` | Modify | Fetch categories from Supabase SSR; pass to `HomeClient`; drop `initialItems`/`initialBrands`/`initialCategories` |
| `app/src/app/catalog/CatalogClient.tsx` | Modify | Archive entire file body inside block comment; re-export `HomeClient` |
| `app/src/components/catalog/HomeClient.tsx` | Create | Full tab-based home: fixed header, sticky tab bar, category grid or product grid per active tab, swipe support |
| `app/src/hooks/useSwipe.ts` | Create | Touch-based horizontal swipe hook |
| `app/src/components/layout/BottomTabs.tsx` | Modify | Remove "Categories" tab entry |
| `app/src/app/catalog/categories/page.tsx` | Modify | Archive body; return `null` so route exists but is unreachable |
| `app/src/app/catalog/categories/[slug]/CategoryClient.tsx` | Modify | Archive body; return `null` |

---

## Chunk 1: Backend — display_order

### Task 1: Populate `display_order` in `syncAllItems`

**Files:**
- Modify: `supabase/functions/initial_sync/index.ts`

The `syncAllItems` function streams Zoho items page by page and upserts categories inline (around lines 122–147). Currently it does NOT set `display_order`. We add two tracking variables before the loop and include `display_order` in each category upsert.

- [ ] **Step 1: Change the counter from `Set` to `Map` to track assigned order per category ID**

  In the function body, immediately after `let brandsFound = 0` (around line 101), insert:

  ```typescript
  // Maps zoho_category_id → its assigned display_order for this sync run.
  // Using a Map (not Set) lets us look up the correct order when the same
  // category_id appears on multiple pages, avoiding wrong-value assignment.
  const categoryOrderMap = new Map<string, number>()
  ```

- [ ] **Step 2: Update the category extraction block**

  Find the block starting `const categoryMap = new Map<string, string>()` (around line 123). Replace the `categories` array construction with:

  ```typescript
  const categories = Array.from(categoryMap.entries()).map(([id, name]) => {
    if (!categoryOrderMap.has(id)) {
      // First time seeing this category in this sync run — assign next order.
      categoryOrderMap.set(id, categoryOrderMap.size + 1)
    }
    return {
      zoho_category_id: id,
      category_name:    name,
      display_order:    categoryOrderMap.get(id)!,
    }
  })
  ```

  `categoryOrderMap.size + 1` is evaluated *before* the `.set()` call, so the first category gets order 1, the second gets 2, etc. A category that appears on multiple pages always gets back the same order it was assigned on first encounter.

  Note: Because the upsert uses `ignoreDuplicates: false`, re-running initial_sync will re-assign display_order values sequentially. Since all rows currently default to 0, this first run sets meaningful values. Subsequent syncs are consistent as long as Zoho returns items in a stable order.

- [ ] **Step 3: Verify the existing upsert call is unchanged**

  The upsert call below should remain:
  ```typescript
  const { error: catErr } = await supabase
    .from('categories')
    .upsert(categories, { onConflict: 'zoho_category_id', ignoreDuplicates: false })
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/functions/initial_sync/index.ts
  git commit -m "feat: assign sequential display_order to categories during initial_sync"
  ```

---

## Chunk 2: Archive Old Views + BottomTabs

### Task 2: Remove "Categories" tab from BottomTabs

**Files:**
- Modify: `app/src/components/layout/BottomTabs.tsx`

- [ ] **Step 1: Remove the Categories entry from the TABS array**

  Change:
  ```typescript
  const TABS = [
    { label: 'Home',       icon: Home,          href: '/catalog' },
    { label: 'Buy Again',  icon: RefreshCw,      href: '/catalog/buy-again' },
    { label: 'Categories', icon: LayoutGrid,     href: '/catalog/categories' },
    { label: 'Orders',     icon: ClipboardList,  href: '/catalog/orders' },
  ]
  ```
  To:
  ```typescript
  const TABS = [
    { label: 'Home',       icon: Home,          href: '/catalog' },
    { label: 'Buy Again',  icon: RefreshCw,      href: '/catalog/buy-again' },
    { label: 'Orders',     icon: ClipboardList,  href: '/catalog/orders' },
  ]
  ```

- [ ] **Step 2: Remove unused `LayoutGrid` import**

  Change:
  ```typescript
  import { Home, RefreshCw, LayoutGrid, ClipboardList } from 'lucide-react'
  ```
  To:
  ```typescript
  import { Home, RefreshCw, ClipboardList } from 'lucide-react'
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/src/components/layout/BottomTabs.tsx
  git commit -m "feat: remove Categories tab from bottom navigation"
  ```

### Task 3: Archive `/catalog/categories` page

**Files:**
- Modify: `app/src/app/catalog/categories/page.tsx`

- [ ] **Step 1: Wrap the entire file content in an archive comment and return null**

  Replace the full file content with:

  ```typescript
  // ARCHIVED: Standalone Categories page replaced by Home tab category navigation.
  // See app/src/components/catalog/HomeClient.tsx for the new implementation.
  export default function CategoriesPage() {
    return null
  }
  ```

  All of the existing code (imports, helper functions, `computeGridLayout`, the full component) should be commented out above the export:

  ```typescript
  // ARCHIVED: Standalone Categories page replaced by Home tab category navigation.
  // See app/src/components/catalog/HomeClient.tsx for the new implementation.
  /*
  'use client'
  ... (entire old file content) ...
  */
  export default function CategoriesPage() {
    return null
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/src/app/catalog/categories/page.tsx
  git commit -m "feat: archive standalone Categories page (replaced by Home tab)"
  ```

### Task 4: Archive `CategoryClient` (category detail view)

**Files:**
- Modify: `app/src/app/catalog/categories/[slug]/CategoryClient.tsx`

- [ ] **Step 1: Archive content, return null**

  ```typescript
  // ARCHIVED: Category detail view replaced by category tab in Home screen.
  // See app/src/components/catalog/HomeClient.tsx for the new implementation.
  /*
  'use client'
  ... (entire old file content) ...
  */
  export default function CategoryClient(_props: { categoryName: string; contactName: string | null; initialItems: never[] }) {
    return null
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/src/app/catalog/categories/[slug]/CategoryClient.tsx
  git commit -m "feat: archive CategoryClient detail view (replaced by Home tab)"
  ```

---

## Chunk 3: New HomeClient + Server Component Updates

### Task 5: Create `useSwipe` hook

**Files:**
- Create: `app/src/hooks/useSwipe.ts`

A minimal hook that detects horizontal swipe direction on a ref'd element.

- [ ] **Step 1: Create the hook file**

  ```typescript
  // app/src/hooks/useSwipe.ts
  'use client'

  import { useRef } from 'react'

  type SwipeDirection = 'left' | 'right' | null

  interface UseSwipeOptions {
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
    minDistance?: number // px threshold before a swipe is recognized
  }

  export function useSwipe({ onSwipeLeft, onSwipeRight, minDistance = 50 }: UseSwipeOptions) {
    const startX = useRef(0)
    const startY = useRef(0)

    function handleTouchStart(e: React.TouchEvent) {
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    }

    function handleTouchEnd(e: React.TouchEvent) {
      const deltaX = e.changedTouches[0].clientX - startX.current
      const deltaY = e.changedTouches[0].clientY - startY.current

      // Require horizontal dominance to avoid triggering on vertical scroll
      if (Math.abs(deltaX) < minDistance || Math.abs(deltaX) <= Math.abs(deltaY)) return

      if (deltaX < 0) onSwipeLeft?.()
      else onSwipeRight?.()
    }

    return { handleTouchStart, handleTouchEnd }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/src/hooks/useSwipe.ts
  git commit -m "feat: add useSwipe hook for horizontal swipe detection"
  ```

### Task 6: Create `HomeClient.tsx`

**Files:**
- Create: `app/src/components/catalog/HomeClient.tsx`

This is the core new component. It:
- Receives `contactName` and `categories` as props from the server component
- Renders the collapsible header (copy from CatalogClient)
- Renders a fixed category tab bar below the header
- Renders "All Categories" tab content (grid of tiles) or per-category product grid based on `activeTab`
- Detects horizontal swipe to change tabs
- Manages per-category product loading + infinite scroll

**Height constants:**
```
HEADER_FULL = 120     // location row (44) + padding (8+8) + search (44) + shadow ≈ 120
HEADER_COLLAPSED = 52 // search bar (44) + shadow ≈ 52 (location row maxHeight 0)
TAB_BAR_H = 44        // compact horizontal scroll tab strip
CONTENT_TOP_SPACER = HEADER_FULL + TAB_BAR_H = 164
BOTTOM_SPACER = 140   // clears CartBar (52px) + BottomTabs (60px) + breathing room
```

- [ ] **Step 1: Create `HomeClient.tsx` with all state, header, tab bar, and content**

  ```typescript
  // app/src/components/catalog/HomeClient.tsx
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

  // ── Height constants ────────────────────────────────────────────────────────
  const HEADER_FULL      = 120   // location row + search bar + shadow
  const HEADER_COLLAPSED = 52    // search bar only (location row max-height → 0)
  const TAB_BAR_H        = 44
  const BOTTOM_SPACER    = 140   // clears CartBar + BottomTabs

  // ── Category icon mapping (reused from archived categories page) ────────────
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

  // ── Types ───────────────────────────────────────────────────────────────────
  interface Category {
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

  // ── Component ───────────────────────────────────────────────────────────────
  export default function HomeClient({ contactName: initialContactName, categories }: HomeClientProps) {
    const router = useRouter()
    const hidden = useScrollDirection()

    const [activeTab, setActiveTab] = useState<string>('all')
    const [tabCache, setTabCache] = useState<Record<string, TabData>>({})
    const [locationArea, setLocationArea] = useState<string | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    // contactName may be overridden by cookie on the client
    const [contactName] = useState(initialContactName)

    const sentinelRef = useRef<HTMLDivElement>(null)
    const activeTabRef = useRef<string>('all')
    const tabCacheRef = useRef<Record<string, TabData>>({})
    const tabBarRef = useRef<HTMLDivElement>(null)
    const activeTabButtonRef = useRef<HTMLButtonElement | null>(null)

    // Mirror activeTab and tabCache into refs so the IntersectionObserver closure
    // always reads the current values without re-registering on every state change.
    useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
    useEffect(() => { tabCacheRef.current = tabCache }, [tabCache])

    // ── Read location from cookie ─────────────────────────────────────────────
    useEffect(() => {
      try {
        const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('wl='))
        if (match) {
          const data = JSON.parse(decodeURIComponent(match.slice(3)))
          setLocationArea(data.area || data.city || null)
        }
      } catch { /* ignore malformed cookie */ }
    }, [])

    // ── All tab identifiers in order ─────────────────────────────────────────
    const allTabs = ['all', ...categories.map(c => c.category_name)]

    // ── Swipe handlers ────────────────────────────────────────────────────────
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

    // ── Auto-scroll the tab bar to reveal the active tab button ──────────────
    useEffect(() => {
      if (activeTabButtonRef.current) {
        activeTabButtonRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
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
        console.error(`[HomeClient] fetch failed for category "${categoryName}":`, err)
        setTabCache(prev => ({
          ...prev,
          [categoryName]: { ...(prev[categoryName] ?? { items: [], page: 1 }), hasMore: false, loading: false },
        }))
      }
    }, [])

    // ── Trigger initial load when switching to a category tab ─────────────────
    // Read from tabCacheRef (not state) to avoid this effect re-firing on every
    // incremental page append. Re-registers only when activeTab or fetchTabProducts changes.
    useEffect(() => {
      if (activeTab === 'all') return
      if (tabCacheRef.current[activeTab]) return   // already loaded (or loading)
      fetchTabProducts(activeTab, 1, false)
    }, [activeTab, fetchTabProducts])

    // ── Infinite scroll: load more products when sentinel enters viewport ──────
    useEffect(() => {
      const sentinel = sentinelRef.current
      if (!sentinel) return
      const observer = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return
        const tab = activeTabRef.current
        if (tab === 'all') return
        // Read from ref, not state — avoids re-registering on every fetch
        const cached = tabCacheRef.current[tab]
        if (!cached || !cached.hasMore || cached.loading) return
        fetchTabProducts(tab, cached.page + 1, true)
      }, { rootMargin: '600px' })
      observer.observe(sentinel)
      return () => observer.disconnect()
      // Only re-register when activeTab changes (new tab = new sentinel position)
      // or fetchTabProducts reference changes (stable — defined with useCallback, no deps)
    }, [activeTab, fetchTabProducts])

    // ── Logout ────────────────────────────────────────────────────────────────
    function handleLogout() {
      setLoggingOut(true)
      fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.push('/auth/login'))
    }

    // ── Tab top position: tracks header collapse ──────────────────────────────
    const tabTop = hidden ? HEADER_COLLAPSED : HEADER_FULL

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <div style={{ maxWidth: 768, margin: '0 auto' }}>

        {/* ── Fixed Header ─────────────────────────────────────────────────── */}
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

        {/* ── Fixed Category Tab Bar ───────────────────────────────────────── */}
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
            ref={tabBarRef}
            style={{
              display: 'flex',
              overflowX: 'auto',
              scrollbarWidth: 'none',       // Firefox
              msOverflowStyle: 'none',      // IE
              padding: '0 8px',
              height: TAB_BAR_H,
              alignItems: 'center',
              gap: 4,
            }}
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

        {/* ── Content spacer (below fixed header + tab bar) ────────────────── */}
        <div style={{ height: HEADER_FULL + TAB_BAR_H }} aria-hidden="true" />

        {/* ── Swipeable Content Area ──────────────────────────────────────── */}
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
                      {/* Thumbnail area */}
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

        {/* Bottom spacer — clears CartBar + BottomTabs */}
        <div style={{ height: BOTTOM_SPACER }} aria-hidden="true" />

        {/* ── Account profile sheet (authenticated users) ──────────────────── */}
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
              <button onClick={() => { setSheetOpen(false); router.push('/catalog/orders') }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: 15, color: '#0F172A', fontWeight: 500, textAlign: 'left' }}>
                <ClipboardList size={19} color="#0066CC" aria-hidden="true" />
                My Orders
              </button>
              <button onClick={handleLogout} disabled={loggingOut}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'none', border: 'none', cursor: loggingOut ? 'not-allowed' : 'pointer', fontSize: 15, color: loggingOut ? '#94A3B8' : '#DC2626', fontWeight: 500, textAlign: 'left' }}>
                <LogOut size={19} color={loggingOut ? '#94A3B8' : '#DC2626'} aria-hidden="true" />
                {loggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

  Note: `SearchBar` from `@/components/catalog/SearchBar` is already imported and used in the header. Submitting a search navigates to `/catalog?q=...` (same as existing CatalogClient behavior).

- [ ] **Step 2: Commit**

  ```bash
  git add app/src/components/catalog/HomeClient.tsx
  git commit -m "feat: create HomeClient with category tab bar, swipe gestures, and per-category product grid"
  ```

### Task 7: Update `catalog/page.tsx` to fetch categories SSR and use `HomeClient`

**Files:**
- Modify: `app/src/app/catalog/page.tsx`

Currently the page calls `resolvePrice` to get `initialItems` and derives categories from that. The new design passes categories directly from Supabase (sorted by `display_order`) and removes the initial product fetch — products load client-side per tab.

- [ ] **Step 1: Replace the FULL content of `catalog/page.tsx` with the following (do not patch — overwrite the entire file)**

  ```typescript
  // app/src/app/catalog/page.tsx
  import { cookies } from 'next/headers'
  import { getSession } from '@/lib/auth'
  import { createServiceClient } from '@/lib/supabase/server'
  import HomeClient from '@/components/catalog/HomeClient'

  interface Category {
    zoho_category_id: string
    category_name: string
    display_order: number
    icon_url: string | null
  }

  export default async function CatalogPage() {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session_token')?.value

    let contactName: string | null = null

    if (sessionToken) {
      const session = await getSession(sessionToken)
      if (session) {
        contactName = session.contact_name ?? null
      }
    }

    // Fetch categories sorted by display_order for the tab bar.
    // The `categories` table may not appear in the generated types file yet
    // (database.generated.ts is regenerated from the live DB). If TypeScript
    // complains about the table name, run `scripts/generate-types.sh` first.
    const supabase = createServiceClient()
    const { data: rawCategories } = await supabase
      .from('categories' as never)
      .select('zoho_category_id, category_name, display_order, icon_url')
      .eq('status', 'active')
      .order('display_order', { ascending: true })
      .order('category_name', { ascending: true })

    return (
      <HomeClient
        contactName={contactName}
        categories={(rawCategories ?? []) as unknown as Category[]}
      />
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/src/app/catalog/page.tsx
  git commit -m "feat: update CatalogPage to pass SSR categories to HomeClient"
  ```

### Task 8: Archive `CatalogClient.tsx`

**Files:**
- Modify: `app/src/app/catalog/CatalogClient.tsx`

`CatalogClient` is no longer imported by `catalog/page.tsx` but may be referenced elsewhere. Archive its content and keep the file for historical reference.

- [ ] **Step 1: Wrap existing content in a block comment; add archive notice**

  At the very top of the file, before `'use client'`, add:

  ```typescript
  // ARCHIVED: Home tab carousels replaced by category-based HomeClient.
  // See app/src/components/catalog/HomeClient.tsx
  // Original file preserved below for reference.
  ```

  Then wrap the entire `'use client'` down through the final `}` in:

  ```
  /*
  [entire original file content]
  */
  ```

  The file should end with an empty default export so TypeScript doesn't complain if any import is left pointing here:

  ```typescript
  // ARCHIVED — see HomeClient.tsx
  /*
  ... original content ...
  */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default function CatalogClient(_props: any) { return null }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/src/app/catalog/CatalogClient.tsx
  git commit -m "feat: archive CatalogClient (replaced by HomeClient)"
  ```

---

## Chunk 4: Verification + Cleanup

### Task 9: TypeScript check and manual smoke test

- [ ] **Step 1: Run TypeScript check**

  ```bash
  cd app && npx tsc --noEmit
  ```

  Expected: 0 errors. If errors appear:
  - Missing import → add the import
  - `any` type warnings → add `// eslint-disable-next-line` or tighten the type
  - `Image` component warnings → verify `src/components/catalog/HomeClient.tsx` has the correct import

- [ ] **Step 2: Start dev server and smoke-test**

  ```bash
  cd app && npm run dev
  ```

  Verify:
  - `/catalog` loads, shows header + tab bar + "All Categories" grid
  - Tapping a category tile switches to that category's tab
  - Category tab shows product cards (2-col grid)
  - Horizontal swipe switches tabs (test in browser DevTools mobile viewport)
  - Active tab has blue underline and blue text
  - Tab bar stays visible when scrolling down (header collapses, tab bar stays at `top: 52`)
  - "View Cart" (CartBar) is visible above BottomTabs when items in cart
  - BottomTabs shows 3 tabs: Home, Buy Again, Orders (no Categories)
  - `/catalog/categories` returns blank page (no crash)

- [ ] **Step 3: Lint**

  ```bash
  cd app && npm run lint
  ```

  Fix any lint errors before committing.

- [ ] **Step 4: Final commit**

  ```bash
  git add -A
  git commit -m "feat: category-based Home screen redesign complete"
  ```

---

## Known Limitations / Future Work

- **Search within tabs:** Tapping the search bar navigates to `/catalog?q=...` which renders the old full-catalog search results. A future iteration could filter products within the active category tab.
- **display_order manual override:** Re-running `initial_sync` will overwrite manually-set `display_order` values. A future migration can add a `display_order_locked BOOLEAN DEFAULT FALSE` flag to protect manual values.
- **Prefetching adjacent tabs:** Currently, products only load when a tab is first activated. Prefetching the next tab on activation would reduce perceived latency.
- **Tab bar scroll-to-active on initial render:** If `activeTab` starts as the 10th category (e.g., from a deep link), the tab bar doesn't auto-scroll on mount. Add a `useEffect` on mount if this becomes an issue.
