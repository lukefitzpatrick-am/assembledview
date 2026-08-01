"use client"

import { Badge } from "@/components/ui/badge"
import type { FinancePeriodStatus, FinanceRunItemStatus } from "@/lib/finance/periods/types"
import {
  PERIOD_STATUS_LABEL,
  RUN_ITEM_STATUS_LABEL,
} from "@/components/finance/sections/periods/periodLabels"

const PERIOD_VARIANT: Record<
  FinancePeriodStatus,
  "secondary" | "attention" | "good" | "blocking"
> = {
  open: "secondary",
  pre_run_review: "attention",
  run: "attention",
  review: "attention",
  locked: "good",
  invoiced: "good",
  reconciled: "good",
}

const ITEM_VARIANT: Record<
  FinanceRunItemStatus,
  "secondary" | "attention" | "good" | "blocking"
> = {
  pending: "secondary",
  approved: "good",
  adjusted: "attention",
  held: "attention",
  excluded: "blocking",
  stale: "blocking",
}

export function PeriodStatusChip({ status }: { status: FinancePeriodStatus }) {
  return (
    <Badge variant={PERIOD_VARIANT[status]} size="sm" className="rounded-pill font-normal">
      {PERIOD_STATUS_LABEL[status]}
    </Badge>
  )
}

export function RunItemStatusChip({ status }: { status: FinanceRunItemStatus }) {
  return (
    <Badge variant={ITEM_VARIANT[status]} size="sm" className="rounded-pill font-normal">
      {RUN_ITEM_STATUS_LABEL[status]}
    </Badge>
  )
}
