import { format } from "date-fns"
import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

/**
 * Build per-month media amounts for each container line item (billing or delivery mode).
 * Matches the media plan create flow; MBA edit extends this with fee/ad-serving fields elsewhere.
 */
export function generateBillingLineItems(
  mediaLineItems: any[],
  mediaType: string,
  months: BillingMonth[] | { monthYear: string }[],
  mode: "billing" | "delivery" = "billing"
): BillingLineItem[] {
  if (!mediaLineItems || mediaLineItems.length === 0) return []

  const lineItemsMap = new Map<string, BillingLineItem>()
  const monthKeys = months.map((m) => m.monthYear)

  mediaLineItems.forEach((lineItem, index) => {
    const { header1, header2 } = getScheduleHeaders(mediaType, lineItem)
    const itemId = `${mediaType}-${header1 || "Item"}-${header2 || "Details"}-${index}`
    const clientPaysForMedia = Boolean(
      (lineItem as any)?.client_pays_for_media ?? (lineItem as any)?.clientPaysForMedia
    )

    const monthlyAmounts: Record<string, number> = {}
    monthKeys.forEach((key) => {
      monthlyAmounts[key] = 0
    })

    let bursts: any[] = []
    if (typeof lineItem.bursts_json === "string") {
      try {
        bursts = JSON.parse(lineItem.bursts_json)
      } catch {
        bursts = []
      }
    } else if (Array.isArray(lineItem.bursts_json)) {
      bursts = lineItem.bursts_json
    } else if (Array.isArray(lineItem.bursts)) {
      bursts = lineItem.bursts
    }

    const inferredLineItemFeePct = (() => {
      const budgetIncludesFees = Boolean(
        (lineItem as any)?.budget_includes_fees ?? (lineItem as any)?.budgetIncludesFees
      )
      if (!budgetIncludesFees) return 0

      const parseMoney = (v: any) => parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0

      const sumRawBudgets = (bursts || []).reduce((sum: number, b: any) => {
        const raw = parseMoney(b?.budget) || parseMoney(b?.buyAmount)
        return sum + raw
      }, 0)

      const totalMediaRaw = (lineItem as any)?.totalMedia ?? (lineItem as any)?.total_media ?? 0
      const totalMedia = typeof totalMediaRaw === "number" ? totalMediaRaw : parseMoney(totalMediaRaw)

      if (sumRawBudgets <= 0) return 0
      const pct = (1 - totalMedia / sumRawBudgets) * 100
      return Math.max(0, Math.min(100, pct))
    })()

    bursts.forEach((burst: any) => {
      const startDate = new Date(burst.startDate)
      const endDate = new Date(burst.endDate)
      const budget =
        parseFloat(String(burst.budget ?? "").replace(/[^0-9.-]/g, "")) ||
        parseFloat(String(burst.buyAmount ?? "").replace(/[^0-9.-]/g, "")) ||
        0

      const feePctRaw =
        (burst.feePercentage ??
          burst.fee_percentage ??
          (lineItem as any)?.feePercentage ??
          (lineItem as any)?.fee_percentage) as any
      const feePctCandidate = Number(feePctRaw)
      const feePct = Number.isFinite(feePctCandidate)
        ? Math.max(0, Math.min(100, feePctCandidate))
        : inferredLineItemFeePct

      const budgetIncludesFees = Boolean(
        burst.budgetIncludesFees ??
          burst.budget_includes_fees ??
          (lineItem as any)?.budgetIncludesFees ??
          (lineItem as any)?.budget_includes_fees
      )
      const burstClientPaysForMedia = Boolean(
        burst.clientPaysForMedia ??
          burst.client_pays_for_media ??
          (lineItem as any)?.clientPaysForMedia ??
          (lineItem as any)?.client_pays_for_media ??
          clientPaysForMedia
      )

      const netMedia = budgetIncludesFees ? (budget * (100 - feePct)) / 100 : budget
      const effectiveBudget = mode === "billing" ? (burstClientPaysForMedia ? 0 : netMedia) : netMedia

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || effectiveBudget === 0) return

      const sLocalMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      const eLocalMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())

      const daysTotal =
        Math.round((eLocalMidnight.getTime() - sLocalMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1
      if (daysTotal <= 0) return

      let currentDate = new Date(sLocalMidnight.getFullYear(), sLocalMidnight.getMonth(), 1)
      const lastMonthCursor = new Date(eLocalMidnight.getFullYear(), eLocalMidnight.getMonth(), 1)

      while (currentDate <= lastMonthCursor) {
        const monthKey = format(currentDate, "MMMM yyyy")
        if (Object.prototype.hasOwnProperty.call(monthlyAmounts, monthKey)) {
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
          const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
          const sliceStartMs = Math.max(sLocalMidnight.getTime(), monthStart.getTime())
          const sliceEndMs = Math.min(eLocalMidnight.getTime(), monthEnd.getTime())
          const daysInMonth = Math.round((sliceEndMs - sliceStartMs) / (1000 * 60 * 60 * 24)) + 1
          if (daysInMonth > 0) {
            const share = effectiveBudget * (daysInMonth / daysTotal)
            monthlyAmounts[monthKey] += share
          }
        }
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
      }
    })

    const totalAmount = Object.values(monthlyAmounts).reduce((sum, val) => sum + val, 0)
    lineItemsMap.set(itemId, {
      id: itemId,
      header1,
      header2,
      monthlyAmounts,
      totalAmount,
      ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
    })
  })

  return Array.from(lineItemsMap.values())
}
