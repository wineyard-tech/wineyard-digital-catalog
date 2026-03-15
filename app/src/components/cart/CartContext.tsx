// TODO: Implement — React context for cart state management
'use client'
import { createContext } from 'react'

export const CartContext = createContext({})

export default function CartProvider({ children }: { children: React.ReactNode }) {
  return <CartContext.Provider value={{}}>{children}</CartContext.Provider>
}
