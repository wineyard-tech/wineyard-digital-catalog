# Catalog V2 UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign WineYard Catalog frontend to match TraderOps Design System v3 — adding bottom tab navigation, a white sticky header with scroll-aware chrome, an updated product card (in-image controls, OOS-only badge, Notify flow), a full-page slide-in cart, and a new product-detail screen.

**Architecture:** Next.js App Router route group `app/catalog/` gains a shared `layout.tsx` that injects `BottomTabs` and `CartBar`; a new `/cart` page and `/product/[id]` page handle cart and detail screens. All scroll-aware show/hide is driven by a single shared `useScrollDirection` hook. No backend or Supabase code is touched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, lucide-react (already installed), inline styles (existing pattern), `useRouter` / `usePathname` from `next/navigation`.

---

## File Map

| Action  | Path | Responsibility |
|---------|------|----------------|
| CREATE  | `app/src/hooks/useScrollDirection.ts` | Shared scroll-direction hook used by header & tabs |
| CREATE  | `app/src/components/layout/BottomTabs.tsx` | Fixed bottom tab bar (Home/Buy Again/Categories/Orders) |
| CREATE  | `app/src/app/catalog/layout.tsx` | Route-group shell: renders BottomTabs + CartBar |
| CREATE  | `app/src/app/catalog/buy-again/page.tsx` | Stub page |
| CREATE  | `app/src/app/catalog/categories/page.tsx` | Stub page |
| CREATE  | `app/src/app/catalog/orders/page.tsx` | Stub page |
| CREATE  | `app/src/app/cart/page.tsx` | Thin server wrapper for CartPage |
| CREATE  | `app/src/components/cart/CartPage.tsx` | Full-page cart client component |
| CREATE  | `app/src/app/product/[id]/page.tsx` | Thin server wrapper for ProductDetailClient |
| CREATE  | `app/src/components/product/ProductDetailClient.tsx` | Product detail screen |
| MODIFY  | `app/src/app/catalog/CatalogClient.tsx` | White header (fixed), round avatar, scroll-hide, remove CartBar |
| MODIFY  | `app/src/components/catalog/SearchBar.tsx` | Gray-fill input, no outer white wrapper needed |
| MODIFY  | `app/src/components/catalog/ProductCard.tsx` | OOS-only banner, full thumbnail, Notify button, click-to-detail |
| MODIFY  | `app/src/components/cart/CartBar.tsx` | `router.push('/cart')` instead of sheet; position above tabs |

---

## Chunk 1: Shared Hook + BottomTabs + Catalog Layout

### Task 1: `useScrollDirection` hook

**Files:**
- Create: `app/src/hooks/useScrollDirection.ts`

- [ ] Create the file:

```ts
// app/src/hooks/useScrollDirection.ts
'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true when the user is scrolling DOWN (i.e., chrome should hide).
 * Stays false until the user has scrolled past `threshold` px from the top.
 */
export function useScrollDirection(threshold = 60): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY

    function onScroll() {
      const y = window.scrollY
      if (y > lastY && y > threshold) {
        setHidden(true)
      } else if (y < lastY) {
        setHidden(false)
      }
      lastY = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return hidden
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git add app/src/hooks/useScrollDirection.ts && git commit -m "feat: add useScrollDirection hook"`

---

### Task 2: `BottomTabs` component

**Files:**
- Create: `app/src/components/layout/BottomTabs.tsx`

- [ ] Create the file:

```tsx
// app/src/components/layout/BottomTabs.tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, RefreshCw, LayoutGrid, ClipboardList } from 'lucide-react'
import { useScrollDirection } from '../../hooks/useScrollDirection'

const TABS = [
  { label: 'Home',       icon: Home,          href: '/catalog' },
  { label: 'Buy Again',  icon: RefreshCw,      href: '/catalog/buy-again' },
  { label: 'Categories', icon: LayoutGrid,     href: '/catalog/categories' },
  { label: 'Orders',     icon: ClipboardList,  href: '/catalog/orders' },
]

export const TAB_HEIGHT = 60 // px — exported so siblings can use for spacing

export default function BottomTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const hidden = useScrollDirection()

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: 768,
        margin: '0 auto',
        background: '#FFFFFF',
        borderTop: '1px solid #E5E7EB',
        display: 'flex',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        transform: hidden ? 'translateY(100%)' : 'translateY(0)',
        transition: 'transform 0.3s ease',
      }}
    >
      {TABS.map(({ label, icon: Icon, href }) => {
        const active = pathname === href
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '10px 4px 8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: active ? '#0066CC' : '#6B7280',
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1.2 }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git add app/src/components/layout/BottomTabs.tsx && git commit -m "feat: add BottomTabs component"`

