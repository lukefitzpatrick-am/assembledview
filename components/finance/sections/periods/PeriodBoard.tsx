"use client"

import { Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { FinancePeriod } from "@/lib/finance/periods/types"
import { PeriodStatusChip } from "@/components/finance/sections/periods/PeriodStatusChip"
import {
  formatPeriodMonthLong,
  formatPeriodTs,
  PERIOD_STATUS_LADDER,
} from "@/components/finance/sections/periods/periodLabels"
import { cn } from "@/lib/utils"

export type BoardMonthRow = {
  periodMonth: string
  period: FinancePeriod | null
}

type Props = {
  rows: BoardMonthRow[]
  selectedMonth: string | null
  onSelect: (periodMonth: string) => void
}

export function PeriodBoard({ rows, selectedMonth, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_STATUS_LADDER.map((s) => (
          <PeriodStatusChip key={s} status={s} />
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-panel text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ran</th>
              <th className="px-3 py-2 font-medium">Locked</th>
              <th className="px-3 py-2 font-medium">Workbook</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ periodMonth, period }) => {
              const active = selectedMonth === periodMonth
              return (
                <tr
                  key={periodMonth}
                  className={cn(
                    "interactive-row border-b border-border/60 cursor-pointer",
                    active && "bg-primary/5"
                  )}
                  onClick={() => onSelect(periodMonth)}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground">
                      {formatPeriodMonthLong(periodMonth)}
                    </p>
                    <p className="num text-[11px] text-muted-foreground">{periodMonth}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    {period ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PeriodStatusChip status={period.status} />
                        {period.amendedAfterLock ? (
                          <Badge variant="attention" size="sm" className="rounded-pill">
                            Amended after lock
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No period row</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {period ? formatPeriodTs(period.ranAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {period?.lockedAt ? (
                      <div>
                        <p>{formatPeriodTs(period.lockedAt)}</p>
                        {period.lockedBy ? (
                          <p className="truncate text-[11px]">{period.lockedBy}</p>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {period?.sheetBlobPathname ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          window.location.href = `/api/finance/periods/sheet?periodMonth=${encodeURIComponent(periodMonth)}`
                        }}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        Download
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
