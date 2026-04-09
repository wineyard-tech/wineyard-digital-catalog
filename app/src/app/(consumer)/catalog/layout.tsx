import type { ReactNode } from 'react'
import BottomTabs from '@/components/layout/BottomTabs'
import CartBar from '@/components/cart/CartBar'

/** Matches BottomTabs / Home / Buy again — single column on wide viewports */
const CATALOG_COLUMN_MAX_PX = 768

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        style={{
          maxWidth: CATALOG_COLUMN_MAX_PX,
          margin: '0 auto',
          width: '100%',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
      <CartBar />
      <BottomTabs />
    </>
  )
}
