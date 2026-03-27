# Auth UX + Location Picker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix initial app experience — smart root routing, login/skip-login flow, location capture before catalog, functional avatar menu with logout.

**Architecture:** Server component at `/` validates session via `getSession()` and routes accordingly. A new `/location` page captures delivery area via browser geolocation (Nominatim reverse geocode) or manual search, stored as a 1-day client-readable `wl` cookie. `CatalogClient` reads that cookie and wires the avatar button to login (guest) or a bottom sheet (authenticated).

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Nominatim OpenStreetMap API, `@/lib/auth` (existing), inline `document.cookie` manipulation (no new dependency).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/src/app/page.tsx` | Modify | Server component: validate session → route to `/location` or `/auth/login` |
| `app/src/app/auth/login/page.tsx` | Modify | Add "Skip Login →" link to `/location` below the card |
| `app/src/app/auth/verify/page.tsx` | Modify | Redirect to `/location` on success; surface OTP-expired as locked state |
| `app/src/app/auth/expired/page.tsx` | Modify | Add "← Back to Login" link |
| `app/src/app/location/page.tsx` | Create | Location picker: geolocation → Nominatim reverse geocode, or manual search |
| `app/src/app/catalog/CatalogClient.tsx` | Modify | Read `wl` cookie for header; wire location tap → `/location`; wire avatar → login/bottom-sheet |
| `app/src/app/api/auth/logout/route.ts` | No change | Already correct — expires session + clears cookie |

---

## Chunk 1: Routing Fixes (Tasks 1–4)

### Task 1: Smart Root Redirect

**Files:**
- Modify: `app/src/app/page.tsx`

The current file is a 6-line client component that blindly redirects to `/catalog`. Convert it to an async server component that validates the session cookie first.

- [ ] **Step 1.1: Replace `page.tsx` with session-aware server component**

```tsx
// app/src/app/page.tsx
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'

export default async function RootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  if (token) {
    const session = await getSession(token)
    if (session) {
      redirect('/location')
    }
  }

  redirect('/auth/login')
}
```

- [ ] **Step 1.2: Verify TypeScript compiles**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/.claude/worktrees/unruffled-goldwasser/app
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from `page.tsx`.

- [ ] **Step 1.3: Start dev server and manually verify routing**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/.claude/worktrees/unruffled-goldwasser/app
npm run dev
```

Open `http://localhost:3000/` in browser:
- No `session_token` cookie → should redirect to `/auth/login` ✓
- With valid `session_token` cookie → should redirect to `/location` ✓

- [ ] **Step 1.4: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/.claude/worktrees/unruffled-goldwasser
git add app/src/app/page.tsx
git commit -m "feat: smart root redirect — session → /location, no session → /auth/login"
```

---

### Task 2: Login Page — "Skip Login" Link

**Files:**
- Modify: `app/src/app/auth/login/page.tsx`

Add a "Skip Login →" text link below the card. It should only appear on the `'phone'` step (not when showing `UnregisteredMessage`). Uses `Link` from `next/link` rather than `router.push` so it is a proper anchor (better for accessibility and PWA).

- [ ] **Step 2.1: Add import and "Skip Login" link**

In `app/src/app/auth/login/page.tsx`:

Add `import Link from 'next/link'` at the top alongside existing imports.

Replace the footer note at the bottom of the JSX:

```tsx
      {/* Footer note */}
      <p className="mt-6 text-xs text-[#94A3B8] text-center">
        WineYard Technologies • CCTV Distributors, Hyderabad
      </p>
```

With:

```tsx
      {/* Skip login — only shown on phone entry step */}
      {step === 'phone' && (
        <div className="mt-5 text-center">
          <Link
            href="/location"
            className="text-sm text-[#64748B] underline underline-offset-2 active:opacity-70"
          >
            Skip Login →
          </Link>
        </div>
      )}

      {/* Footer note */}
      <p className="mt-6 text-xs text-[#94A3B8] text-center">
        WineYard Technologies • CCTV Distributors, Hyderabad
      </p>
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/.claude/worktrees/unruffled-goldwasser/app && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 2.3: Manual check — "Skip Login" appears below card on login page, disappears when UnregisteredMessage is shown**

