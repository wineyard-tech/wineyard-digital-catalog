import { Suspense } from 'react'
import CartPage from '@/components/cart/CartPage'

export default function CartRoute() {
  return (
    <Suspense>
      <CartPage />
    </Suspense>
  )
}
