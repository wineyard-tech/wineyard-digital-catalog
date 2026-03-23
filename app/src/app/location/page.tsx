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
  place_id?: number
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
    city: a.city ?? a.town ?? a.state_district ?? '',
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
  const mountedRef = useRef(true)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const saved = readLocationCookie()
    if (saved) {
      setSavedLocation(saved)
      setPageState('confirm')
    } else {
      requestGeolocation()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pageState === 'search') {
      searchInputRef.current?.focus()
    }
  }, [pageState])

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(''), 3500)
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
          if (!mountedRef.current) return
          setDetectedLocation(extractLocation(data, pos.coords.latitude, pos.coords.longitude))
          setPageState('confirm')
        } catch {
          if (!mountedRef.current) return
          showToast("Couldn't detect location — please search manually")
          setPageState('search')
        }
      },
      () => {
        // Permission denied or geolocation error → fall through to manual search
        if (mountedRef.current) setPageState('search')
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
          <MapPin size={28} color="#fff" aria-hidden="true" />
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
              <MapPin size={18} color="#0066CC" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
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
              <Navigation size={16} aria-hidden="true" />
              Use my current location
            </button>

            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search
                size={16}
                color="#94A3B8"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                aria-hidden="true"
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
                  aria-label="Clear search"
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
                    key={s.place_id ?? i}
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
                    <MapPin size={15} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
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
