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
    for (const row of lineItems) {
      const d = computeLineItemPacingDerived(row, filterDateTo)
      sumBudget += d.budget
      sumSpend += d.spend
      sumProjected += d.projectedTotal
      if (isAtRiskStatus(row.pacing_status)) atRisk += 1
    }
    const pctBud = sumBudget > 0 ? sumSpend / sumBudget : null
    const varVsBud = sumBudget > 0 ? (sumProjected - sumBudget) / sumBudget : null
    return {
      count: lineItems.length,
      sumBudget,
      sumSpend,
      sumProjected,
      atRisk,
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
        expected: formatPacingAud(agg.sumBudget) + " total budget",
        status: agg.atRisk > 0 ? "behind" : "on-track",
      },
      {
        label: "Spend to date",
        value: formatPacingAud(agg.sumSpend),
        expected:
          agg.pctBud != null
            ? `${formatPacingPct1(agg.pctBud * 100)} of budget`
            : "—",
        progress: agg.pctBud ?? undefined,
        status:
          agg.pctBud == null
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
            ? `${formatPacingPct1(agg.varVsBud * 100)} vs budget`
            : "—",
        status:
          agg.varVsBud == null
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
        expected: agg.atRisk === 1 ? "line item flagged" : "line items flagged",
        status: agg.atRisk === 0 ? "on-track" : "behind",
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </div>
  )
}
