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
  className,
}: {
  state: BillingState
  reason?: string
  className?: string
}) {
  return (
    <Badge size="sm" variant={variantFor(state)} title={reason} className={cn(className)}>
      {LABELS[state]}
    </Badge>
  )
}
