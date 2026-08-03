"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BillingBalancerChrome } from "@/components/billing/BillingBalancerChrome"
import { EditableLineItemMonthInput } from "@/components/billing/EditableLineItemMonthInput"
import {
  applyBalancer,
  defaultBalancingMonth,
  distributeEvenly,
  isBillingBalancerEnabled,
  reassignBalancer,
} from "@/lib/billing/balancer"
import { scheduleMonthYearToIso } from "@/lib/finance/computeCampaignFinancials"
import { validateManualMediaMonthsSum } from "@/lib/finance/manualBillingOverridesUi"
import { formatAUD, roundMoney2 } from "@/lib/format/money"
import { prebillBadgeTooltip } from "@/lib/billing/prebillScope"
import { cn } from "@/lib/utils"

/** Inline keep/reset when override dateBasis no longer matches burst dates (was AlertDialog). */
export type LineDateBasisChoice = {
  /** Human labels / reasons for stale override(s) on this line. */
  labels: string[]
  onKeepTiming: () => void
  onResetToAuto: () => void
  /** PC4: optional preview copy when keep will re-anchor out-of-span months into the balancer. */
  balancerReanchorPreview?: string | null
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
  /** MB-8/MB-21: "Prepaid" | "Media prepaid" | with · saved|unsaved — same word as line / container pills. */
  prebillBadgeLabel?: string | null
  /** @deprecated Prefer prebillBadgeLabel */
  isPrepaid?: boolean
  /** Client-pays: media cells locked at $0; only fee timing is editable elsewhere. */
  clientPaysForMedia?: boolean
  /** When set, show keep/reset choice for stale flight dates (C3). */
  dateBasisChoice?: LineDateBasisChoice | null
  /** Optional auto amounts for Reset to auto under balancer mode. */
  getAutoAmount?: (mediaKey: string, lineItemId: string, monthYear: string) => number
  formatter: Intl.NumberFormat
  className?: string
}

