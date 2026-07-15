"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EditableLineItemMonthInput } from "@/components/billing/EditableLineItemMonthInput"
import { scheduleMonthYearToIso } from "@/lib/finance/computeCampaignFinancials"
import { validateManualMediaMonthsSum } from "@/lib/finance/manualBillingOverridesUi"
import { formatAUD, roundMoney2 } from "@/lib/format/money"
import { cn } from "@/lib/utils"

/** Inline keep/reset when override dateBasis no longer matches burst dates (was AlertDialog). */
export type LineDateBasisChoice = {
  /** Human labels / reasons for stale override(s) on this line. */
  labels: string[]
  onKeepTiming: () => void
  onResetToAuto: () => void
}

export type LineTimingInlineEditorProps = {
  mediaKey: string
  lineItemId: string
  /** Line media total the months must sum to (same basis as server sum gate). */
  expectedMediaTotal: number
  monthYears: string[]
  getAmount: (mediaKey: string, lineItemId: string, monthYear: string) => number
  onCommit: (mediaKey: string, lineItemId: string, monthYear: string, raw: string) => void
  onResetToAuto: (mediaKey: string, lineItemId: string) => void
  onPrebill: (mediaKey: string, lineItemId: string) => void
  isPrepaid?: boolean
  /** When set, show keep/reset choice for stale flight dates (C3). */
  dateBasisChoice?: LineDateBasisChoice | null
  formatter: Intl.NumberFormat
  className?: string
}

/**
 * Per-line month inputs wired to the same manual-billing getter/setter as the Advanced spreadsheet.
 * Does not persist — parent Apply/Save still calls persistManualBillingOverrides.
 */
export function LineTimingInlineEditor({
  mediaKey,
  lineItemId,
  expectedMediaTotal,
  monthYears,
  getAmount,
  onCommit,
  onResetToAuto,
  onPrebill,
  isPrepaid = false,
  dateBasisChoice = null,
  formatter,
  className,
}: LineTimingInlineEditorProps) {
  /** Local overlays while focused so the running total updates before blur commit. */
  const [draftByMonth, setDraftByMonth] = useState<Record<string, number | undefined>>({})

  const monthAmounts = useMemo(() => {
    return monthYears.map((monthYear) => {
      const committed = getAmount(mediaKey, lineItemId, monthYear)
      const draft = draftByMonth[monthYear]
      return {
        monthYear,
        amount: draft !== undefined ? draft : committed,
      }
    })
  }, [monthYears, getAmount, mediaKey, lineItemId, draftByMonth])

  const runningTotal = roundMoney2(monthAmounts.reduce((s, m) => s + m.amount, 0))
  const gate = validateManualMediaMonthsSum(
    monthAmounts.map((m) => ({
      month: scheduleMonthYearToIso(m.monthYear),
      amount: m.amount,
    })),
    expectedMediaTotal
  )
  const delta = gate.ok ? 0 : gate.delta
  const offByAbs = Math.abs(delta)

  return (
    <div
      className={cn(
        "mt-2 space-y-2 rounded-input border border-border bg-muted/20 px-2 py-2",
        className
      )}
    >
      {dateBasisChoice ? (
        <div
          role="status"
          className="rounded-input border border-status-attention-fg/20 bg-status-attention-bg px-2 py-2 text-status-attention-fg"
        >
          <p className="text-xs font-medium">Billing dates changed</p>
          <p className="mt-0.5 text-[11px] opacity-90">
            Flight dates moved since this override was set. Keep the current timing amounts, or
            reset to the new schedule.
          </p>
          {dateBasisChoice.labels.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-[11px]">
              {dateBasisChoice.labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={dateBasisChoice.onKeepTiming}
            >
              Keep timing
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setDraftByMonth({})
                dateBasisChoice.onResetToAuto()
              }}
            >
              Reset to auto
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            Months total{" "}
            <span className="num font-medium text-foreground">{formatAUD(runningTotal)}</span>
            {" / "}
            <span className="num">{formatAUD(expectedMediaTotal)}</span>
          </span>
          {gate.ok ? (
            <Badge variant="good" size="sm" className="rounded-pill font-medium">
              months = line media
            </Badge>
          ) : (
            <Badge variant="blocking" size="sm" className="rounded-pill font-medium">
              off by {formatAUD(offByAbs)} — fix before saving
            </Badge>
          )}
          {isPrepaid ? (
            <Badge variant="attention" size="sm" className="rounded-pill font-medium">
              Prepaid
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!isPrepaid ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftByMonth({})
                onPrebill(mediaKey, lineItemId)
              }}
            >
              ⚡ Prebill
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraftByMonth({})
              onResetToAuto(mediaKey, lineItemId)
            }}
          >
            Reset to auto
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {monthAmounts.map(({ monthYear, amount }) => (
          <label key={monthYear} className="flex flex-col gap-0.5">
            <span className="truncate text-[11px] text-muted-foreground">{monthYear}</span>
            <EditableLineItemMonthInput
              className="h-8 w-full text-xs"
              amount={amount}
              formatter={formatter}
              onAmountChange={(n) => {
                setDraftByMonth((prev) => ({ ...prev, [monthYear]: n }))
              }}
              onCommit={(raw) => {
                setDraftByMonth((prev) => {
                  const next = { ...prev }
                  delete next[monthYear]
                  return next
                })
                onCommit(mediaKey, lineItemId, monthYear, raw)
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