- [ ] **Step 2.4: Commit**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/.claude/worktrees/unruffled-goldwasser
git add app/src/app/auth/login/page.tsx
git commit -m "feat: add 'Skip Login' link on login page"
```

---

### Task 3: Verify Page — Redirect to `/location` + OTP Expired State

**Files:**
- Modify: `app/src/app/auth/verify/page.tsx`

Two changes:
1. After successful OTP: push to `/location` instead of `/catalog`
2. When API returns 401 with no `attemptsLeft` (the OTP expired/not found case), surface it as the locked state with a clear "expired" message so the user sees the Resend button immediately

The `verify-otp` API returns `{ success: false, error: 'OTP expired or not found. Please request a new OTP.' }` with **no `attemptsLeft` field** (it is `undefined`) when the OTP session has expired. It does NOT return a `code` field. The detection relies solely on `typeof data.attemptsLeft === 'undefined'` + `error` string containing "expired". The `OTPInput` component already handles `attemptsLeft: 0` → `'locked'` state which shows the error and the Resend button — so we just map this case to `{ attemptsLeft: 0, error: '<our message>' }`.

- [ ] **Step 3.1: Update `handleVerify` and success redirect**

Replace the `handleVerify` function and success path in `VerifyContent`:

```tsx
  async function handleVerify(otp: string): Promise<VerifyOTPResult | void> {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, otpCode: otp }),
    })
    const data = (await res.json()) as {
      success?: boolean
      attemptsLeft?: number
      error?: string
    }

    if (res.ok && data.success) {
      router.replace('/location')
      return
    }

    // OTP expired: no attemptsLeft in response → treat as locked (0 attempts) so
    // OTPInput shows the error message + Resend button immediately
    if (typeof data.attemptsLeft === 'undefined' && data.error?.toLowerCase().includes('expired')) {
      return { attemptsLeft: 0, error: 'Your OTP has expired. Tap Resend below to get a new one.' }
    }

    return { attemptsLeft: data.attemptsLeft, error: data.error }
  }
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3.3: Manual check — after entering correct OTP, browser redirects to `/location` (not `/catalog`)**

- [ ] **Step 3.4: Commit**

```bash
git add app/src/app/auth/verify/page.tsx
git commit -m "feat: verify page redirects to /location; surface OTP expired as locked state"
```

---

### Task 4: Expired Page — Back to Login Link

**Files:**
- Modify: `app/src/app/auth/expired/page.tsx`

The current page is a dead-end — the only action is "Open WhatsApp". Add a "← Back to Login" link above the WhatsApp button. The page uses inline `style` objects so stay consistent.

- [ ] **Step 4.1: Add back-to-login link**

Replace the `<a>` WhatsApp block at the bottom of the JSX with:

```tsx
      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#25D366',
          color: '#FFFFFF',
          borderRadius: 12,
          padding: '14px 24px',
          fontSize: 15,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Open WhatsApp
      </a>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <a
          href="/auth/login"
          style={{
            display: 'inline-block',
            fontSize: 14,
            color: '#6B7280',
            textDecoration: 'underline',
          }}
        >
          ← Back to Login
        </a>
      </div>
```

- [ ] **Step 4.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4.3: Navigate to `http://localhost:3000/auth/expired` and confirm "← Back to Login" link appears and goes to `/auth/login`**

- [ ] **Step 4.4: Commit**

```bash
git add app/src/app/auth/expired/page.tsx
git commit -m "feat: add back-to-login link on expired page"
```

---

## Chunk 2: Location Page (Task 5)

### Task 5: Create `/location` Page

**Files:**
- Create: `app/src/app/location/page.tsx`

This is the only new page in the plan. It handles 3 states:
- **`confirm`** — saved `wl` cookie found; shows saved location with "Confirm" and "Change Location" buttons
- **`detecting`** — waiting for `navigator.geolocation.getCurrentPosition`; shows spinner
- **`search`** — geolocation denied, Nominatim failed, or "Change Location" tapped; shows search input with autocomplete

The cookie is written via `document.cookie` on confirm. On success, `router.replace('/catalog')`.

`★ Insight ──────────────────────────────────────`
Nominatim requires `User-Agent` header and has a 1 req/sec rate limit. The search is user-triggered (not debounced on every keystroke) to naturally stay within the limit. The `countrycodes=in` filter on the search endpoint keeps results relevant without server-side validation.
`────────────────────────────────────────────────`

- [ ] **Step 5.1: Create the location directory and page file**

```bash
mkdir -p app/src/app/location
```

Create `app/src/app/location/page.tsx` with the full implementation:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Navigation, Search, X } from 'lucide-react'

const COOKIE_NAME = 'wl'
const COOKIE_MAX_AGE = 24 * 60 * 60 // 1 day in seconds

