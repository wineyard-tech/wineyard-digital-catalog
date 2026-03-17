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
        const active = href === '/catalog' ? pathname === '/catalog' : pathname.startsWith(href)
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
