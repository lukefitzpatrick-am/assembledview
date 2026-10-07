"use client"

import { Badge } from "@/components/ui/badge"
import { BILLING_STATE } from "@/lib/design/status"
import type { BillingState } from "@/lib/finance/billingLifecycle"
import { cn } from "@/lib/utils"

export function BillingStateBadge({
  state,
  reason,
  approvedDrift,
  overdueDays,
  label,
  className,
}: {
  state: BillingState
  reason?: string
  approvedDrift?: boolean
  /** Owed ledger only — cards omit this and keep the bare "Overdue" label. */
  overdueDays?: number
  /** Replaces the default state label. The pill stays non-interactive. */
  label?: string
  className?: string
}) {
  const labelText =
    label ??
    (state === "approved" && approvedDrift
      ? "Approved · changed since"
      : state === "overdue" && overdueDays != null && overdueDays > 0
        ? `Overdue ${overdueDays}d`
        : BILLING_STATE[state].label)
  return (
    <Badge
      size="sm"
      variant={BILLING_STATE[state].tone}
      title={reason}
      data-billing-state={state}
      className={cn(className)}
    >
      {labelText}
    </Badge>
  )
}
