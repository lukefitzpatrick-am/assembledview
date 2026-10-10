"use client"

import { useCallback, useEffect, useState } from "react"

export type CampaignsLayoutMode = "table" | "cards"

const CAMPAIGNS_LAYOUT_KEY = "avmp:campaignsLayout:v1"

function storageKey(userId: string | null): string {
  return userId ? `${CAMPAIGNS_LAYOUT_KEY}:${userId}` : CAMPAIGNS_LAYOUT_KEY
}

function readStored(userId: string | null): CampaignsLayoutMode {
  if (typeof window === "undefined") return "table"
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    return raw === "cards" ? "cards" : "table"
  } catch {
    return "table"
  }
}

export function useCampaignsLayout(userId: string | null) {
  const [mode, setModeState] = useState<CampaignsLayoutMode>("table")

  useEffect(() => {
    setModeState(readStored(userId))
  }, [userId])

  const setMode = useCallback(
    (next: CampaignsLayoutMode) => {
      setModeState(next)
      try {
        window.localStorage.setItem(storageKey(userId), next)
      } catch {
        // quota / private mode
      }
    },
    [userId],
  )

  return { mode, setMode }
}