interface LocationData {
  address: string
  area: string
  city: string
  lat?: number
  lng?: number
}

interface NominatimResult {
  display_name: string
  address: {
    suburb?: string
    neighbourhood?: string
    county?: string
    city?: string
    town?: string
    state_district?: string
    state?: string
    country_code?: string
  }
  lat?: string
  lon?: string
}

type PageState = 'confirm' | 'detecting' | 'search'

function readLocationCookie(): LocationData | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${COOKIE_NAME}=`))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)))
  } catch {
    return null
  }
}

function writeLocationCookie(data: LocationData) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; max-age=${COOKIE_MAX_AGE}; path=/; samesite=lax`
}

function extractLocation(result: NominatimResult, lat?: number, lng?: number): LocationData {
  const a = result.address ?? {}
  return {
    address: result.display_name.split(',').slice(0, 2).join(',').trim(),
    area: a.suburb ?? a.neighbourhood ?? a.county ?? '',
    city: a.city ?? a.town ?? a.state_district ?? a.state ?? '',
    lat,
    lng,
  }
}

export default function LocationPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('detecting')
  const [savedLocation, setSavedLocation] = useState<LocationData | null>(null)
  const [detectedLocation, setDetectedLocation] = useState<LocationData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [toast, setToast] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = readLocationCookie()
    if (saved) {
      setSavedLocation(saved)
      setPageState('confirm')
    } else {
      requestGeolocation()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  function requestGeolocation() {
    setPageState('detecting')
    if (!navigator?.geolocation) {
      setPageState('search')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { 'User-Agent': 'wineyard-catalog/1.0' } }
          )
          if (!res.ok) throw new Error('Nominatim reverse geocode failed')
          const data = (await res.json()) as NominatimResult
          setDetectedLocation(extractLocation(data, pos.coords.latitude, pos.coords.longitude))
          setPageState('confirm')
        } catch {
          showToast("Couldn't detect location — please search manually")
          setPageState('search')
        }
      },
      () => {
        // Permission denied or geolocation error → fall through to manual search
        setPageState('search')
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }

  async function handleSearch() {
    const q = searchQuery.trim()
    if (q.length < 3) return
    setSearchLoading(true)
    setSuggestions([])
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=in&format=json&limit=5&addressdetails=1`,
        { headers: { 'User-Agent': 'wineyard-catalog/1.0' } }
      )
      if (!res.ok) throw new Error()
      const data = (await res.json()) as NominatimResult[]
      setSuggestions(data)
      if (data.length === 0) showToast('No results found — try a different area name')
    } catch {
      showToast('Search unavailable — try again')
    } finally {
      setSearchLoading(false)
    }
  }

  function selectSuggestion(s: NominatimResult) {
    const loc = extractLocation(s, s.lat ? parseFloat(s.lat) : undefined, s.lon ? parseFloat(s.lon) : undefined)
    confirmAndNavigate(loc)
  }

  function confirmAndNavigate(loc: LocationData) {
    writeLocationCookie(loc)
    router.replace('/catalog')
  }

  const displayLocation = detectedLocation ?? savedLocation

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F8FAFB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 16px 32px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: '#0066CC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 4px 12px rgba(0,102,204,0.3)',
          }}
        >
          <MapPin size={28} color="#fff" />
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#0F172A' }}>
          Where should we deliver?
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
          We&apos;ll show stock from your nearest WineYard warehouse
        </p>
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: 24,
        }}
      >
        {/* DETECTING state — also shown during initial load before useEffect runs */}
        {pageState === 'detecting' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: '3px solid #E2E8F0',
                borderTop: '3px solid #0066CC',
                borderRadius: '50%',
                margin: '0 auto 12px',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ margin: 0, fontSize: 14, color: '#64748B' }}>Detecting your location…</p>
          </div>
        )}

        {/* CONFIRM state */}
        {pageState === 'confirm' && displayLocation && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                marginBottom: 20,
                padding: '12px 14px',
                background: '#F0F7FF',
                borderRadius: 12,
              }}
            >
              <MapPin size={18} color="#0066CC" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
                  {displayLocation.area || displayLocation.city}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                  {displayLocation.address}
                </p>
              </div>
            </div>

            <button
              onClick={() => confirmAndNavigate(displayLocation)}
              style={{
                width: '100%',
                height: 48,
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 10,
              }}
            >
              Confirm Location →
            </button>

            <button
              onClick={() => {
                setDetectedLocation(null)
                setSuggestions([])
                setSearchQuery('')
                setPageState('search')
                setTimeout(() => searchInputRef.current?.focus(), 100)
              }}
              style={{
                width: '100%',
                height: 44,
                background: 'none',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                fontSize: 14,
                color: '#64748B',
                cursor: 'pointer',
              }}
            >
              Change Location
            </button>
          </div>
        )}

        {/* SEARCH state */}
        {pageState === 'search' && (
          <div>
            {/* Use my location button */}
            <button
              onClick={requestGeolocation}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 14px',
                background: '#F0F7FF',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                color: '#0066CC',
                cursor: 'pointer',
                marginBottom: 16,
              }}
            >
              <Navigation size={16} />
              Use my current location
            </button>

            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search
                size={16}
                color="#94A3B8"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search area, city…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                style={{
                  width: '100%',
                  height: 44,
                  paddingLeft: 36,
                  paddingRight: searchQuery ? 36 : 12,
                  border: '1.5px solid #E2E8F0',
                  borderRadius: 10,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#0F172A',
                  background: '#fff',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSuggestions([]) }}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                >
                  <X size={14} color="#94A3B8" />
                </button>
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={searchQuery.trim().length < 3 || searchLoading}
              style={{
                width: '100%',
                height: 44,
                background: searchQuery.trim().length < 3 ? '#E2E8F0' : '#0066CC',
                color: searchQuery.trim().length < 3 ? '#94A3B8' : '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: searchQuery.trim().length < 3 ? 'not-allowed' : 'pointer',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {searchLoading ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTop: '2px solid #fff',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Searching…
                </>
              ) : 'Search'}
            </button>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 4 }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectSuggestion(s)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '10px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: i < suggestions.length - 1 ? '1px solid #F8FAFB' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <MapPin size={15} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                      {s.display_name.split(',').slice(0, 3).join(', ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1A1A2E',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: 13,
            maxWidth: '85vw',
            textAlign: 'center',
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5.3: Manual verification checklist**

With dev server running:

a. Navigate to `http://localhost:3000/location` with no `wl` cookie:
   - Should show "Detecting your location…" spinner briefly
   - If geolocation granted → should show address with "Confirm Location →" and "Change Location"
   - If geolocation denied → should show search panel with "Use my current location" + search input

b. With confirmed location: navigate to `http://localhost:3000/location` again:
   - Should show saved area/address in blue card with "Confirm" and "Change Location"

c. "Confirm Location →" → redirects to `/catalog`

d. "Change Location" → switches to search panel

e. Type 3+ chars in search, tap "Search" → shows list of results; tap a result → redirects to `/catalog`

f. Tap "Use my current location" from search panel → re-requests geolocation

- [ ] **Step 5.4: Commit**

```bash
git add app/src/app/location/
git commit -m "feat: add /location page with geolocation + Nominatim search"
```

---

## Chunk 3: Catalog Header + Avatar (Task 6)

### Task 6: Wire Location Header and Avatar Button

**Files:**
- Modify: `app/src/app/catalog/CatalogClient.tsx`

Three changes in one file:
1. Read `wl` cookie on mount → show `📍 {area}` or "📍 Set location" in the header; clicking navigates to `/location`
2. Avatar button: guest (no `contactName`) → navigate to `/auth/login`; authenticated → open bottom sheet
3. Bottom sheet: "Hi {name}", "My Orders" link, "Logout" button (calls `POST /api/auth/logout` then pushes to `/auth/login`)

`★ Insight ──────────────────────────────────────`
The bottom sheet is implemented as a fixed overlay with a white card at the bottom — no library needed. `useRouter` is added as a new import (it does not exist in the current file). The `wl` cookie is read in a `useEffect` (client-side only) since `document.cookie` is not available during SSR.
`────────────────────────────────────────────────`

- [ ] **Step 6.1: Update imports and add state**

At the top of `CatalogClient.tsx`, update imports:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, ChevronDown, X, LogOut, ClipboardList } from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import SearchBar from '../../components/catalog/SearchBar'
import ProductGrid from '../../components/catalog/ProductGrid'
import OfflineBanner from '../../components/shared/OfflineBanner'
import { useScrollDirection } from '../../hooks/useScrollDirection'
```

Add after the existing state declarations (after `const hidden = useScrollDirection()`):

```tsx
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
```

- [ ] **Step 6.2: Update the location button in JSX**

Replace lines 119–137 (the location `<button>` including its closing tag) with:

```tsx
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
```

- [ ] **Step 6.3: Update the avatar button in JSX**

Replace the avatar `<button>` (lines 138–154, including its closing tag) with:

```tsx
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
```

- [ ] **Step 6.4: Add bottom sheet JSX before the closing `</div>` of the component**

Add the sheet just before the final `</div>` (after the infinite scroll sentinel):

```tsx
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} color="#94A3B8" />
              </button>
            </div>

            {/* Greeting */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#E6F0FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={20} color="#0066CC" />
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
              <ClipboardList size={18} color="#0066CC" />
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
              <LogOut size={18} color={loggingOut ? '#94A3B8' : '#DC2626'} />
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </>
      )}
