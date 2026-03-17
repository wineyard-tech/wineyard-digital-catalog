'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true when the user is scrolling DOWN (i.e., chrome should hide).
 * Stays false until the user has scrolled past `threshold` px from the top.
 */
export function useScrollDirection(threshold = 60): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY

    function onScroll() {
      const y = window.scrollY
      if (y > lastY && y > threshold) {
        setHidden(true)
      } else if (y < lastY) {
        setHidden(false)
      }
      lastY = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return hidden
}
