"use client"

import { useCallback, useEffect, useState } from "react"

export const PAYABLES_HIDE_CLIENT_PAID_STORAGE_KEY = "finance-payables-hide-client-paid"

export function usePayablesHideClientPaid(): readonly [boolean, (next: boolean) => void] {
  const [hide, setHideState] = useState(false)

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      setHideState(window.localStorage.getItem(PAYABLES_HIDE_CLIENT_PAID_STORAGE_KEY) === "1")
    } catch {
      /* ignore */
    }
  }, [])

  const setHide = useCallback((next: boolean) => {
    setHideState(next)
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PAYABLES_HIDE_CLIENT_PAID_STORAGE_KEY, next ? "1" : "0")
      }
    } catch {
      /* ignore */
    }
  }, [])

  return [hide, setHide] as const
}
