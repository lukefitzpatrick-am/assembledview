import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import { prorateBurstFeesToMonths, type SeedBurstSource } from "@/lib/billing/seedLineFees"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { resolveLineDimensions } from "@/lib/finance/resolveLineDimensions"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { resolveProductionBurstBudget } from "@/lib/mediaplan/resolveProductionBurstBudget"

/**
 * Build per-month media and fee amounts for each container line item (billing or delivery).
 * Client-pays billing media is 0; fee months still come from {@link computeBurstAmounts}.
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
    const feeBurstSources: SeedBurstSource[] = []

    const bursts = resolveLineItemBursts(lineItem)

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
      const startDate = coerceBurstDateLocal(burst.startDate)
      const endDate = coerceBurstDateLocal(burst.endDate)
      if (!startDate || !endDate) return
      const budget = resolveProductionBurstBudget(burst).effectiveBudget

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

      // C-7: one fee engine — media/fee split via computeBurstAmounts (all 4 branches).
      const buyType = String(
        burst.buyType ??
          burst.buy_type ??
          (lineItem as any)?.buyType ??
          (lineItem as any)?.buy_type ??
          ""
      )
      const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
        rawBudget: budget,
        budgetIncludesFees,
        clientPaysForMedia: burstClientPaysForMedia,
        feePct,
        buyType,
      })
      const effectiveBudget = mode === "billing" ? mediaAmount : deliveryMediaAmount

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return

      // C-95: client-pays billing media is 0; still keep the line and prorate fee.
      if (effectiveBudget !== 0) {
        const shares = prorateAcrossMonths({
          amount: effectiveBudget,
          burstStart: startDate,
          burstEnd: endDate,
          monthKeys,
        })
        for (const monthKey of monthKeys) {
          monthlyAmounts[monthKey] += shares[monthKey] ?? 0
        }
      }
      if (feeAmount > 0) {
        feeBurstSources.push({
          startDate,
          endDate,
          feeAmount,
          clientPaysForMedia: burstClientPaysForMedia,
        })
      }
    })

    const totalAmount = Object.values(monthlyAmounts).reduce((sum, val) => sum + val, 0)
    const { feeMonthlyAmounts, totalFeeAmount } = prorateBurstFeesToMonths(
      feeBurstSources,
      monthKeys
    )
    const dimensions = resolveLineDimensions(mediaType, lineItem)
    lineItemsMap.set(itemId, {
      id: itemId,
      header1,
      header2,
      monthlyAmounts,
      totalAmount,
      ...dimensions,
      feeMonthlyAmounts,
      totalFeeAmount,
      feeAmount: totalFeeAmount,
      ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
    })
  })

  return Array.from(lineItemsMap.values())
}
