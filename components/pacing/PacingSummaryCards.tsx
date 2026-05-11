"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPacingAud, formatPacingPct1 } from "@/components/pacing/formatters"
import {
  computeLineItemPacingDerived,
  isAtRiskStatus,
} from "@/components/pacing/pacingMetrics"
import { VarianceRibbon } from "@/components/dashboard/delivery/shared/VarianceRibbon"
import { usePacingOverviewData } from "@/components/pacing/PacingOverviewDataContext"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

export function PacingSummaryCards() {
  const { lineItems, loading } = usePacingOverviewData()
  const filterDateTo = usePacingFilterStore((s) => s.filters.date_to)

  const agg = useMemo(() => {
    let sumB = 0
    let sumS = 0
    let sumP = 0
    let atRisk = 0
    for (const row of lineItems) {
      const d = computeLineItemPacingDerived(row, filterDateTo)
      sumB += d.budget
      sumS += d.spend
      sumP += d.projectedTotal
      if (isAtRiskStatus(row.pacing_status)) atRisk += 1
    }
    const pctBud = sumB > 0 ? (sumS / sumB) * 100 : null
    const varVsBud = sumB > 0 ? ((sumP - sumB) / sumB) * 100 : null
    return {
      count: lineItems.length,
      sumB,
      sumS,
      sumP,
      atRisk,
      pctBud,
      varVsBud,
    }
  }, [lineItems, filterDateTo])

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/60">
            <CardHeader className="pb-2">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-10 w-36 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Active line items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums">{agg.count}</p>
          <p className="text-sm text-muted-foreground">
            Total budget{" "}
            <span className="font-medium text-foreground tabular-nums">{formatPacingAud(agg.sumB)}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Spend MTD</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums">{formatPacingAud(agg.sumS)}</p>
          <p className="text-sm text-muted-foreground">
            {agg.pctBud != null ? (
              <>
                <span className="font-medium text-foreground tabular-nums">
                  {formatPacingPct1(agg.pctBud)}
                </span>{" "}
                of budget
              </>
            ) : (
              "—"
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Projected delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums">{formatPacingAud(agg.sumP)}</p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Variance vs budget</p>
            {agg.varVsBud != null && Number.isFinite(agg.varVsBud) ? (
              <VarianceRibbon variance={agg.varVsBud / 100} className="max-w-full" />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">At risk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">
            {agg.atRisk}
          </p>
          <p className="text-xs text-muted-foreground">Under / over pacing / no delivery</p>
        </CardContent>
      </Card>
    </div>
  )
}
