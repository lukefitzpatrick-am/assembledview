"use client"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { FinancePeriod, FinanceRunItem } from "@/lib/finance/periods/types"
import { effectiveAmountCents } from "@/lib/finance/periods/reviewItem"
import { formatAUD } from "@/lib/format/money"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import {
  PeriodStatusChip,
  RunItemStatusChip,
} from "@/components/finance/sections/periods/PeriodStatusChip"
import {
  formatPeriodMonthLong,
  formatPeriodTs,
} from "@/components/finance/sections/periods/periodLabels"
import { Badge } from "@/components/ui/badge"

function clientLabel(item: FinanceRunItem): string {
  const snap = item.clientSnapshotJson
  if (snap?.clientName) return snap.clientName
  if (snap?.legalBusinessName) return snap.legalBusinessName
  if (item.clientId != null) return `Client ${item.clientId}`
  return "—"
}

function lineageLabel(item: FinanceRunItem): string {
  const parts: string[] = []
  if (item.rolledFromItemId != null) parts.push(`rolled from #${item.rolledFromItemId}`)
  if (item.linkedVarianceFromItemId != null) {
    parts.push(`variance from #${item.linkedVarianceFromItemId}`)
  }
  return parts.length ? parts.join(" · ") : "—"
}

type Props = {
  periodMonth: string
  period: FinancePeriod | null
  items: FinanceRunItem[]
  busy?: boolean
  onRun: () => void
  onLock: () => void
  onApprove: (item: FinanceRunItem) => void
  onAdjust: (item: FinanceRunItem) => void
  onHold: (item: FinanceRunItem) => void
}

export function PeriodDetail({
  periodMonth,
  period,
  items,
  busy,
  onRun,
  onLock,
  onApprove,
  onAdjust,
  onHold,
}: Props) {
  const monthLabel = formatPeriodMonthLong(periodMonth)
  const locked =
    period?.status === "locked" ||
    period?.status === "invoiced" ||
    period?.status === "reconciled"

  if (!period) {
    const monthName = new Date(`${periodMonth}-01T00:00:00`).toLocaleString("en-AU", {
      month: "long",
    })
    return (
      <EmptyState
        title={`No run has been created for ${monthName}`}
        message={`There is no finance_periods row for ${periodMonth}. Use Run to create the period and collect run items from published tip schedules.`}
        action={
          <Button type="button" size="sm" disabled={busy} onClick={onRun}>
            Run period
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface-panel px-4 py-3 shadow-e1">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{monthLabel}</h2>
            <PeriodStatusChip status={period.status} />
            {period.amendedAfterLock ? (
              <Badge variant="attention" size="sm" className="rounded-pill">
                Amended after lock
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Ran {formatPeriodTs(period.ranAt)}
            {period.lockedAt
              ? ` · Locked ${formatPeriodTs(period.lockedAt)}${
                  period.lockedBy ? ` by ${period.lockedBy}` : ""
                }`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || locked} onClick={onRun}>
            Run
          </Button>
          <Button type="button" size="sm" disabled={busy || locked} onClick={onLock}>
            Lock
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-card border border-border bg-card shadow-e1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>MBA</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Adjustment</TableHead>
              <TableHead>Hold</TableHead>
              <TableHead>Lineage</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  Period exists but has no run items yet. Run to collect from schedules.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm capitalize">{item.source}</TableCell>
                  <TableCell className="text-sm">{clientLabel(item)}</TableCell>
                  <TableCell className="num text-xs">{item.mbaNumber || "—"}</TableCell>
                  <TableCell className="num text-right text-sm">
                    {formatAUD(effectiveAmountCents(item) / 100)}
                    <p className="text-[10px] text-muted-foreground">
                      base {formatAUD(item.amountCents / 100)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <RunItemStatusChip status={item.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.adjustmentCents != null && item.status === "adjusted" ? (
                      <div>
                        <p className="num">{item.adjustmentCents}¢</p>
                        <p className="max-w-[10rem] truncate" title={item.adjustmentReason ?? ""}>
                          {item.adjustmentReason}
                        </p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs text-muted-foreground">
                    {item.holdReason || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lineageLabel(item)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={busy || locked || item.status === "approved"}
                        onClick={() => onApprove(item)}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={busy || locked}
                        onClick={() => onAdjust(item)}
                      >
                        Adjust
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={busy || locked || item.status === "held"}
                        onClick={() => onHold(item)}
                      >
                        Hold
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
