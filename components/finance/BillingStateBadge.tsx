"use client"

import { Badge } from "@/components/ui/badge"
import type { BillingState } from "@/lib/finance/billingLifecycle"
import { cn } from "@/lib/utils"

const LABELS: Record<BillingState, string> = {
  ready: "Ready",
  approved: "Approved",
  sent_to_finance: "Sent to finance",
  drafted: "Drafted",
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
}

function variantFor(state: BillingState): "critical" | "success" | "secondary" {
  if (state === "overdue") return "critical"
  if (state === "paid") return "success"
  return "secondary"
}

export function BillingStateBadge({
  state,
  reason,
  approvedDrift,
  overdueDays,
  className,
}: {
  state: BillingState
  reason?: string
  approvedDrift?: boolean
  /** Owed ledger only — cards omit this and keep the bare "Overdue" label. */
  overdueDays?: number
  className?: string
}) {
  const label =
    state === "approved" && approvedDrift
      ? "Approved · changed since"
      : state === "overdue" && overdueDays != null && overdueDays > 0
        ? `Overdue ${overdueDays}d`
        : LABELS[state]
  return (
    <Badge
      size="sm"
      variant={variantFor(state)}
      title={reason}
      data-billing-state={state}
      className={cn(className)}
    >
      {label}
    </Badge>
  )
}
