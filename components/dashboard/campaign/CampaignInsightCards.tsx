"use client"

import { useEffect, useState } from "react"

import { IAOCards, type InsightActionOutcomeInput } from "@/components/brand/IAOCards"

type InsightRow = InsightActionOutcomeInput & { id?: number }

function hasActionOrOutcome(row: InsightActionOutcomeInput): boolean {
  return Boolean(row.action?.trim() || row.outcome?.trim())
}

/**
 * Latest live insight for this MBA that has an action or an outcome.
 * Uses GET /api/insights. A 403 (client role) or an empty match hides the row.
 */
export function CampaignInsightCards({ mbaNumber }: { mbaNumber: string }) {
  const [insight, setInsight] = useState<InsightRow | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const onChanged = () => setRefreshKey((n) => n + 1)
    window.addEventListener("insights:changed", onChanged)
    return () => window.removeEventListener("insights:changed", onChanged)
  }, [])

  useEffect(() => {
    let cancelled = false
    const mba = mbaNumber.trim().toLowerCase()
    if (!mba) {
      setInsight(null)
      return
    }
    ;(async () => {
      try {
        const res = await fetch(
          `/api/insights?mba=${encodeURIComponent(mba)}&limit=50`,
          { cache: "no-store" },
        )
        if (!res.ok) {
          if (!cancelled) setInsight(null)
          return
        }
        const data = (await res.json()) as { items?: InsightRow[] }
        const items = Array.isArray(data.items) ? data.items : []
        const match = items.find(hasActionOrOutcome) ?? null
        if (!cancelled) setInsight(match)
      } catch {
        if (!cancelled) setInsight(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mbaNumber, refreshKey])

  if (!insight) return null
  return <IAOCards insight={insight} />
}
