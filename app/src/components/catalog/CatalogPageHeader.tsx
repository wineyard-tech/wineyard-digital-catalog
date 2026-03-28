'use client'

import { useRouter } from 'next/navigation'
import { User, MapPin, ChevronDown } from 'lucide-react'
import SearchBar from './SearchBar'

interface CatalogPageHeaderProps {
  hidden: boolean
  locationArea: string | null
  /** Non-null when user is authenticated — used as avatar aria-label */
  contactName: string | null
  onAvatarClick: () => void
  onSearch: (q: string) => void
  /** Pre-fill the search input (e.g. from URL query param) */
  searchDefaultValue?: string
}

/**
 * Shared location-row + search-bar header used by Catalog and Buy Again pages.
 * Does NOT render a <header> element — the parent wraps this in its own fixed header.
 */
export default function CatalogPageHeader({
  hidden,
  locationArea,
  contactName,
  onAvatarClick,
  onSearch,
  searchDefaultValue,
}: CatalogPageHeaderProps) {
  const router = useRouter()

  return (
    <>
      {/* Location row — collapses on scroll-down */}
      <div style={{ overflow: 'hidden', maxHeight: hidden ? 0 : 48, transition: 'max-height 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 4px' }}>
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
            onClick={onAvatarClick}
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

      {/* Search bar — always visible */}
      <SearchBar onSearch={onSearch} defaultValue={searchDefaultValue} />
    </>
  )
}
