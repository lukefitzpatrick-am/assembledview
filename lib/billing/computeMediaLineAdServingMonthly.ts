import { computeAdServingCost } from "@/lib/billing/computeAdServingCost"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import { resolveLineNoAdserving } from "@/lib/billing/resolveLineNoAdserving"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"

/**
 * Editor-preview ad-serving monthly amounts for one media line.
 * Exclusion reads the LINE flag via {@link resolveLineNoAdserving} — never
 * `burst.noAdserving` from persisted bursts_json (that field is not an input).
 */
export function computeMediaLineAdServingMonthlyAmounts(opts: {
  lineItem: Record<string, unknown>
  bursts: unknown[]
  monthKeys: string[]
  mediaType: string
  getRateForMediaType: (mediaType: string) => number
  adservaudio?: number | null
}): { monthlyAmounts: Record<string, number>; totalAdServingAmount: number } {
  const {
    lineItem,
    bursts,
    monthKeys,
    mediaType,
    getRateForMediaType,
    adservaudio,
  } = opts

  const monthlyAmounts: Record<string, number> = {}
  for (const key of monthKeys) monthlyAmounts[key] = 0

  const noAdserving = resolveLineNoAdserving(lineItem)
  if (noAdserving) {
    return { monthlyAmounts, totalAdServingAmount: 0 }
  }

  for (const raw of bursts) {
    const burst = (raw ?? {}) as Record<string, unknown>
    const startDate = coerceBurstDateLocal(
      burst.startDate as string | Date | null | undefined
    )
    const endDate = coerceBurstDateLocal(
      burst.endDate as string | Date | null | undefined
    )
    if (!startDate || !endDate) continue

    const deliverables = Number(burst.deliverables || burst.calculatedValue || 0)
    if (deliverables <= 0) continue

    // Buy type is a LINE property on the server path (stamped onto BillingBurst).
    // Prefer burst when present (form bursts carry it); else line.
    const buyType = String(
      burst.buyType ??
        burst.buy_type ??
        lineItem.buyType ??
        lineItem.buy_type ??
        ""
    )

    const adServingForBurst = computeAdServingCost({
      quantity: deliverables,
      buyType,
      mediaType,
      rate: getRateForMediaType(mediaType),
      adservaudio,
      adServingRatePct:
        typeof burst.adServingRatePct === "number"
          ? burst.adServingRatePct
          : undefined,
      adServingImpressions:
        typeof burst.adServingImpressions === "number"
          ? burst.adServingImpressions
          : undefined,
    })

    const shares = prorateAcrossMonths({
      amount: adServingForBurst,
      burstStart: startDate,
      burstEnd: endDate,
      monthKeys,
    })
    for (const monthKey of monthKeys) {
      monthlyAmounts[monthKey] += shares[monthKey] ?? 0
    }
  }

  const totalAdServingAmount = Object.values(monthlyAmounts).reduce(
    (sum, val) => sum + val,
    0
  )
  return { monthlyAmounts, totalAdServingAmount }
}
