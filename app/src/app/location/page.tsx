'use client'

import Link from 'next/link'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Navigation, Search, X } from 'lucide-react'

const COOKIE_NAME = 'wl'
const COOKIE_MAX_AGE = 24 * 60 * 60 // 1 day

interface LocationData {
  address: string
  name: string
  area: string
  city: string
  lat?: number
  lng?: number
  /** Nearest Wine Yard warehouse name — set once here via /api/nearest-location (not on cart). */
  warehouse_name?: string
}

type DetectState = 'idle' | 'detecting' | 'denied'

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

/**
 * Extracts human-readable area/city from a Google address_components array.
 * Priority: sublocality_level_1 > sublocality > neighborhood for area
 *           locality > administrative_area_level_2 for city
 */
function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[]
): { name: string; area: string; city: string } {
  const get = (type: string) =>
    components.find(c => c.types.includes(type))?.long_name ?? ''
  const name = get('premise') || get('establishment') || get('route') || ''
  const area = get('sublocality_level_1') || get('sublocality') || get('neighborhood') || ''
  const city = get('locality') || get('administrative_area_level_2') || ''
  return { name, area, city }
}

function buildLocationData(
  result: google.maps.GeocoderResult,
  lat: number,
  lng: number
): LocationData {
  const { name, area, city } = parseAddressComponents(result.address_components)
  const address = result.formatted_address.split(',').slice(0, 2).join(',').trim()
  return { address, name, area, city, lat, lng }
}

