"use client"

import { AlertTriangle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BillingAliasGhostLine } from "@/lib/billing/billingAliasGhostPairs"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type Props = {
  lines: readonly BillingAliasGhostLine[]
  /** The amount counted twice (sum of the old rows). */
  total: number
  /** Removes the old-id rows from this edit only. Hidden when unset or read-only. */
  onKeepCurrentRows?: () => void
  /** `rail`: the save-status card. `modal`: the MBA billing window, one row per pair with a chip. */
  variant?: "rail" | "modal"
  className?: string
}

/**
 * B20 ghost-row guard (switch `billing_ghost_row_guard`, decision Q16).
 * Names each line whose old id and current id both carry money in a month,
 * with both amounts. Display only: the parent owns the check and the save stop.
 */
export function BillingAliasDuplicateNotice({
  lines,
  total,
  onKeepCurrentRows,
  variant = "rail",
  className,
}: Props) {
  if (lines.length === 0) return null
  return (
    <div
      role="alert"
      data-billing-alias-duplicates={variant}
      className={cn(
        "rounded-card border border-status-attention-fg/20 bg-status-attention-bg px-4 py-3 text-status-attention-fg",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold">Duplicate billing rows</p>
          <p className="text-sm opacity-90">
            The saved billing holds an old line id and its current id for {lines.length === 1 ? "one line" : `${lines.length} lines`},
            so {formatMoney(total)} is counted twice. Save is stopped until you keep the current rows.
          </p>
          <ul className="space-y-1.5 text-sm">
            {lines.map((line) => (
              <li
                key={`${line.mediaKey}:${line.oldId}:${line.currentId}`}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span className="break-all font-medium">{line.oldId}</span>
                <Badge variant="attention" className="px-2 py-0 text-xs">
                  Duplicate of {line.currentId}
                </Badge>
                {variant === "modal" ? (
                  <span className="w-full text-xs opacity-90">
                    {line.months
                      .map((m) => `${m.monthYear}: ${formatMoney(m.oldAmount)} and ${formatMoney(m.currentAmount)}`)
                      .join(" · ")}
                  </span>
                ) : (
                  <span className="text-xs opacity-90">
                    {formatMoney(line.oldTotal)} over {line.months.length === 1 ? "1 month" : `${line.months.length} months`}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {onKeepCurrentRows ? (
            <div className="space-y-1">
              <Button type="button" variant="secondary" size="sm" onClick={onKeepCurrentRows}>
                Keep the current rows
              </Button>
              <p className="text-xs opacity-90">
                Removes the old-id rows from this edit only. Saved billing doesn&apos;t change until you save; the save
                writes the schedule from the plan lines.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
