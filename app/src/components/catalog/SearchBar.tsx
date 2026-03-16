'use client'

import { useEffect, useRef, useState } from 'react'

interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
}

export default function SearchBar({ onSearch, placeholder = 'Search products, SKU, brand…' }: SearchBarProps) {
  const [value, setValue] = useState('')
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
    <div style={{ position: 'relative', padding: '0 16px 8px' }}>
      {/* Search icon */}
      <svg
        style={{
          position: 'absolute',
          left: 28,
          top: '50%',
          transform: 'translateY(-60%)',
          width: 16,
          height: 16,
          color: '#6B7280',
          pointerEvents: 'none',
        }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 10,
          padding: '10px 12px 10px 36px',
          fontSize: 14,
          color: '#1A1A2E',
          outline: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
        aria-label="Search products"
      />
    </div>
  )
}
