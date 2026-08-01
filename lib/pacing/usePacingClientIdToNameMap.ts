"use client"

import { useEffect, useState } from "react"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

export type PacingClientIdToNameMapState = {
  map: Map<string, string>
  /** True after the /api/clients fetch finishes (success or failure). */
  settled: boolean
}

/**
 * Same /api/clients source + label formula as PacingFilterToolbar.
 * Map keys are String(client.id); values are display names for row.clientName match.
 */
export function usePacingClientIdToNameMap(): PacingClientIdToNameMapState {
  const assignedClientIds = usePacingFilterStore((s) => s.assignedClientIds)
  const [map, setMap] = useState(() => new Map<string, string>())
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSettled(false)
    const load = async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) {
          if (!cancelled) {
            setMap(new Map())
            setSettled(true)
          }
          return
        }
        const data = await res.json()
        let entries = (Array.isArray(data) ? data : []).map(
          (c: Record<string, unknown>) =>
            [
              String(c.id),
              String(c.mp_client_name || c.clientname_input || c.name || `Client ${c.id}`),
            ] as const,
        )
        if (assignedClientIds.length > 0) {
          const allow = new Set(assignedClientIds)
          entries = entries.filter(([id]) => allow.has(id))
        }
        if (!cancelled) setMap(new Map(entries))
      } catch {
        if (!cancelled) setMap(new Map())
      } finally {
        if (!cancelled) setSettled(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [assignedClientIds])

  return { map, settled }
}

export function pacingFiltersActive(filters: {
  client_ids: string[]
  media_types: string[]
  statuses: string[]
  search: string
}): boolean {
  return (
    filters.client_ids.length > 0 ||
    filters.media_types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.search.trim().length > 0
  )
}
