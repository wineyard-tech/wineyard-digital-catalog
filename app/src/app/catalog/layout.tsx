import BottomTabs from '../../components/layout/BottomTabs'
import CartBar from '../../components/cart/CartBar'

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CartBar />
      <BottomTabs />
    </>
  )
}
