"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MediaTypeRowIndicators } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

/** Amber partial-scope badge for the MBA Details header. */
export function MbaPartialScopePill({ label }: { label: string | null }) {
  if (!label) return null
  return (
    <Badge variant="warning" size="sm" className="rounded-pill font-medium">
      {label}
    </Badge>
  )
}

/** Per media-type row status pills (Manual / Fee adjusted / Not in MBA). */
export function MbaMediaTypeRowPills({ row }: { row?: MediaTypeRowIndicators }) {
  if (!row) return null
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1">
      {row.notInMba ? (
        <Badge variant="secondary" size="sm" className="rounded-pill font-normal text-muted-foreground">
          Not in MBA
        </Badge>
      ) : null}
      {row.manual ? (
        <Badge variant="warning" size="sm" dot className="rounded-pill font-medium">
          Manual
        </Badge>
      ) : null}
      {row.feeAdjusted ? (
        <Badge variant="outline" size="sm" className="rounded-pill font-medium text-status-behind-fg border-border">
          Fee adjusted
        </Badge>
      ) : null}
    </span>
  )
}

/** Quiet tick beside Total Investment when billable = MBA. */
export function MbaBillableEqualsPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="secondary"
      size="sm"
      className="ml-2 rounded-pill font-normal text-muted-foreground"
      title="Billable totals match MBA"
    >
      ✓ = billing
    </Badge>
  )
}

/** Campaign-level fee-adjusted hint on the Assembled Fee label. */
export function MbaFeeAdjustedPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge variant="outline" size="sm" className="ml-2 rounded-pill font-medium text-status-behind-fg border-border">
      Fee adjusted
    </Badge>
  )
}

export function mbaMediaTypeRowClassName(row?: MediaTypeRowIndicators): string {
  return cn(row?.muted && "opacity-50 text-muted-foreground")
}
