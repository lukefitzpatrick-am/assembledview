"use client"

import { useEffect, useState } from "react"

/**
 * Returns true once `loading` has been continuously true for `delayMs`.
 * Clears on loading=false or unmount.
 */
export function useSlowLoadHint(loading: boolean, delayMs = 10_000): boolean {
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (!loading) {
      setShowHint(false)
      return
    }
    const id = window.setTimeout(() => setShowHint(true), delayMs)
    return () => window.clearTimeout(id)
  }, [loading, delayMs])

  return showHint
}
