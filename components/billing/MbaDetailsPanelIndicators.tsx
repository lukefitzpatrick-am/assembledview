"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MediaTypeRowIndicators } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

/** Attention: amber partial-scope badge for the MBA Details header. */
export function MbaPartialScopePill({ label }: { label: string | null }) {
  if (!label) return null
  return (
    <Badge variant="attention" size="sm" className="rounded-pill font-medium">
      {label}
    </Badge>
  )
}

/** Per media-type row status pills (Manual / Fee adjusted / Client pays / Not in MBA). */
export function MbaMediaTypeRowPills({ row }: { row?: MediaTypeRowIndicators }) {
  if (!row) return null
  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1">
      {row.notInMba ? (
        <Badge
          variant="secondary"
          size="sm"
          className="rounded-pill font-normal text-muted-foreground"
        >
          Not in MBA
        </Badge>
      ) : null}
      {row.manual ? (
        <Badge variant="attention" size="sm" dot className="rounded-pill font-medium">
          Manual
        </Badge>
      ) : null}
      {row.feeAdjusted ? (
        <Badge variant="attention" size="sm" className="rounded-pill font-medium">
          Fee adjusted
        </Badge>
      ) : null}
      {row.clientPays && !row.notInMba ? (
        <Badge variant="attention" size="sm" className="rounded-pill font-medium">
          Client pays
        </Badge>
      ) : null}
    </span>
  )
}

/** Quiet tick beside Total Investment when billable = MBA (good). */
export function MbaBillableEqualsPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="good"
      size="sm"
      className="ml-2 rounded-pill font-normal"
      title="Billable totals match MBA"
    >
      ✓ = billing
    </Badge>
  )
}

/** Blocking pill when billable ≠ MBA. */
export function MbaBillableMismatchPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge
      variant="blocking"
      size="sm"
      className="ml-2 rounded-pill font-medium"
      title="Billable totals do not match MBA"
    >
      billing ≠ MBA
    </Badge>
  )
}

/** Attention: campaign-level fee-adjusted hint on the Assembled Fee label. */
export function MbaFeeAdjustedPill({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge variant="attention" size="sm" className="ml-2 rounded-pill font-medium">
      Fee adjusted
    </Badge>
  )
}

export function mbaMediaTypeRowClassName(row?: MediaTypeRowIndicators): string {
  return cn(row?.muted && "opacity-50 text-muted-foreground")
}
