"use client"

import { useEffect, useState } from "react"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

/**
 * Same /api/clients source + label formula as PacingFilterToolbar.
 * Map keys are String(client.id); values are display names for row.clientName match.
 */
export function usePacingClientIdToNameMap(): Map<string, string> {
  const assignedClientIds = usePacingFilterStore((s) => s.assignedClientIds)
  const [map, setMap] = useState(() => new Map<string, string>())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) return
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
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [assignedClientIds])

  return map
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
