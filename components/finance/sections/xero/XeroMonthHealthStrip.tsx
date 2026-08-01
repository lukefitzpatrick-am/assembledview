"use client"

import type { XeroMonthMetric } from "@/lib/xero/matchListTypes"
import { formatAUD } from "@/lib/format/money"

type Props = {
  metric: XeroMonthMetric | null
  loading?: boolean
}

export function XeroMonthHealthStrip({ metric, loading }: Props) {
  if (loading && !metric) {
    return (
      <div className="grid gap-2 rounded-card border border-border bg-surface-panel p-3 shadow-e1 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-input bg-[var(--fill-track)]" />
        ))}
      </div>
    )
  }

  const ratePct = metric ? Math.round((metric.referenceHitRate || 0) * 1000) / 10 : 0
  const unmatched = metric?.unmatchedCents ?? 0

  return (
    <div className="grid gap-2 rounded-card border border-border bg-surface-panel p-3 shadow-e1 sm:grid-cols-4">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</p>
        <p className="num text-sm font-semibold">{metric?.periodMonth ?? "—"}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Match rate</p>
        <p className="num text-sm font-semibold">{metric ? `${ratePct}%` : "—"}</p>
        <p className="text-[11px] text-muted-foreground">
          {metric
            ? `${metric.referenceHits}/${metric.referenceAttempts} reference hits`
            : "xero_match_month_metrics"}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unmatched $</p>
        <p className="num text-sm font-semibold">{formatAUD(unmatched / 100)}</p>
        <p className="text-[11px] text-muted-foreground">Σ |delta| on diverged matches</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open cards</p>
        <p className="num text-sm font-semibold">
          {metric ? metric.tier1Diverged + metric.orphans + metric.duplicates : "—"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {metric
            ? `${metric.tier1Diverged} diverged · ${metric.orphans} orphan · ${metric.duplicates} dup`
            : "—"}
        </p>
      </div>
    </div>
  )
}
