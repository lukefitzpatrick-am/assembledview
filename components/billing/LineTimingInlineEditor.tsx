"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EditableLineItemMonthInput } from "@/components/billing/EditableLineItemMonthInput"
import {
  computeBalancerAmount,
  distributeEvenlyWithBalancer,
  isNegativeBalancer,
  pickDefaultBalancerMonth,
} from "@/lib/finance/billingBalancer"
import { isPlanCBalancerEnabled } from "@/lib/finance/planCBalancerFlag"
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
  /**
   * Plan C S2b — keep manual month shape; residual lands on balancer.
   * Preview months shown before confirm when provided.
   */
  onKeepShapePlusDelta?: () => void
  keepShapePlusDeltaPreview?: Array<{ month: string; amount: number }>
}

export type LineTimingInlineEditorProps = {
  mediaKey: string
  lineItemId: string
  /** Line media total the months must sum to (same basis as server sum gate). */
  expectedMediaTotal: number
  monthYears: string[]
  getAmount: (mediaKey: string, lineItemId: string, monthYear: string) => number
  /** Auto/reference amount per month — used to pick default balancer. */
  getAutoAmount?: (mediaKey: string, lineItemId: string, monthYear: string) => number
  onCommit: (mediaKey: string, lineItemId: string, monthYear: string, raw: string) => void
  onResetToAuto: (mediaKey: string, lineItemId: string) => void
  onPrebill: (mediaKey: string, lineItemId: string) => void
  /** Fired when balancer month changes (ISO) so persist can stamp source=balancing. */
  onBalancerMonthChange?: (
    mediaKey: string,
    lineItemId: string,
    balancerMonthIso: string
  ) => void
  isPrepaid?: boolean
  /** When set, show keep/reset choice for stale flight dates (C3). */
  dateBasisChoice?: LineDateBasisChoice | null
  formatter: Intl.NumberFormat
  className?: string
  /** Test / Storybook override for NEXT_PUBLIC_PLANC_BALANCER. */
  balancerEnabled?: boolean
}

/**
 * Per-line month inputs wired to the same manual-billing getter/setter as the Advanced spreadsheet.
 * Does not persist — parent Apply/Save still calls persistManualBillingOverrides.
 *
 * When NEXT_PUBLIC_PLANC_BALANCER=on: one month is the ⚖ balancer (read-only residual).
 */
