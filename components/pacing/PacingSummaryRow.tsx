"use client"

import { useMemo } from "react"
import { KpiTile, type KpiTileProps } from "@/components/dashboard/delivery/shared/KpiTile"
import { formatPacingAud, formatPacingPct1 } from "@/components/pacing/formatters"
import {
  computeLineItemPacingDerived,
  isAtRiskStatus,
} from "@/components/pacing/pacingMetrics"
import { usePacingOverviewData } from "@/components/pacing/PacingOverviewDataContext"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

export function PacingSummaryRow() {
  const { lineItems, loading } = usePacingOverviewData()
  const filterDateTo = usePacingFilterStore((s) => s.filters.date_to)

  const agg = useMemo(() => {
    let sumBudget = 0
    let sumSpend = 0
    let sumProjected = 0
    let atRisk = 0
    let onTrack = 0
    let behind = 0
    let ahead = 0
    for (const row of lineItems) {
      const d = computeLineItemPacingDerived(row, filterDateTo)
      sumBudget += d.budget
      sumSpend += d.spend
      sumProjected += d.projectedTotal
      if (isAtRiskStatus(row.pacing_status)) atRisk += 1
      const k = String(row.pacing_status ?? "").toLowerCase().replace(/ /g, "_")
      if (k === "on_track" || k === "completed") onTrack += 1
      else if (k === "slightly_under" || k === "under_pacing" || k === "no_delivery") behind += 1
      else if (k === "slightly_over" || k === "over_pacing") ahead += 1
    }
    const pctBud = sumBudget > 0 ? sumSpend / sumBudget : null
    const varVsBud = sumBudget > 0 ? (sumProjected - sumBudget) / sumBudget : null
    return {
      count: lineItems.length,
      sumBudget,
      sumSpend,
      sumProjected,
      atRisk,
      onTrack,
      behind,
      ahead,
      pctBud,
      varVsBud,
    }
  }, [lineItems, filterDateTo])

  const tiles: KpiTileProps[] = useMemo(() => {
    if (loading) return []
    return [
      {
        label: "Active line items",
        value: String(agg.count),
        expected:
          agg.count === 0
            ? "—"
            : `${agg.onTrack} on track · ${agg.behind} behind · ${agg.ahead} ahead`,
        status:
          agg.count === 0
            ? "no-data"
            : agg.behind > 0
              ? "behind"
              : "on-track",
      },
      {
        label: "Spend to date",
        value: formatPacingAud(agg.sumSpend),
        expected:
          agg.sumBudget > 0
            ? `${formatPacingAud(agg.sumBudget)} budget`
            : "—",
        progress:
          agg.pctBud != null ? Math.min(agg.pctBud, 1.25) : undefined,
        status:
          agg.count === 0
            ? "no-data"
            : agg.pctBud == null
              ? "no-data"
              : agg.pctBud < 0.9
                ? "behind"
                : agg.pctBud > 1.1
                  ? "ahead"
                  : "on-track",
      },
      {
        label: "Projected delivery",
        value: formatPacingAud(agg.sumProjected),
        expected:
          agg.varVsBud != null
            ? `${agg.varVsBud >= 0 ? "+" : ""}${formatPacingPct1(agg.varVsBud * 100)} vs budget`
            : "—",
        status:
          agg.count === 0
            ? "no-data"
            : agg.varVsBud == null
              ? "no-data"
              : Math.abs(agg.varVsBud) < 0.05
                ? "on-track"
                : agg.varVsBud < 0
                  ? "behind"
                  : "ahead",
      },
      {
        label: "At risk",
        value: String(agg.atRisk),
        expected:
          agg.count === 0
            ? "—"
            : agg.atRisk === 0
              ? "All on pace"
              : agg.atRisk === 1
                ? "1 line item flagged"
                : `${agg.atRisk} line items flagged`,
        status:
          agg.count === 0
            ? "no-data"
            : agg.atRisk === 0
              ? "on-track"
              : "behind",
      },
    ]
  }, [loading, agg])

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-border/60 bg-card animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (agg.count === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 px-6 py-8 text-center">
        <p className="text-sm font-medium text-foreground">
          No line items in scope for the current filters
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try widening the date range, clearing filters, or checking your
          mappings.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </div>
  )
}
