// ARCHIVED: Standalone Categories page replaced by Home tab category navigation.
// See app/src/components/catalog/HomeClient.tsx for the new implementation.

export default function CategoriesPage() {
  return null
}

/*
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

function computeGridLayout(count: number): { cols: number; rows: number } {
  if (count <= 4) return { cols: 2, rows: Math.ceil(count / 2) }
  return { cols: 3, rows: Math.ceil(count / 3) }
}

const HEADER_H = 96
const TITLE_H  = 44
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
    } catch { }
    try {
      const cn = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('cn='))
      if (cn) setContactName(decodeURIComponent(cn.slice(3)))
    } catch { }
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
    <div style={{ maxWidth: 768, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      ... (archived JSX) ...
    </div>
  )
}
*/