---

### Task 3: Catalog route layout

**Files:**
- Create: `app/src/app/catalog/layout.tsx`

The layout renders BottomTabs and CartBar for every catalog sub-route.  CartBar must be repositioned above the tabs.

- [ ] Create the file:

```tsx
// app/src/app/catalog/layout.tsx
import BottomTabs from '../../components/layout/BottomTabs'
import CartBar from '../../components/cart/CartBar'

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CartBar />
      <BottomTabs />
    </>
  )
}
```

- [ ] Create stub pages so layout renders:

**`app/src/app/catalog/buy-again/page.tsx`**
```tsx
export default function BuyAgainPage() {
  return (
    <main style={{ padding: '80px 16px 80px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: '#6B7280', marginTop: 40 }}>
        Your previously ordered items will appear here.
      </p>
    </main>
  )
}
```

**`app/src/app/catalog/categories/page.tsx`**
```tsx
export default function CategoriesPage() {
  return (
    <main style={{ padding: '80px 16px 80px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: '#6B7280', marginTop: 40 }}>
        Browse by category — coming soon.
      </p>
    </main>
  )
}
```

**`app/src/app/catalog/orders/page.tsx`**
```tsx
export default function OrdersPage() {
  return (
    <main style={{ padding: '80px 16px 80px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: '#6B7280', marginTop: 40 }}>
        Your order history will appear here.
      </p>
    </main>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit all 4 files

---

## Chunk 2: Header + ProductCard Updates

### Task 4: White header + scroll-hide in CatalogClient

**Files:**
- Modify: `app/src/app/catalog/CatalogClient.tsx`

Key changes:
- `position: fixed` header on white background with subtle shadow
- Round circular avatar (User icon)
- Remove the `<div>` wrapper around `<SearchBar>` (it was only needed for contrast on blue)
- Remove `<CartBar />` (it's now in the layout)
- Use `useScrollDirection()` to hide/show header
- Add a spacer `<div style={{ height: HEADER_HEIGHT }}>` at top of content so fixed header doesn't cover content
- Remove `CategoryFilter`, `BrandFilter` imports (already done in previous session)

Constant: `HEADER_HEIGHT = 100` (px).

- [ ] Replace `CatalogClient.tsx` with:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { User, ChevronDown } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import SearchBar from '../../components/catalog/SearchBar'
import ProductGrid from '../../components/catalog/ProductGrid'
import OfflineBanner from '../../components/shared/OfflineBanner'
import { useScrollDirection } from '../../hooks/useScrollDirection'
import { TAB_HEIGHT } from '../../components/layout/BottomTabs'

const HEADER_HEIGHT = 100

interface CatalogClientProps {
  contactName: string | null
  initialItems: CatalogItem[]
  initialCategories: string[]
  initialBrands: string[]
}

export default function CatalogClient({ contactName, initialItems }: CatalogClientProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const hidden = useScrollDirection()

  const fetchProducts = useCallback(async (q: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/catalog?${params}`, { signal: abortRef.current.signal })
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('Catalog fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    fetchProducts(search)
  }, [search, fetchProducts])

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', paddingBottom: TAB_HEIGHT + 80 }}>
      <OfflineBanner />

      {/* Fixed header */}
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
          transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Location row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 8px',
          }}
        >
          <button
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
            <span>Himayatnagar Warehouse</span>
            <ChevronDown size={15} color="#6B7280" />
          </button>

          {/* Round avatar */}
          <button
            aria-label={contactName ? `Logged in as ${contactName}` : 'Login'}
            title={contactName ? `Hi, ${contactName}` : 'Login'}
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

        {/* Search bar */}
        <SearchBar onSearch={setSearch} />
      </header>

      {/* Spacer so content starts below fixed header */}
      <div style={{ height: HEADER_HEIGHT }} aria-hidden="true" />

      {/* Product grid */}
      <div style={{ padding: '12px 12px 0' }}>
        <ProductGrid items={items} loading={loading} guestMode={false} />
      </div>
    </div>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git commit -am "feat: white fixed header with scroll-hide on catalog"`

---

### Task 5: SearchBar — clean gray-fill input

**Files:**
- Modify: `app/src/components/catalog/SearchBar.tsx`

Changes: gray `#F3F4F6` background, no border, no outer box-shadow, remove bottom-padding from container (header provides spacing).

