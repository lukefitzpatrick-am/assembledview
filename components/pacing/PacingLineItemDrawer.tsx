"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ProgressCard, type ProgressCardProps } from "@/components/dashboard/delivery/shared/ProgressCard"
import { KpiBand, type KpiBandProps } from "@/components/dashboard/delivery/shared/KpiBand"
import { LineItemDailyDeliveryChart } from "@/components/dashboard/delivery/shared/LineItemDailyDeliveryChart"
import { computeLineItemPacingDerived } from "@/components/pacing/pacingMetrics"
import { formatPacingAud, formatPacingPct1 } from "@/components/pacing/formatters"
import type { LineItemPacingDailyPoint, LineItemPacingRow } from "@/lib/xano/pacing-types"
import type { DeliveryStatus } from "@/components/dashboard/delivery/shared/statusColours"

export interface PacingLineItemDrawerProps {
  row: LineItemPacingRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  filterDateTo: string | undefined
  clientLabel: string
  /**
   * Per-line-item daily points (e.g. `historyById.get(av_line_item_id)`).
   * Chart shows cumulative spend vs linear expected-to-date; empty → placeholder.
   */
  pacingHistory?: LineItemPacingDailyPoint[]
}

function statusFromVariance(variancePct: number | null): DeliveryStatus {
  if (variancePct == null || !Number.isFinite(variancePct)) return "no-data"
  if (variancePct < -10) return "behind"
  if (variancePct > 10) return "ahead"
  return "on-track"
}

function buildPacingDrawerChartDaily(
  points: LineItemPacingDailyPoint[],
  expectedTotal: number
): Array<Record<string, string | number>> {
  const sorted = [...points].sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)))
  let cum = 0
  const n = sorted.length
  return sorted.map((p, i) => {
    cum += Number(p.spend ?? 0)
    const expectedCum =
      n > 0 && expectedTotal > 0 ? (expectedTotal * (i + 1)) / n : (cum * (i + 1)) / Math.max(1, i + 1)
    return {
      date: String(p.delivery_date).slice(0, 10),
      spend: cum,
      expected: expectedCum,
    }
  })
}

export function PacingLineItemDrawer({
  row,
  open,
  onOpenChange,
  filterDateTo,
  clientLabel,
  pacingHistory,
}: PacingLineItemDrawerProps) {
  const asOfDate = filterDateTo?.trim() || format(new Date(), "yyyy-MM-dd")

  const derived = useMemo(() => {
    if (!row) return null
    return computeLineItemPacingDerived(row, asOfDate)
  }, [row, asOfDate])

  const chartDaily = useMemo(() => {
    if (!row || !pacingHistory?.length) return []
    const expectedTotal = Number(row.expected_spend ?? row.budget_amount ?? 0)
    return buildPacingDrawerChartDaily(pacingHistory, expectedTotal)
  }, [row, pacingHistory])

  if (!row || !derived) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-2xl p-6" />
      </Sheet>
    )
  }

  const status = statusFromVariance(derived.variancePct)

  const spendCard: ProgressCardProps = {
    title: "Spend",
    value: formatPacingAud(derived.spend),
    detail: `Delivered ${formatPacingAud(derived.spend)} · Planned ${formatPacingAud(derived.budget)}`,
    progress: derived.budget > 0 ? derived.spend / derived.budget : 0,
    variance: derived.variancePct != null ? derived.variancePct / 100 : 0,
    varianceLabel: "vs expected pace",
    status,
    dense: true,
  }

  const deliveryCard: ProgressCardProps = {
    title: "Projected vs budget",
    value: formatPacingAud(derived.projectedTotal),
    detail: `Projected ${formatPacingAud(derived.projectedTotal)} · Budget ${formatPacingAud(derived.budget)}`,
    progress: derived.budget > 0 ? derived.projectedTotal / derived.budget : 0,
    variance: derived.budget > 0 ? (derived.projectedTotal - derived.budget) / derived.budget : 0,
    varianceLabel: "vs total budget",
    status,
    dense: true,
  }

  const kpiBand: KpiBandProps = {
    title: "Pacing KPIs",
    tiles: [
      {
        label: "Daily pace",
        value: formatPacingAud(derived.dailyPace),
      },
      {
        label: "Required daily",
        value: formatPacingAud(derived.requiredDaily),
        status: derived.requiredDaily > derived.dailyPace * 1.5 && derived.requiredDaily > 0 ? "behind" : "on-track",
      },
      {
        label: "% of budget",
        value: derived.pctOfBudget != null ? formatPacingPct1(derived.pctOfBudget) : "—",
      },
      {
        label: "Variance",
        value: derived.variancePct != null ? formatPacingPct1(derived.variancePct) : "—",
        status,
      },
    ],
  }

  const hasDaily = chartDaily.length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-2xl flex-col overflow-y-auto p-6 sm:max-w-2xl">
        <SheetHeader className="space-y-1 text-left">
          <p className="text-xs text-muted-foreground">{clientLabel}</p>
          <SheetTitle className="text-base">{row.av_line_item_label || row.av_line_item_id}</SheetTitle>
          {row.media_type ? (
            <p className="text-xs capitalize text-muted-foreground">{row.media_type}</p>
          ) : null}
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <ProgressCard {...spendCard} />
            <ProgressCard {...deliveryCard} />
          </div>

          <KpiBand {...kpiBand} />

          {hasDaily ? (
            <LineItemDailyDeliveryChart
              daily={chartDaily}
              series={[
                { key: "spend", label: "Spend" },
                { key: "expected", label: "Expected", yAxis: "left" },
              ]}
              asAtDate={filterDateTo?.trim() || null}
              title="Daily delivery"
              subtitle="Spend vs expected pace"
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
              Daily delivery data not available for this line item.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
