import type { ReactNode } from 'react'
import BottomTabs from '../../components/layout/BottomTabs'
import CartBar from '../../components/cart/CartBar'

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <CartBar />
      <BottomTabs />
    </>
  )
}