- [ ] Replace file with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
}

export default function SearchBar({
  onSearch,
  placeholder = "Search products, SKU, brand…",
}: SearchBarProps) {
  const [value, setValue] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSearch(value.trim()), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [value, onSearch])

  return (
    <div style={{ position: 'relative', padding: '0 12px 10px' }}>
      <Search
        size={16}
        color="#9CA3AF"
        style={{
          position: 'absolute',
          left: 24,
          top: '50%',
          transform: 'translateY(-60%)',
          pointerEvents: 'none',
        }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search products"
        style={{
          width: '100%',
          background: '#F3F4F6',
          border: 'none',
          borderRadius: 10,
          padding: '10px 12px 10px 36px',
          fontSize: 14,
          color: '#1A1A2E',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git commit -am "style: SearchBar gray-fill input"`

---

### Task 6: ProductCard — OOS badge, full thumbnail, Notify, typography, click-to-detail

**Files:**
- Modify: `app/src/components/catalog/ProductCard.tsx`

Key changes:
1. **Badge:** only show for `out_of_stock`; centered top banner spanning full width, `borderRadius: '0 0 6px 6px'`
2. **Thumbnail:** remove `padding: 8` from Image style so image fills the container
3. **Notify button:** for OOS, show a 32×32 outlined amber button with a Bell icon instead of disabled +
4. **Typography:** product name 14px/500; SKU 12px/400 #9CA3AF; price dark `#1A1A2E` bold (not blue); strikethrough MRP in gray
5. **Click-to-detail:** outer card div has `onClick` → `router.push('/product/' + id)` after storing item in sessionStorage; cart buttons call `e.stopPropagation()`

```tsx
'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Minus, Bell } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import { useCart } from '../cart/CartContext'

interface ProductCardProps {
  item: CatalogItem
  guestMode?: boolean
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140" viewBox="0 0 200 140">
    <rect width="200" height="140" fill="#F3F4F6"/>
    <text x="100" y="65" text-anchor="middle" fill="#9CA3AF" font-size="36">📷</text>
    <text x="100" y="88" text-anchor="middle" fill="#D1D5DB" font-size="11">No image</text>
  </svg>`
)}`

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export default function ProductCard({ item, guestMode = false }: ProductCardProps) {
  const { items, addItem, updateQty } = useCart()
  const [imgError, setImgError] = useState(false)
  const router = useRouter()

  const cartEntry = items.find((i) => i.zoho_item_id === item.zoho_item_id)
  const qty = cartEntry?.quantity ?? 0
  const isOOS = item.stock_status === 'out_of_stock'
  const imgSrc = !imgError && item.image_url ? item.image_url : PLACEHOLDER

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation()
    if (guestMode || isOOS) return
    addItem({
      zoho_item_id: item.zoho_item_id,
      item_name: item.item_name,
      sku: item.sku,
      quantity: 1,
      rate: item.final_price,
      tax_percentage: 18,
      line_total: item.final_price,
      image_url: item.image_url,
    })
  }

  function handleNotify(e: React.MouseEvent) {
    e.stopPropagation()
    alert(`We'll notify you when ${item.item_name} is back in stock!`)
  }

  function handleQtyChange(e: React.MouseEvent, newQty: number) {
    e.stopPropagation()
    updateQty(item.zoho_item_id, newQty)
  }

  function handleCardClick() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`catalog_product_${item.zoho_item_id}`, JSON.stringify(item))
    }
    router.push(`/product/${item.zoho_item_id}`)
  }

  const hasDiscount = item.price_type === 'custom' && item.base_rate > item.final_price

  return (
    <div
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
      style={{
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      {/* Thumbnail — full fill, no padding */}
      <div style={{ position: 'relative', height: 130, background: '#F9FAFB' }}>
        <Image
          src={imgSrc}
          alt={item.item_name}
          fill
          style={{ objectFit: 'cover' }}
          onError={() => setImgError(true)}
          sizes="(max-width: 640px) 50vw, 33vw"
          unoptimized={!item.image_url || imgError}
        />

        {/* OOS-only badge — centered top banner */}
        {isOOS && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              background: '#64748B',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 0',
              textAlign: 'center',
              borderRadius: '0 0 6px 6px',
              letterSpacing: '0.03em',
            }}
          >
            Out of Stock
          </div>
        )}

        {/* Cart controls or Notify — bottom-right */}
        {!guestMode && (
          <>
            {isOOS ? (
              /* Notify button for OOS */
              <button
                onClick={handleNotify}
                aria-label="Notify when available"
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  width: 32,
                  height: 32,
                  border: '2px solid #B45309',
                  borderRadius: 6,
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bell size={15} color="#B45309" />
              </button>
            ) : qty === 0 ? (
              /* Empty state — + outline button */
              <button
                onClick={handleAdd}
                aria-label="Add to cart"
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  width: 32,
                  height: 32,
                  border: '2px solid #059669',
                  borderRadius: 6,
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Plus size={16} color="#059669" />
              </button>
            ) : (
              /* Selected state — filled emerald pill */
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  display: 'flex',
                  alignItems: 'center',
                  background: '#059669',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={(e) => handleQtyChange(e, qty - 1)}
                  aria-label="Decrease quantity"
                  style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Minus size={14} />
                </button>
                <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 13, minWidth: 18, textAlign: 'center' }}>
                  {qty}
                </span>
                <button
                  onClick={(e) => handleQtyChange(e, qty + 1)}
                  aria-label="Increase quantity"
                  style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card content */}
      <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p
          style={{
            margin: '0 0 2px',
            fontSize: 14,
            fontWeight: 500,
            color: '#1A1A2E',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.item_name}
        </p>
        {item.brand && (
          <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF', lineHeight: 1.2 }}>
            {item.brand}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
            {fmt(item.final_price)}
          </span>
          {hasDiscount && (
            <span style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>
              {fmt(item.base_rate)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git commit -am "feat: ProductCard v2 — OOS badge, full thumbnail, Notify, click-to-detail"`

---

## Chunk 3: CartBar → Navigate + CartPage

### Task 7: CartBar — navigate to /cart, position above tabs

**Files:**
- Modify: `app/src/components/cart/CartBar.tsx`

Key changes: `router.push('/cart')` instead of opening sheet, `bottom: 76` (above 60px tabs + 16px gap).

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useCart } from './CartContext'

export default function CartBar() {
  const { items, itemCount } = useCart()
  const router = useRouter()

  if (itemCount === 0) return null

  const thumbnails = items.slice(0, 3)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 39,
        minWidth: 200,
      }}
    >
      <button
        onClick={() => router.push('/cart')}
        aria-label="View cart"
        style={{
          background: '#059669',
          border: 'none',
          borderRadius: 999,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          width: '100%',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Overlapping thumbnails */}
        {thumbnails.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {thumbnails.map((item, idx) => (
              <div
                key={item.zoho_item_id}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '2px solid #047857',
                  background: '#F0FDF4',
                  overflow: 'hidden',
                  marginLeft: idx === 0 ? 0 : -10,
                  position: 'relative',
                  zIndex: thumbnails.length - idx,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.item_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 12 }}>🛒</span>
                )}
              </div>
            ))}
          </div>
        )}
        <span style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>View Cart</span>
        <span style={{ background: 'rgba(255,255,255,0.25)', color: '#FFFFFF', borderRadius: 999, fontSize: 12, fontWeight: 700, padding: '2px 8px' }}>
          {itemCount}
        </span>
      </button>
    </div>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git commit -am "feat: CartBar navigates to /cart, positioned above tabs"`

---

### Task 8: Full-page CartPage

**Files:**
- Create: `app/src/app/cart/page.tsx`
- Create: `app/src/components/cart/CartPage.tsx`

`app/src/app/cart/page.tsx` is a thin server wrapper:
```tsx
import CartPage from '../../components/cart/CartPage'
export default function CartRoute() {
  return <CartPage />
}
```

`app/src/components/cart/CartPage.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Minus, Plus, Trash2, MessageCircle } from 'lucide-react'
import Image from 'next/image'
import { useCart } from './CartContext'
import type { EnquiryResponse } from '../../../../types/catalog'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const GST_RATE = 0.18
const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F3F4F6"/><text x="28" y="34" text-anchor="middle" fill="#9CA3AF" font-size="22">📷</text></svg>`
)}`

export default function CartPage() {
  const router = useRouter()
  const { items, subtotal, updateQty, removeItem, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EnquiryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const gst = Math.round(subtotal * GST_RATE)
  const total = subtotal + gst
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  async function handleGetQuote() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data: EnquiryResponse = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to submit enquiry')
      setResult(data)
      clearCart()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Success screen ── */
  if (result) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>Quotation sent!</h2>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#6B7280' }}>{result.estimate_number}</p>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6B7280' }}>Check your WhatsApp — your quote is on its way.</p>
        <button
          onClick={() => router.push('/catalog')}
          style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Back to Catalog
        </button>
      </div>
    )
  }

  /* ── Main cart ── */
  return (
    <div style={{ maxWidth: 768, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#F8FAFB' }}>

      {/* Fixed header */}
      <header style={{ position: 'sticky', top: 0, background: '#FFFFFF', borderBottom: '1px solid #F3F4F6', zIndex: 20, display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 12 }}>
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}
        >
          <ArrowLeft size={22} color="#1A1A2E" />
        </button>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1A1A2E', flex: 1 }}>Cart</h1>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>

        {/* Item list */}
        {items.map((item, idx) => {
          const imgSrc = item.image_url || PLACEHOLDER
          return (
            <div
              key={item.zoho_item_id}
              style={{
                display: 'flex',
                gap: 12,
                padding: '14px 16px',
                background: '#FFFFFF',
                borderBottom: idx < items.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              {/* Thumbnail */}
              <div style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', background: '#F9FAFB', flexShrink: 0, position: 'relative' }}>
                <Image src={imgSrc} alt={item.item_name} fill style={{ objectFit: 'cover' }} unoptimized sizes="56px" />
              </div>

              {/* Info + controls */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Name */}
                <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 500, color: '#1A1A2E', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.item_name}
                </p>
                {/* SKU */}
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF' }}>{item.sku}</p>
                {/* Delete */}
                <button
                  onClick={() => removeItem(item.zoho_item_id)}
                  aria-label="Remove item"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444', fontSize: 12 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Right: qty + subtotal */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                {/* Qty selector */}
                <div style={{ display: 'flex', alignItems: 'center', background: '#059669', borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    onClick={() => updateQty(item.zoho_item_id, item.quantity - 1)}
                    aria-label="Decrease"
                    style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={13} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', minWidth: 20, textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(item.zoho_item_id, item.quantity + 1)}
                    aria-label="Increase"
                    style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {/* Subtotal */}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
                  {fmt(item.line_total)}
                </span>
              </div>
            </div>
          )
        })}

        {/* Bill Details */}
        <div style={{ margin: '12px 16px', background: '#FFFFFF', borderRadius: 10, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>Bill Details</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#6B7280' }}>Total Amount ({itemCount} items)</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#6B7280' }}>GST (18%)</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(gst)}</span>
          </div>
          <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>To Pay</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Delivery location */}
        <div style={{ margin: '0 16px 16px', background: '#FFFFFF', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📍</span>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
              Delivery to Himayatnagar Warehouse
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
              From WineYard Outlet, Banjara Hills
            </p>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 768, margin: '0 auto', background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px 24px', zIndex: 20 }}>
        {error && (
          <p style={{ margin: '0 0 8px', padding: '8px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, fontSize: 13 }}>
            {error} —{' '}
            <button onClick={handleGetQuote} style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              retry
            </button>
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {/* WhatsApp Quote */}
          <button
            onClick={handleGetQuote}
            disabled={loading || items.length === 0}
            style={{ flex: 1, background: '#FFFFFF', color: '#059669', border: '1.5px solid #059669', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <MessageCircle size={16} />
            WhatsApp Quote
          </button>
          {/* Place Order */}
          <button
            onClick={() => alert('Order placement coming soon!')}
            disabled={loading || items.length === 0}
            style={{ flex: 1, background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            Place Order →
          </button>
        </div>

        {/* Subtext */}
        <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
          {itemCount} items · Share quote or place order directly
        </p>
      </div>
    </div>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git commit -am "feat: full-page CartPage with slide-in transition"`

---

## Chunk 4: Product Detail Screen

### Task 9: ProductDetailClient

**Files:**
- Create: `app/src/app/product/[id]/page.tsx`
- Create: `app/src/components/product/ProductDetailClient.tsx`

Thin server wrapper at `app/src/app/product/[id]/page.tsx`:
```tsx
import ProductDetailClient from '../../../components/product/ProductDetailClient'

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return <ProductDetailClient id={params.id} />
}
```

`app/src/components/product/ProductDetailClient.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Search, Share2, Plus, Minus, ShoppingCart } from 'lucide-react'
import type { CatalogItem } from '../../../../types/catalog'
import { useCart } from '../cart/CartContext'

interface Props { id: string }

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="#F3F4F6"/>
    <text x="200" y="140" text-anchor="middle" fill="#9CA3AF" font-size="60">📷</text>
    <text x="200" y="180" text-anchor="middle" fill="#D1D5DB" font-size="16">No image available</text>
  </svg>`
)}`

export default function ProductDetailClient({ id }: Props) {
  const router = useRouter()
  const { items, addItem, updateQty } = useCart()
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [relatedItems, setRelatedItems] = useState<CatalogItem[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [loading, setLoading] = useState(true)

  const cartEntry = item ? items.find((i) => i.zoho_item_id === item.zoho_item_id) : null
  const qty = cartEntry?.quantity ?? 0
  const isOOS = item?.stock_status === 'out_of_stock'

  /* Load product — sessionStorage first, then API fallback */
  useEffect(() => {
    const key = `catalog_product_${id}`
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as CatalogItem
        setItem(parsed)
        setLoading(false)
        // Fetch related in background
        if (parsed.category_name) {
          fetch(`/api/catalog?category=${encodeURIComponent(parsed.category_name)}`)
            .then(r => r.json())
            .then(d => setRelatedItems((d.items ?? []).filter((i: CatalogItem) => i.zoho_item_id !== id).slice(0, 6)))
            .catch(() => {})
        }
        return
      }
    } catch { /* ignore */ }
    // Fallback: fetch all and find by id
    fetch('/api/catalog')
      .then(r => r.json())
      .then(d => {
        const found = (d.items ?? []).find((i: CatalogItem) => i.zoho_item_id === id)
        if (found) setItem(found)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  function handleAdd() {
    if (!item || isOOS) return
    addItem({ zoho_item_id: item.zoho_item_id, item_name: item.item_name, sku: item.sku, quantity: 1, rate: item.final_price, tax_percentage: 18, line_total: item.final_price, image_url: item.image_url })
  }

  const hasDiscount = item && item.price_type === 'custom' && item.base_rate > item.final_price
  const imgSrc = !imgError && item?.image_url ? item.image_url : PLACEHOLDER

  if (loading) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <span style={{ fontSize: 14, color: '#6B7280' }}>Loading…</span>
      </div>
    )
  }

  if (!item) {
    return (
      <div style={{ maxWidth: 768, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 12 }}>
        <p style={{ fontSize: 14, color: '#6B7280' }}>Product not found.</p>
        <button onClick={() => router.back()} style={{ background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>Go back</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', background: '#F8FAFB', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 20, display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 12, borderBottom: '1px solid #F3F4F6' }}>
        <button onClick={() => router.back()} aria-label="Go back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ArrowLeft size={22} color="#1A1A2E" />
        </button>
        <div style={{ flex: 1 }} />
        <button aria-label="Search" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Search size={20} color="#6B7280" />
        </button>
        <button
          aria-label="Share"
          onClick={() => navigator.share?.({ title: item.item_name, url: window.location.href })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <Share2 size={20} color="#6B7280" />
        </button>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>

        {/* Product image */}
        <div style={{ background: '#FFFFFF', position: 'relative', height: 280 }}>
          <Image src={imgSrc} alt={item.item_name} fill style={{ objectFit: 'contain', padding: 24 }} onError={() => setImgError(true)} unoptimized={!item.image_url || imgError} sizes="768px" priority />
          {/* Carousel dot (single image) */}
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0066CC' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D1D5DB' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D1D5DB' }} />
          </div>
        </div>

        {/* Product info */}
        <div style={{ background: '#FFFFFF', padding: '16px 16px 12px', borderBottom: '1px solid #F3F4F6' }}>
          {item.brand && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.brand}</p>}
          <h1 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.3 }}>{item.item_name}</h1>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>{item.sku}{item.category_name ? ` · ${item.category_name}` : ''}</p>

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
            {hasDiscount && (
              <>
                <span style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(item.base_rate)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: '#F0FDF4', padding: '2px 8px', borderRadius: 99 }}>
                  {Math.round((1 - item.final_price / item.base_rate) * 100)}% OFF
                </span>
              </>
            )}
          </div>

          {/* Stock status */}
          {item.stock_status === 'available' && item.available_stock > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#059669', fontWeight: 500 }}>
              ✓ In stock ({item.available_stock} units)
            </p>
          )}
          {item.stock_status === 'limited' && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#B45309', fontWeight: 500 }}>
              ⚠ Limited stock — {item.available_stock} left
            </p>
          )}
          {isOOS && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748B', fontWeight: 500 }}>
              Currently out of stock
            </p>
          )}
        </div>

        {/* Product Details accordion */}
        <div style={{ background: '#FFFFFF', marginTop: 8, borderTop: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>Product Details</span>
            <span style={{ fontSize: 18, color: '#6B7280', transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>⌄</span>
          </button>
          {detailsOpen && (
            <div style={{ padding: '0 16px 14px' }}>
              {[
                ['SKU', item.sku],
                item.brand ? ['Brand', item.brand] : null,
                item.category_name ? ['Category', item.category_name] : null,
                ['Tax', `${item.tax_percentage}% GST`],
                ['Available Stock', `${item.available_stock} units`],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#6B7280', minWidth: 100 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#1A1A2E' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related items */}
        {relatedItems.length > 0 && (
          <div style={{ marginTop: 8, background: '#FFFFFF', padding: '14px 0' }}>
            <p style={{ margin: '0 0 10px', padding: '0 16px', fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>People also buy</p>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
              {relatedItems.map((related) => (
                <button
                  key={related.zoho_item_id}
                  onClick={() => {
                    sessionStorage.setItem(`catalog_product_${related.zoho_item_id}`, JSON.stringify(related))
                    router.push(`/product/${related.zoho_item_id}`)
                  }}
                  style={{ flexShrink: 0, width: 100, background: '#F8FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8, cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ height: 60, position: 'relative', marginBottom: 6 }}>
                    <Image src={related.image_url || PLACEHOLDER} alt={related.item_name} fill style={{ objectFit: 'contain' }} unoptimized sizes="100px" />
                  </div>
                  <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 500, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {related.item_name}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#1A1A2E' }}>
                    {fmt(related.final_price)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 768, margin: '0 auto', background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '12px 16px 24px', zIndex: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Price in footer */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>{fmt(item.final_price)}</span>
            {hasDiscount && <span style={{ fontSize: 12, color: '#9CA3AF', textDecoration: 'line-through' }}>{fmt(item.base_rate)}</span>}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>incl. {item.tax_percentage}% GST</p>
        </div>

        {/* Add / Qty */}
        {isOOS ? (
          <button disabled style={{ flex: 1, background: '#F3F4F6', color: '#9CA3AF', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700 }}>
            Out of Stock
          </button>
        ) : qty === 0 ? (
          <button
            onClick={handleAdd}
            style={{ flex: 1, background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={16} />
            Add
          </button>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#059669', borderRadius: 10, padding: '8px 12px' }}>
            <button onClick={() => updateQty(item.zoho_item_id, qty - 1)} style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <Minus size={18} />
            </button>
            <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 15 }}>{qty}</span>
            <button onClick={() => updateQty(item.zoho_item_id, qty + 1)} style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex' }}>
              <Plus size={18} />
            </button>
          </div>
        )}

        {/* View cart shortcut */}
        {qty > 0 && (
          <button
            onClick={() => router.push('/cart')}
            aria-label="View cart"
            style={{ width: 44, height: 44, background: '#E6F0FA', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ShoppingCart size={20} color="#0066CC" />
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] Verify TypeScript: `cd app && npx tsc --noEmit`
- [ ] Commit: `git commit -am "feat: ProductDetailClient screen"`

---

## Chunk 5: Verification

### Task 10: Full verification

- [ ] Run TypeScript: `cd app && npx tsc --noEmit` — should be zero errors
- [ ] Start dev server: `cd app && npm run dev`
- [ ] Visit `/catalog` — confirm white header, round avatar, gray search input, no blue background
- [ ] Confirm bottom tabs render and switch between Home / Buy Again / Categories / Orders
- [ ] Scroll down product list — header and tabs should both hide; scroll up — both reappear
- [ ] Add item to cart — CartBar pill appears above the tabs
- [ ] Click CartBar — navigates to `/cart` (full page, back button works)
- [ ] Click a product card — navigates to `/product/[id]`
- [ ] Confirm OOS products show "Out of Stock" centered banner + Bell/Notify button
- [ ] Confirm in-stock products show no badge + green + button
- [ ] Commit any final fixes
