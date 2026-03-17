'use client'

import { createContext, useContext, useEffect, useReducer, ReactNode } from 'react'
import type { CartItem } from '@/types/catalog'

const STORAGE_KEY = 'wineyard_cart'

type CartState = {
  items: CartItem[]
}

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; zoho_item_id: string }
  | { type: 'UPDATE_QTY'; zoho_item_id: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'HYDRATE'; items: CartItem[] }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items }

    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.zoho_item_id === action.item.zoho_item_id)
      if (existing) {
        return {
          items: state.items.map(i =>
            i.zoho_item_id === action.item.zoho_item_id
              ? { ...i, quantity: i.quantity + action.item.quantity, line_total: (i.quantity + action.item.quantity) * i.rate }
              : i
          ),
        }
      }
      return { items: [...state.items, action.item] }
    }

    case 'REMOVE_ITEM':
      return { items: state.items.filter(i => i.zoho_item_id !== action.zoho_item_id) }

    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return { items: state.items.filter(i => i.zoho_item_id !== action.zoho_item_id) }
      }
      return {
        items: state.items.map(i =>
          i.zoho_item_id === action.zoho_item_id
            ? { ...i, quantity: action.quantity, line_total: action.quantity * i.rate }
            : i
        ),
      }
    }

    case 'CLEAR_CART':
      return { items: [] }

    default:
      return state
  }
}

type CartContextValue = {
  items: CartItem[]
  itemCount: number
  subtotal: number
  addItem: (item: CartItem) => void
  removeItem: (zoho_item_id: string) => void
  updateQty: (zoho_item_id: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] })

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const items = JSON.parse(raw) as CartItem[]
        if (Array.isArray(items)) {
          dispatch({ type: 'HYDRATE', items })
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, [])

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
    } catch {
      // ignore storage errors (private browsing, quota exceeded)
    }
  }, [state.items])

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0)
  const subtotal = state.items.reduce((sum, i) => sum + i.line_total, 0)

  const value: CartContextValue = {
    items: state.items,
    itemCount,
    subtotal,
    addItem: (item) => dispatch({ type: 'ADD_ITEM', item }),
    removeItem: (zoho_item_id) => dispatch({ type: 'REMOVE_ITEM', zoho_item_id }),
    updateQty: (zoho_item_id, quantity) => dispatch({ type: 'UPDATE_QTY', zoho_item_id, quantity }),
    clearCart: () => dispatch({ type: 'CLEAR_CART' }),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}

export default CartProvider