```

- [ ] **Step 6.5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6.6: Manual verification checklist**

a. Navigate to `/catalog` as a guest (no `session_token` cookie):
   - Header shows "📍 Set location" if no `wl` cookie, or "📍 {area}" if cookie exists
   - Tapping location → navigates to `/location`
   - Tapping avatar → navigates to `/auth/login`

b. Navigate to `/catalog` as an authenticated user (valid `session_token` cookie):
   - Tapping avatar → bottom sheet appears with "Hi, {name}", "My Orders", "Logout"
   - "My Orders" → navigates to `/catalog/orders`, sheet closes
   - Backdrop tap → closes sheet
   - "Logout" → sheet stays, shows "Logging out…", then navigates to `/auth/login`
   - After logout: navigating to `/` → routes to `/auth/login` (session gone)

c. After returning from `/location` with `wl` cookie set:
   - Location area shows correctly in header

- [ ] **Step 6.7: Commit**

```bash
git add app/src/app/catalog/CatalogClient.tsx
git commit -m "feat: wire location header and avatar menu with bottom sheet and logout"
```

---

## Final Verification

- [ ] **End-to-end flow: New user**

1. Open `http://localhost:3000/` → lands on `/auth/login`
2. Enter phone → OTP sent → enter OTP → lands on `/location`
3. Allow geolocation or search → confirm → lands on `/catalog` with 📍 area in header
4. Tap avatar → bottom sheet with Logout
5. Logout → lands on `/auth/login`

