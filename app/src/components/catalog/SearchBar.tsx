'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
  defaultValue?: string
}

export default function SearchBar({ onSearch, placeholder = 'Search products, SKU, brand…', defaultValue = '' }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSearch(value.trim())
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, onSearch])

  return (
    <div style={{ position: 'relative', padding: '8px 12px' }}>
      {/* Search icon — symmetric padding keeps top:50% exactly at input center */}
      <span
        style={{
          position: 'absolute',
          left: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Search size={16} color="#6B7280" />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          boxSizing: 'border-box' as const,
          background: '#F3F4F6',
          border: 'none',
          borderRadius: 10,
          padding: '10px 12px 10px 36px',
          fontSize: 14,
          color: '#1A1A2E',
          outline: 'none',
        }}
        aria-label="Search products"
      />
    </div>
  )
}
