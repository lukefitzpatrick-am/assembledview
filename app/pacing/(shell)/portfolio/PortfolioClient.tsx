"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import {
  PacingClientFilterUnavailable,
  PacingFilterCount,
  PacingFilterEmptyState,
} from "@/components/pacing/PacingFilterResultMeta"
import { PortfolioCardsBoard } from "@/components/pacing/portfolio/PortfolioCardsBoard"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { countPortfolioRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { filterPortfolioRows } from "@/lib/pacing/portfolio/filterPortfolioRows"
import type { CampaignPacingRow, PortfolioPacingCounts } from "@/lib/pacing/portfolio/types"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import {
  pacingFiltersActive,
  usePacingClientIdToNameMap,
} from "@/lib/pacing/usePacingClientIdToNameMap"
import { isPacingClientFilterUnresolved } from "@/lib/pacing/filters/applyPacingRowFilters"

type ApiShape = {
  asOf: string
  rows: CampaignPacingRow[]
  counts: PortfolioPacingCounts
}

export function PortfolioClient() {
  const [data, setData] = useState<ApiShape | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const filters = usePacingFilterStore((s) => s.filters)
  const { map: clientIdToName, settled: clientMapSettled } = usePacingClientIdToNameMap()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({
      asOfDate: filters.as_of_date,
      liveOnly: "true",
    })
    fetch(`/api/pacing/portfolio?${qs}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const json = (await r.json()) as ApiShape
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters.as_of_date])

  const displayed = useMemo(() => {
    if (!data) return []
    return filterPortfolioRows(
      data.rows,
      {
        client_ids: filters.client_ids,
        media_types: filters.media_types,
        statuses: filters.statuses,
        search: filters.search,
      },
      clientIdToName,
    )
  }, [data, filters.client_ids, filters.media_types, filters.statuses, filters.search, clientIdToName])

  const counts = useMemo(() => countPortfolioRows(displayed), [displayed])
  const deferredFilters = useDeferredValue(filters)
  const isFilterPending = filters !== deferredFilters

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <LoadingState rows={6} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-4">
        <ErrorState title="Failed to load portfolio pacing" message={error} />
      </div>
    )
  }
  if (!data) return null

  const total = data.rows.length
  const filtersOn = pacingFiltersActive(filters)
  const clientFilterPending = filters.client_ids.length > 0 && !clientMapSettled
  const clientFilterUnresolved =
    clientMapSettled && isPacingClientFilterUnresolved(filters.client_ids, clientIdToName)

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">As of {data.asOf}</div>
          {filtersOn && !clientFilterPending && !clientFilterUnresolved ? (
            <PacingFilterCount shown={displayed.length} total={total} />
          ) : null}
        </div>
        {isFilterPending ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Updating…
          </span>
        ) : null}
      </div>
      {clientFilterPending ? (
        <LoadingState rows={4} />
      ) : clientFilterUnresolved ? (
        <PacingClientFilterUnavailable />
      ) : total === 0 ? (
        <EmptyState
          title="No live campaigns"
          message="No live campaigns are in scope for this date."
        />
      ) : filtersOn && displayed.length === 0 ? (
        <PacingFilterEmptyState />
      ) : (
        <PortfolioCardsBoard rows={displayed} asOf={data.asOf} counts={counts} />
      )}
    </div>
  )
}