- [ ] **End-to-end flow: Returning authenticated user**

1. Set valid `session_token` cookie
2. Open `http://localhost:3000/` → lands on `/location` (confirm screen)
3. Confirm → `/catalog`

- [ ] **End-to-end flow: Guest**

1. Open `http://localhost:3000/` → `/auth/login` → tap "Skip Login →" → `/location`
2. Set location → `/catalog`, tap avatar → navigates to `/auth/login`

- [ ] **Dead-end check: Expired page**

Navigate to `/auth/expired` → "← Back to Login" link visible and works

- [ ] **TypeScript final check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Open PR**

```bash
cd /Users/phanikrovvidi/projects/wineyard-catalog/.claude/worktrees/unruffled-goldwasser
gh pr create \
  --title "feat: auth UX, smart routing, location picker, avatar menu" \
  --body "$(cat <<'EOF'
## Summary
- Smart root routing: `/` validates session → `/location` (authenticated) or `/auth/login` (guest)
- Login page: "Skip Login →" link to `/location`
- Verify page: redirects to `/location` on OTP success; surfaces expired OTP as locked state with Resend prompt
- Expired page: adds "← Back to Login" link
- New `/location` page: browser geolocation → Nominatim reverse geocode → confirm, or manual search with OpenStreetMap autocomplete; 1-day `wl` cookie
- Catalog header: reads `wl` cookie for "📍 {area}" display, tappable to change location
- Avatar button: guest → `/auth/login`; authenticated → bottom sheet with My Orders + Logout
- Logout: calls existing `POST /api/auth/logout`, fire-and-forget, always redirects to `/auth/login`

## Test plan
- [ ] `/` with no session → `/auth/login`
- [ ] `/` with valid session → `/location`
- [ ] "Skip Login" → `/location`
- [ ] OTP success → `/location`
- [ ] OTP expired → locked state with Resend prompt
- [ ] Location confirm → `/catalog` with 📍 area
- [ ] Location search → select suggestion → `/catalog`
- [ ] Catalog header location tap → `/location`
- [ ] Guest avatar tap → `/auth/login`
- [ ] Authenticated avatar tap → bottom sheet
- [ ] Logout → `/auth/login`, session cleared
- [ ] `/auth/expired` → "← Back to Login" works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
