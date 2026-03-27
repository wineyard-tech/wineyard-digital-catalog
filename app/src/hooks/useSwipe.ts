'use client'

import { useRef } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Minimum horizontal distance in px before a swipe is recognized (default: 50) */
  minDistance?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, minDistance = 50 }: UseSwipeOptions) {
  const startX = useRef(0)
  const startY = useRef(0)

  function handleTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const deltaX = e.changedTouches[0].clientX - startX.current
    const deltaY = e.changedTouches[0].clientY - startY.current

    // Only trigger if horizontal movement dominates and exceeds threshold
    if (Math.abs(deltaX) < minDistance || Math.abs(deltaX) <= Math.abs(deltaY)) return

    if (deltaX < 0) onSwipeLeft?.()
    else onSwipeRight?.()
  }

  return { handleTouchStart, handleTouchEnd }
}