export function LineTimingInlineEditor({
  mediaKey,
  lineItemId,
  expectedMediaTotal,
  monthYears,
  getAmount,
  getAutoAmount,
  onCommit,
  onResetToAuto,
  onPrebill,
  onBalancerMonthChange,
  isPrepaid = false,
  dateBasisChoice = null,
  formatter,
  className,
  balancerEnabled: balancerEnabledProp,
}: LineTimingInlineEditorProps) {
  const balancerOn =
    balancerEnabledProp !== undefined
      ? balancerEnabledProp
      : isPlanCBalancerEnabled()

  /** Local overlays while focused so the running total updates before blur commit. */
  const [draftByMonth, setDraftByMonth] = useState<Record<string, number | undefined>>({})
  const [balancerMonthOverride, setBalancerMonthOverride] = useState<string | null>(null)

  const defaultBalancerMonth = useMemo(() => {
    if (!balancerOn || monthYears.length === 0) return null
    const autoAmountByMonth: Record<string, number> = {}
    for (const my of monthYears) {
      autoAmountByMonth[my] = getAutoAmount
        ? getAutoAmount(mediaKey, lineItemId, my)
        : getAmount(mediaKey, lineItemId, my)
    }
    return pickDefaultBalancerMonth({ monthYears, autoAmountByMonth })
  }, [balancerOn, mediaKey, lineItemId, monthYears, getAutoAmount, getAmount])

  const balancerMonth =
    balancerOn
      ? balancerMonthOverride && monthYears.includes(balancerMonthOverride)
        ? balancerMonthOverride
        : defaultBalancerMonth
      : null

  useEffect(() => {
    if (!balancerOn || !balancerMonth) return
    const iso = scheduleMonthYearToIso(balancerMonth)
    if (iso) onBalancerMonthChange?.(mediaKey, lineItemId, iso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balancerOn, mediaKey, lineItemId, balancerMonth])

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

  const amountsByMonth = useMemo(() => {
    const m: Record<string, number> = {}
    for (const row of monthAmounts) m[row.monthYear] = row.amount
    return m
  }, [monthAmounts])

  const balancerAmount =
    balancerOn && balancerMonth
      ? computeBalancerAmount({
          lineTotal: expectedMediaTotal,
          amountsByMonth,
          balancerMonth,
        })
      : null

  const displayAmounts = useMemo(() => {
    if (!balancerOn || !balancerMonth || balancerAmount == null) return monthAmounts
    return monthAmounts.map((row) =>
      row.monthYear === balancerMonth ? { ...row, amount: balancerAmount } : row
    )
  }, [balancerOn, balancerMonth, balancerAmount, monthAmounts])

  const runningTotal = roundMoney2(
    displayAmounts.reduce((s, m) => s + m.amount, 0)
  )
  const gate = validateManualMediaMonthsSum(
    displayAmounts.map((m) => ({
      month: scheduleMonthYearToIso(m.monthYear),
      amount: m.amount,
    })),
    expectedMediaTotal
  )
  // With balancer on, sum is definitionally exact (±cent) — never show ✗
  const gateOk = balancerOn ? true : gate.ok
  const delta = gate.ok ? 0 : gate.delta
  const offByAbs = Math.abs(delta)
  const negativeBal =
    balancerOn && balancerAmount != null && isNegativeBalancer(balancerAmount)

  const commitBalancer = (nextAmounts: Record<string, number>, bal: string) => {
    const balAmt = computeBalancerAmount({
      lineTotal: expectedMediaTotal,
      amountsByMonth: nextAmounts,
      balancerMonth: bal,
    })
    onCommit(mediaKey, lineItemId, bal, String(balAmt))
    const iso = scheduleMonthYearToIso(bal)
    if (iso) onBalancerMonthChange?.(mediaKey, lineItemId, iso)
  }

  const handleNonBalancerCommit = (monthYear: string, raw: string) => {
    const numeric = parseFloat(String(raw).replace(/[^0-9.-]/g, ""))
    const n = Number.isFinite(numeric) ? numeric : 0
    setDraftByMonth((prev) => {
      const next = { ...prev }
      delete next[monthYear]
      return next
    })
    onCommit(mediaKey, lineItemId, monthYear, raw)
    if (balancerOn && balancerMonth) {
      const nextAmounts = { ...amountsByMonth, [monthYear]: n }
      // Don't include stale balancer draft
      delete nextAmounts[balancerMonth]
      commitBalancer(nextAmounts, balancerMonth)
    }
  }

  const handleDistributeEvenly = () => {
    if (!balancerMonth) return
    const distributed = distributeEvenlyWithBalancer({
      lineTotal: expectedMediaTotal,
      monthYears,
      balancerMonth,
    })
    setDraftByMonth({})
    for (const my of monthYears) {
      if (my === balancerMonth) continue
      onCommit(mediaKey, lineItemId, my, String(distributed[my] ?? 0))
    }
    commitBalancer(distributed, balancerMonth)
  }

  const handleMoveBalancer = (monthYear: string) => {
    if (!balancerOn || monthYear === balancerMonth) return
    // Materialise current balancer amount into the old balancer cell as editable, then switch
    if (balancerMonth && balancerAmount != null) {
      onCommit(mediaKey, lineItemId, balancerMonth, String(balancerAmount))
    }
    setBalancerMonthOverride(monthYear)
    const nextAmounts = { ...amountsByMonth }
    if (balancerMonth && balancerAmount != null) {
      nextAmounts[balancerMonth] = balancerAmount
    }
    delete nextAmounts[monthYear]
    commitBalancer(nextAmounts, monthYear)
  }

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
            reset to the new schedule
            {balancerOn && dateBasisChoice.onKeepShapePlusDelta
              ? ", or keep shape and put the delta on the balancer month"
              : ""}
            .
          </p>
          {dateBasisChoice.labels.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-[11px]">
              {dateBasisChoice.labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : null}
          {balancerOn &&
          dateBasisChoice.keepShapePlusDeltaPreview &&
          dateBasisChoice.keepShapePlusDeltaPreview.length > 0 ? (
            <div className="mt-2 rounded-input border border-border bg-card px-2 py-1.5 text-[11px] text-foreground">
              <p className="font-medium">Keep shape + delta preview</p>
              <ul className="mt-1 space-y-0.5">
                {dateBasisChoice.keepShapePlusDeltaPreview.map((m) => (
                  <li key={m.month} className="flex justify-between gap-2">
                    <span>{m.month}</span>
                    <span className="num">{formatAUD(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
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
            {balancerOn && dateBasisChoice.onKeepShapePlusDelta ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={dateBasisChoice.onKeepShapePlusDelta}
              >
                Keep shape + delta
              </Button>
            ) : null}
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
            Months{" "}
            <span className="num font-medium text-foreground">{formatAUD(runningTotal)}</span>
            {" / line "}
            <span className="num">{formatAUD(expectedMediaTotal)}</span>
            {balancerOn ? (
              <span className="ml-1 text-status-good-fg" aria-hidden>
                ✓
              </span>
            ) : null}
          </span>
          {gateOk ? (
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
          {balancerOn ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleDistributeEvenly}>
              Distribute evenly
            </Button>
          ) : null}
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
      {negativeBal ? (
        <p className="text-xs text-destructive" role="status">
          Negative month — usually wrong
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {displayAmounts.map(({ monthYear, amount }) => {
          const isBal = balancerOn && balancerMonth === monthYear
          return (
            <label key={monthYear} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                {isBal ? <span aria-hidden>⚖</span> : null}
                <span className="truncate">{monthYear}</span>
                {balancerOn && !isBal ? (
                  <button
                    type="button"
                    className="ml-auto shrink-0 text-[10px] text-primary underline-offset-2 hover:underline"
                    onClick={() => handleMoveBalancer(monthYear)}
                  >
                    Move balancer
                  </button>
                ) : null}
              </span>
              {isBal ? (
                <div
                  className={cn(
                    "flex h-8 items-center justify-end rounded-input border border-border bg-muted/40 px-2 text-xs num",
                    negativeBal && "border-destructive text-destructive"
                  )}
                  aria-readonly="true"
                  title="Balancer month — equals line total minus other months"
                >
                  {formatAUD(amount)}
                </div>
              ) : (
                <EditableLineItemMonthInput
                  className="h-8 w-full text-xs"
                  amount={amount}
                  formatter={formatter}
                  onAmountChange={(n) => {
                    setDraftByMonth((prev) => ({ ...prev, [monthYear]: n }))
                  }}
                  onCommit={(raw) => handleNonBalancerCommit(monthYear, raw)}
                />
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