/**
 * Per-line month inputs wired to the same manual-billing getter/setter as the Advanced spreadsheet.
 * Does not persist — parent Apply promotes pending; campaign save commits (MB-23).
 * When NEXT_PUBLIC_BILLING_BALANCER=on, one month is ⚖ balancing (computed, never typed).
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
  prebillBadgeLabel = null,
  isPrepaid = false,
  clientPaysForMedia = false,
  dateBasisChoice = null,
  getAutoAmount,
  formatter,
  className,
}: LineTimingInlineEditorProps) {
  const balancerOn = isBillingBalancerEnabled()
  const [draftByMonth, setDraftByMonth] = useState<Record<string, number | undefined>>({})
  const [balancingMonth, setBalancingMonth] = useState(() => defaultBalancingMonth(monthYears))

  useEffect(() => {
    setBalancingMonth((prev) =>
      monthYears.includes(prev) ? prev : defaultBalancingMonth(monthYears)
    )
  }, [monthYears])

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

  const balancer = useMemo(() => {
    if (!balancerOn) return null
    return applyBalancer({
      months: monthAmounts.map((m) => ({ month: m.monthYear, amount: m.amount })),
      balancingMonth,
      lineTotal: clientPaysForMedia ? 0 : expectedMediaTotal,
    })
  }, [balancerOn, monthAmounts, balancingMonth, expectedMediaTotal, clientPaysForMedia])

  const displayAmounts = balancer
    ? balancer.months.map((m) => ({ monthYear: m.month, amount: m.amount }))
    : monthAmounts

  const resolvedPrebillLabel: string | null =
    prebillBadgeLabel ?? (isPrepaid ? "Prepaid" : null)

  const runningTotal = roundMoney2(displayAmounts.reduce((s, m) => s + m.amount, 0))
  const gate = validateManualMediaMonthsSum(
    displayAmounts.map((m) => ({
      month: scheduleMonthYearToIso(m.monthYear),
      amount: m.amount,
    })),
    clientPaysForMedia ? 0 : expectedMediaTotal
  )
  const delta = gate.ok ? 0 : gate.delta
  const offByAbs = Math.abs(delta)

  const commitBalanced = (nextBalancing: string, typed: { month: string; amount: number }[]) => {
    const result = applyBalancer({
      months: typed,
      balancingMonth: nextBalancing,
      lineTotal: clientPaysForMedia ? 0 : expectedMediaTotal,
    })
    setBalancingMonth(result.balancingMonth)
    setDraftByMonth({})
    for (const m of result.months) {
      onCommit(mediaKey, lineItemId, m.month, String(m.amount))
    }
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
            reset to the new schedule.
          </p>
          {dateBasisChoice.balancerReanchorPreview ? (
            <p className="mt-1 text-[11px] font-medium opacity-95">
              {dateBasisChoice.balancerReanchorPreview}
            </p>
          ) : null}
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

      {balancerOn && balancer ? (
        <BillingBalancerChrome
          monthYears={monthYears}
          balancingMonth={balancer.balancingMonth}
          balancingAmount={balancer.balancingAmount}
          negativeBalancer={balancer.negativeBalancer}
          footerLabel={balancer.footerLabel}
          clientPaysForMedia={clientPaysForMedia}
          onReassign={(m) => {
            const typed = monthAmounts.map((x) => ({ month: x.monthYear, amount: x.amount }))
            const result = reassignBalancer(
              {
                months: typed,
                balancingMonth,
                lineTotal: clientPaysForMedia ? 0 : expectedMediaTotal,
              },
              m
            )
            commitBalanced(result.balancingMonth, result.months)
          }}
          onDistributeEvenly={() => {
            const result = distributeEvenly({
              months: monthAmounts.map((x) => ({ month: x.monthYear, amount: x.amount })),
              balancingMonth,
              lineTotal: clientPaysForMedia ? 0 : expectedMediaTotal,
            })
            commitBalanced(result.balancingMonth, result.months)
          }}
          onResetToAuto={() => {
            if (getAutoAmount) {
              const auto = monthYears.map((monthYear) => ({
                month: monthYear,
                amount: getAutoAmount(mediaKey, lineItemId, monthYear),
              }))
              commitBalanced(balancingMonth, auto)
            } else {
              setDraftByMonth({})
              onResetToAuto(mediaKey, lineItemId)
            }
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Months total{" "}
              <span className="num font-medium text-foreground">{formatAUD(runningTotal)}</span>
              {" / "}
              <span className="num">{formatAUD(expectedMediaTotal)}</span>
            </span>
            {gate.ok ? (
              <Badge
                variant="good"
                size="sm"
                className="rounded-pill font-medium"
                title="Month amounts sum to this line's media total"
              >
                Months match line
              </Badge>
            ) : (
              <Badge variant="blocking" size="sm" className="rounded-pill font-medium">
                Off by {formatAUD(offByAbs)} — fix before saving
              </Badge>
            )}
            {resolvedPrebillLabel ? (
              <Badge
                variant="attention"
                size="sm"
                className="rounded-pill font-medium"
                title={
                  resolvedPrebillLabel.includes("unsaved")
                    ? resolvedPrebillLabel.includes("differs from saved")
                      ? "Shown timing is unsaved and differs from saved billing overrides."
                      : "Manual billing timing is applied on this page but not yet saved with the plan."
                    : resolvedPrebillLabel.includes("saved")
                      ? "Manual billing timing is saved in billing overrides."
                      : prebillBadgeTooltip(
                          resolvedPrebillLabel.startsWith("Prepaid")
                            ? "Prepaid"
                            : "Media prepaid"
                        )
                }
              >
                {resolvedPrebillLabel}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {!resolvedPrebillLabel ? (
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
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {displayAmounts.map(({ monthYear, amount }) => {
          const isBalancer = balancerOn && monthYear === balancingMonth
          const locked = clientPaysForMedia || isBalancer
          return (
            <label key={monthYear} className="flex flex-col gap-0.5">
              <span className="truncate text-[11px] text-muted-foreground">
                {isBalancer ? `⚖ ${monthYear}` : monthYear}
              </span>
              <EditableLineItemMonthInput
                className={cn(
                  "h-8 w-full text-xs",
                  isBalancer && "bg-muted",
                  balancer?.negativeBalancer && isBalancer && "text-status-critical-fg"
                )}
                amount={amount}
                formatter={formatter}
                disabled={locked}
                onAmountChange={(n) => {
                  if (locked) return
                  setDraftByMonth((prev) => ({ ...prev, [monthYear]: n }))
                }}
                onCommit={(raw) => {
                  if (locked) return
                  if (balancerOn) {
                    const typed = monthAmounts.map((x) =>
                      x.monthYear === monthYear
                        ? { month: x.monthYear, amount: Number.parseFloat(raw) || 0 }
                        : { month: x.monthYear, amount: x.amount }
                    )
                    commitBalanced(balancingMonth, typed)
                    return
                  }
                  setDraftByMonth((prev) => {
                    const next = { ...prev }
                    delete next[monthYear]
                    return next
                  })
                  onCommit(mediaKey, lineItemId, monthYear, raw)
                }}
              />
            </label>
          )
        })}
      </div>
      {balancerOn && !isPrepaid ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              setDraftByMonth({})
              onPrebill(mediaKey, lineItemId)
            }}
          >
            ⚡ Prebill
          </Button>
        </div>
      ) : null}
    </div>
  )
}
