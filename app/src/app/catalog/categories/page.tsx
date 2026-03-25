'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, ChevronDown, MapPin,
  Camera, Plug, Fingerprint, Cable, Link2, Tv, Zap,
  HardDrive, Cpu, Layers, Monitor, Server, Network,
  Sun, Wrench, Wifi, Package, Box, Router, BatteryCharging,
  type LucideIcon,
} from 'lucide-react'
import { useScrollDirection } from '../../../hooks/useScrollDirection'
import SearchBar from '../../../components/catalog/SearchBar'

interface Category {
  zoho_category_id: string
  category_name: string
  display_order: number
  icon_url: string | null
}

// Map category name to the closest Lucide icon
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
  if (n.includes('rack')) return Layers
  if (n.includes('stand') || n.includes('fixture')) return Layers
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

// Optimal grid: pick cols so rows fit without scroll
function computeGridLayout(count: number): { cols: number; rows: number } {
  if (count <= 4)  return { cols: 2, rows: Math.ceil(count / 2) }
  if (count <= 9)  return { cols: 3, rows: Math.ceil(count / 3) }
  if (count <= 24) return { cols: 4, rows: Math.ceil(count / 4) }
  return { cols: 5, rows: Math.ceil(count / 5) }
}

const HEADER_H = 96 // location row (44) + search bar (52)
const TITLE_H  = 44 // "Categories" heading row
const TABS_H   = 60

export default function CategoriesPage() {
  const router = useRouter()
  const hidden = useScrollDirection()
  const [locationArea, setLocationArea] = useState<string | null>(null)
  const [contactName, setContactName] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const wl = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('wl='))
      if (wl) {
        const data = JSON.parse(decodeURIComponent(wl.slice(3)))
        setLocationArea(data.area || data.city || null)
      }
    } catch { /* ignore */ }
    try {
      const cn = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('cn='))
      if (cn) setContactName(decodeURIComponent(cn.slice(3)))
    } catch { /* ignore */ }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (!res.ok) return
      const data = await res.json()
      setCategories(data.categories ?? [])
    } catch (err) {
      console.error('Failed to load categories', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const { cols, rows } = computeGridLayout(loading ? 12 : Math.max(categories.length, 1))

  return (
    // Outer wrapper: full viewport, flex column, no overflow — ensures no scroll ever
    <div
      style={{
        maxWidth: 768,
        margin: '0 auto',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Fixed Header — same pattern as CatalogClient ─────────────────── */}
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
              <MapPin size={15} color="#0066CC" />
              <span>{locationArea ?? 'Set location'}</span>
              <ChevronDown size={15} color="#6B7280" />
            </button>
            <button
              onClick={() => !contactName && router.push('/auth/login?from=catalog')}
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
        <SearchBar
          onSearch={(q) => { if (q.trim()) router.push(`/catalog?q=${encodeURIComponent(q)}`) }}
        />
      </header>

      {/* Spacer so flex content starts below the fixed header */}
      <div style={{ flexShrink: 0, height: HEADER_H }} aria-hidden="true" />

      {/* ── Page title ────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: TITLE_H, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Categories</h1>
      </div>

      {/* ── Grid — fills all remaining height, never scrolls ─────────────── */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '0 12px',
          boxSizing: 'border-box',
          // Push up slightly for bottom tabs
          marginBottom: TABS_H,
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
              gap: 10,
              height: '100%',
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ borderRadius: 12, background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="skeleton" style={{ flex: 1 }} />
                <div style={{ padding: '6px 8px 8px' }}>
                  <div className="skeleton" style={{ height: 11, borderRadius: 3, width: '70%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF', fontSize: 14 }}>
            No categories available
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: 10,
              height: '100%',
            }}
          >
            {categories.map((cat) => {
              const Icon = getCategoryIcon(cat.category_name)
              return (
                <button
                  key={cat.zoho_category_id}
                  onClick={() => router.push(`/catalog/categories/${encodeURIComponent(cat.category_name)}`)}
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
                    width: '100%',
                    height: '100%',
                  }}
                >
                  {/* Thumbnail area — image or icon on neutral bg */}
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
                      <Icon size={28} color="#64748B" strokeWidth={1.5} />
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
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#1A1A2E',
                        lineHeight: 1.3,
                        textAlign: 'center',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      } as React.CSSProperties}
                    >
                      {cat.category_name}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
