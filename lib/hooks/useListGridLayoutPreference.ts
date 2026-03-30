"use client"

import { useCallback, useEffect, useState } from "react"

export type ListGridLayoutMode = "list" | "grid"

/** Shared across dashboard, client hub, and publishers. */
export const LIST_GRID_LAYOUT_STORAGE_KEY = "avmp:listGridLayout:v1"

function readStored(): ListGridLayoutMode {
  if (typeof window === "undefined") return "list"
  try {
    const raw = window.localStorage.getItem(LIST_GRID_LAYOUT_STORAGE_KEY)
    return raw === "grid" ? "grid" : "list"
  } catch {
    return "list"
  }
}

export function useListGridLayoutPreference() {
  const [mode, setModeState] = useState<ListGridLayoutMode>("list")

  useEffect(() => {
    setModeState(readStored())
  }, [])

  const setMode = useCallback((next: ListGridLayoutMode) => {
    setModeState(next)
    try {
      window.localStorage.setItem(LIST_GRID_LAYOUT_STORAGE_KEY, next)
    } catch {
      // ignore quota / private mode
    }
  }, [])

  return { mode, setMode }
}
