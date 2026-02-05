import type { BillingMonth } from "@/lib/billing/types"

export type PartialMbaValues = {
  mediaTotals: Record<string, number>
  grossMedia: number
  assembledFee: number
  adServing: number
  production: number
}

export function parseCurrency(value: string | number | undefined | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const numeric = parseFloat(String(value).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(numeric) ? numeric : 0
}

export function computePartialMbaOverridesFromDeliveryMonths(params: {
  deliveryMonths: BillingMonth[]
  selectedMonthYears: readonly string[]
  mediaKeys: readonly string[]
  enabledMedia?: Record<string, boolean>
}): PartialMbaValues {
  const { deliveryMonths, selectedMonthYears, mediaKeys, enabledMedia } = params

  const selectedSet = new Set(selectedMonthYears)
  const selected = selectedMonthYears.length
    ? deliveryMonths.filter((m) => selectedSet.has(m.monthYear))
    : deliveryMonths

  const mediaTotals: Record<string, number> = {}
  for (const key of mediaKeys) {
    let sum = 0
    for (const month of selected) {
      sum += parseCurrency(month.mediaCosts?.[key as keyof typeof month.mediaCosts] as any)
    }
    if (enabledMedia && enabledMedia[key] === false) sum = 0
    mediaTotals[key] = sum
  }

  const grossMedia = Object.values(mediaTotals).reduce((acc, v) => acc + v, 0)
  const assembledFee = selected.reduce((acc, m) => acc + parseCurrency(m.feeTotal), 0)
  const adServing = selected.reduce((acc, m) => acc + parseCurrency(m.adservingTechFees), 0)
  const production = selected.reduce((acc, m) => acc + parseCurrency(m.production), 0)

  return { mediaTotals, grossMedia, assembledFee, adServing, production }
}