export default function LocationPage() {
  const router = useRouter()
  const [savedLocation, setSavedLocation] = useState<LocationData | null>(null)
  const [detectState, setDetectState] = useState<DetectState>('idle')
  const [fromCatalog, setFromCatalog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [toast, setToast] = useState('')

  const searchInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useRef(true)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mapsInitRef = useRef(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    mountedRef.current = true
    setFromCatalog(new URLSearchParams(window.location.search).get('from') === 'catalog')
    setSavedLocation(readLocationCookie())
    searchInputRef.current?.focus()
    return () => {
      mountedRef.current = false
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function initMaps() {
    if (mapsInitRef.current) return
    setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '', v: 'beta' })
    mapsInitRef.current = true
  }

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => { if (mountedRef.current) setToast('') }, 3500)
  }

  async function confirmAndNavigate(loc: LocationData) {
    let next: LocationData = { ...loc }
    const lat = typeof loc.lat === 'number' && isFinite(loc.lat) ? loc.lat : null
    const lng = typeof loc.lng === 'number' && isFinite(loc.lng) ? loc.lng : null
    if (lat !== null && lng !== null) {
      try {
        const r = await fetch(`/api/nearest-location?lat=${lat}&lng=${lng}`)
        if (r.ok) {
          const d: { name?: string | null } = await r.json()
          if (d?.name) next = { ...next, warehouse_name: d.name }
        }
      } catch {
        /* keep location without warehouse label */
      }
    }
    writeLocationCookie(next)
    router.replace('/catalog?mode=browse')
  }

  async function requestGeolocation() {
    if (!navigator?.geolocation) {
      showToast("Location not supported — please search manually")
      return
    }
    setDetectState('detecting')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          initMaps()
          const { Geocoder } = await importLibrary('geocoding') as google.maps.GeocodingLibrary
          const geocoder = new Geocoder()
          const resp = await geocoder.geocode({
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          })
          const result = resp.results[0]
          if (!result) throw new Error('No geocode results')
          if (!mountedRef.current) return
          confirmAndNavigate(buildLocationData(result, pos.coords.latitude, pos.coords.longitude))
        } catch {
          if (!mountedRef.current) return
          setDetectState('idle')
          showToast("Couldn't detect location — please search manually")
        }
      },
      () => {
        if (mountedRef.current) {
          setDetectState('denied')
          showToast("Location access denied — please search below")
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 3) { setSuggestions([]); return }
    debounceRef.current = setTimeout(() => doSearch(value.trim()), 500)
  }

  async function doSearch(q: string) {
    setSearchLoading(true)
    setSuggestions([])
    try {
      initMaps()
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await importLibrary('places') as google.maps.PlacesLibrary
      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken()
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current,
      })
      if (!mountedRef.current) return
      setSuggestions(results)
      if (results.length === 0) showToast('No results — try a different area name')
    } catch {
      if (mountedRef.current) showToast('Search unavailable — try again')
    } finally {
      if (mountedRef.current) setSearchLoading(false)
    }
  }

  async function handleSuggestionClick(suggestion: google.maps.places.AutocompleteSuggestion) {
    const prediction = suggestion.placePrediction
    if (!prediction) return
    try {
      initMaps()
      const { Place } = await importLibrary('places') as google.maps.PlacesLibrary
      const place = prediction.toPlace()
      await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress'] })
      sessionTokenRef.current = null  // session complete; next search gets a fresh token
      if (!place.location) throw new Error('No location')
      const lat = place.location.lat()
      const lng = place.location.lng()
      const components = place.addressComponents ?? []
      const get = (type: string) => components.find(c => c.types.includes(type))?.longText ?? ''
      const name = prediction.mainText?.text || get('premise') || get('establishment') || get('route') || ''
      const area = get('sublocality_level_1') || get('sublocality') || get('neighborhood') || ''
      const city = get('locality') || get('administrative_area_level_2') || ''
      const address = (place.formattedAddress ?? '').split(',').slice(0, 2).join(',').trim()
      confirmAndNavigate({ address, name, area, city, lat, lng })
    } catch {
      showToast("Couldn't get location details — please try again")
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link
          href={fromCatalog ? '/catalog?mode=browse' : '/auth/login'}
          style={{ fontSize: 14, color: '#64748B', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {fromCatalog ? '← Back to Catalog' : '← Back to Login'}
        </Link>
      </div>

      {/* Heading */}
      <div style={{ padding: '20px 16px 12px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0F172A' }}>
          Select Location
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
          We&apos;ll show stock from your nearest Wine Yard warehouse
        </p>
      </div>

      {/* Search bar — always visible */}
      <div style={{ padding: '0 16px 12px', position: 'relative' }}>
        {/* Search icon: outer span positions, inner element renders — no transform conflict */}
        <span
          style={{ position: 'absolute', left: 28, top: 24, transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}
          aria-hidden="true"
        >
          <Search size={16} color="#94A3B8" />
        </span>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search area, locality, city…"
          value={searchQuery}
          onChange={e => handleSearchChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchQuery.trim().length >= 3 && doSearch(searchQuery.trim())}
          style={{
            width: '100%',
            height: 48,
            paddingLeft: 40,
            paddingRight: searchQuery ? 40 : 16,
            border: '1.5px solid #E2E8F0',
            borderRadius: 12,
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
            color: '#0F172A',
            background: '#F8FAFC',
          }}
        />
        {searchLoading && (
          /* Outer span handles vertical centering; inner span handles rotation only.
             Separating them prevents the @keyframes transform from overriding translateY. */
          <span style={{ position: 'absolute', right: 28, top: 24, transform: 'translateY(-50%)', display: 'flex' }}>
            <span
              style={{
                width: 16,
                height: 16,
                border: '2px solid #E2E8F0',
                borderTop: '2px solid #0066CC',
                borderRadius: '50%',
                display: 'block',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </span>
        )}
        {!searchLoading && searchQuery && (
          <button
            aria-label="Clear search"
            data-no-haptic
            onClick={() => { setSearchQuery(''); setSuggestions([]); searchInputRef.current?.focus() }}
            style={{ position: 'absolute', right: 28, top: 24, transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <X size={15} color="#94A3B8" />
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Search suggestions */}
      {suggestions.length > 0 && (
        <div style={{ padding: '0 16px', flex: 1 }}>
          {suggestions.map((s, i) => (
            <button
              key={s.placePrediction?.placeId ?? i}
              onClick={() => handleSuggestionClick(s)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '13px 0',
                background: 'none',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <MapPin size={16} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.4 }}>
                {s.placePrediction?.text.text ?? ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Divider + contextual rows (shown when no suggestions) */}
      {suggestions.length === 0 && (
        <div style={{ padding: '0 16px', flex: 1 }}>
          <div style={{ height: 1, background: '#F1F5F9', marginBottom: 8 }} />

          {/* Use current location row */}
          <button
            onClick={requestGeolocation}
            disabled={detectState === 'detecting'}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 0',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #F1F5F9',
              cursor: detectState === 'detecting' ? 'default' : 'pointer',
              textAlign: 'left',
            }}
          >
            {detectState === 'detecting' ? (
              <span
                style={{
                  width: 18,
                  height: 18,
                  border: '2px solid #E2E8F0',
                  borderTop: '2px solid #0066CC',
                  borderRadius: '50%',
                  display: 'inline-block',
                  flexShrink: 0,
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            ) : (
              <Navigation size={18} color="#0066CC" style={{ flexShrink: 0 }} aria-hidden="true" />
            )}
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0066CC' }}>
                {detectState === 'detecting' ? 'Detecting your location…' : 'Use current location'}
              </p>
              {detectState === 'denied' && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#DC2626' }}>
                  Permission denied — search above instead
                </p>
              )}
            </div>
          </button>

          {/* Recently saved location */}
          {savedLocation && (
            <>
              <p style={{ margin: '14px 0 6px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Recently saved
              </p>
              <button
                onClick={() => confirmAndNavigate(savedLocation)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '13px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #F1F5F9',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <MapPin size={16} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, color: '#0F172A' }}>
                    {savedLocation.name || savedLocation.area || savedLocation.city}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                    {savedLocation.address}
                  </p>
                </div>
              </button>
            </>
          )}
        </div>
      )}

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
            whiteSpace: 'nowrap',
          }}
        >
          {toast}
        </div>
      )}
    </main>
  )
}
