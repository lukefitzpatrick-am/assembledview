"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { PeriodBoard, type BoardMonthRow } from "@/components/finance/sections/periods/PeriodBoard"
import { PeriodDetail } from "@/components/finance/sections/periods/PeriodDetail"
import {
  PeriodConfirmDialog,
  type PeriodConfirmRequest,
} from "@/components/finance/sections/periods/PeriodConfirmDialog"
import { usePeriodsData } from "@/components/finance/sections/periods/usePeriodsData"
import {
  billingMonthsInAustralianFinancialYear,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"
import type { FinanceRunItem } from "@/lib/finance/periods/types"

export function PeriodsPageClient() {
  const applied = useFinanceScopeApplied()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sydneyMonth = getSydneyWallClock().periodMonth
  const selectedMonth = searchParams?.get("month") || sydneyMonth

  const { data, loading, error, busy, reload, postReview, runPeriod, lockPeriod } =
    usePeriodsData(selectedMonth)

  const [confirm, setConfirm] = useState<PeriodConfirmRequest | null>(null)

  const boardRows: BoardMonthRow[] = useMemo(() => {
    const months = billingMonthsInAustralianFinancialYear(
      referenceDateForFyStartYear(applied.fy)
    )
    const byMonth = new Map((data?.periods ?? []).map((p) => [p.periodMonth, p]))
    // Include any extra periods outside FY so nothing is orphaned.
    const extras = (data?.periods ?? [])
      .map((p) => p.periodMonth)
      .filter((m) => !months.includes(m))
    const all = [...months, ...extras].sort((a, b) => b.localeCompare(a))
    return all.map((periodMonth) => ({
      periodMonth,
      period: byMonth.get(periodMonth) ?? null,
    }))
  }, [applied.fy, data?.periods])

  const selectedPeriod =
    data?.periods.find((p) => p.periodMonth === selectedMonth) ?? null

  const selectMonth = (periodMonth: string) => {
    const p = new URLSearchParams(searchParams?.toString() ?? "")
    p.set("month", periodMonth)
    router.replace(`/finance/periods?${p.toString()}`, { scroll: false })
  }

  const openConfirm = (req: PeriodConfirmRequest) => setConfirm(req)

  const handleConfirm = async (payload: { reason?: string; adjustmentCents?: number }) => {
    if (!confirm) return
    let ok = false
    if (confirm.kind === "run") {
      ok = await runPeriod(selectedMonth)
    } else if (confirm.kind === "lock") {
      ok = await lockPeriod(selectedMonth)
    } else if (confirm.kind === "approve" && confirm.itemId != null) {
      ok = await postReview({
        action: "approve",
        periodMonth: selectedMonth,
        itemId: confirm.itemId,
      })
    } else if (confirm.kind === "adjust" && confirm.itemId != null) {
      ok = await postReview({
        action: "adjust",
        periodMonth: selectedMonth,
        itemId: confirm.itemId,
        reason: payload.reason,
        adjustmentCents: payload.adjustmentCents,
      })
    } else if (confirm.kind === "hold" && confirm.itemId != null) {
      ok = await postReview({
        action: "hold",
        periodMonth: selectedMonth,
        itemId: confirm.itemId,
        reason: payload.reason,
      })
    }
    if (ok) setConfirm(null)
  }

  const onApprove = (item: FinanceRunItem) =>
    openConfirm({
      kind: "approve",
      itemId: item.id,
      title: "Approve run item",
      consequence:
        "Approving marks this line ready for the lock workbook. Amount stays at its current effective value.",
    })

  const onAdjust = (item: FinanceRunItem) =>
    openConfirm({
      kind: "adjust",
      itemId: item.id,
      title: "Adjust run item",
      consequence:
        "Adjusting keeps the original booked amount and records an adjustment (cents) plus a mandatory reason on the run item.",
      requireReason: true,
      requireAdjustmentCents: true,
    })

  const onHold = (item: FinanceRunItem) =>
    openConfirm({
      kind: "hold",
      itemId: item.id,
      title: "Hold run item",
      consequence:
        "Holding parks this line out of the lock freeze until it is approved or adjusted. A reason is required.",
      requireReason: true,
    })

  return (
    <FinanceSectionsShell title="Periods">
      <div className="space-y-6">
        {data?.mode === "off" ? (
          <p className="rounded-input border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">FINANCE_PERIODS</span> is off. Board
            stays empty until the flag is <code className="text-xs">shadow</code> or{" "}
            <code className="text-xs">on</code>. Mutations remain admin-gated.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Mode: <span className="font-medium text-foreground">{data?.mode ?? "…"}</span> ·
            Mutations: run / approve / adjust / hold / lock (admin). Exclude, variance queue, and
            admin-amend are not exposed here.
          </p>
        )}

        {loading && !data ? <LoadingState rows={6} /> : null}

        {error ? (
          <ErrorState title="Periods failed to load" message={error} onRetry={reload} />
        ) : null}

        {data ? (
          <>
            <PeriodBoard
              rows={boardRows}
              selectedMonth={selectedMonth}
              onSelect={selectMonth}
            />
            <PeriodDetail
              periodMonth={selectedMonth}
              period={selectedPeriod}
              items={data.items}
              busy={busy}
              onRun={() =>
                openConfirm({
                  kind: "run",
                  title: "Run period",
                  consequence:
                    "Running rebuilds run items from published tip schedule_months (billing basis) for this month. Existing review statuses on matching natural keys are merged per PC5 merge rules.",
                })
              }
              onLock={() =>
                openConfirm({
                  kind: "lock",
                  title: "Lock period",
                  consequence:
                    "Locking snapshots client details and freezes amounts. Held items roll forward; the immutable workbook is archived to Blob.",
                })
              }
              onApprove={onApprove}
              onAdjust={onAdjust}
              onHold={onHold}
            />
          </>
        ) : null}

        <PeriodConfirmDialog
          open={confirm != null}
          request={confirm}
          busy={busy}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirm(null)
          }}
          onConfirm={(payload) => void handleConfirm(payload)}
        />
      </div>
    </FinanceSectionsShell>
  )
}
