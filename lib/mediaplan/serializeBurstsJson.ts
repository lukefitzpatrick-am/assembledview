import { formatMoney, parseMoneyInput, type MoneyFormatOptions } from "@/lib/format/money"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"

const MONEY_FORMAT_OPTIONS: MoneyFormatOptions = {
  locale: "en-AU",
  currency: "AUD",
}

export type SerializedBurst = {
  budget: string
  buyAmount: string
  startDate: string
  endDate: string
  calculatedValue: number
  mediaAmount: string
  feeAmount: string
}

type BurstInput = {
  budget?: string | number
  buyAmount?: string | number
  startDate?: Date | string
  endDate?: Date | string
  calculatedValue?: number
}

function formatStringOrMoney(value: string | number | undefined): string {
  if (typeof value === "string") return value.trim() ? value : ""
  if (typeof value === "number") return formatMoney(value, MONEY_FORMAT_OPTIONS)
  return ""
}

function formatBurstDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return ""
}

/**
 * Sourcing the JSON `mediaAmount` from deliveryMediaAmount (not mediaAmount)
 * is INTENTIONAL: bursts_json represents the PLANNED media value of the
 * burst, not the agency-invoiced amount. When clientPaysForMedia is true,
 * computeBurstAmounts().mediaAmount is 0 (agency invoices 0 media), but the
 * planned media value (deliveryMediaAmount) is still real. We persist the
 * planning value so the JSON matches what the user sees in the burst grid.
 */
export function serializeBurstsJson(input: {
  bursts: ReadonlyArray<BurstInput>
  feePct: number
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
}): SerializedBurst[] {
  return input.bursts.map((burst) => {
    const rawBudget = parseMoneyInput(burst.budget) ?? 0
    const amounts = computeBurstAmounts({
      rawBudget,
      budgetIncludesFees: input.budgetIncludesFees,
      clientPaysForMedia: input.clientPaysForMedia,
      feePct: input.feePct,
    })

    return {
      budget: formatStringOrMoney(burst.budget),
      buyAmount: formatStringOrMoney(burst.buyAmount),
      startDate: formatBurstDate(burst.startDate),
      endDate: formatBurstDate(burst.endDate),
      calculatedValue: burst.calculatedValue ?? 0,
      mediaAmount: formatMoney(amounts.deliveryMediaAmount, MONEY_FORMAT_OPTIONS),
      feeAmount: formatMoney(amounts.feeAmount, MONEY_FORMAT_OPTIONS),
    }
  })
}
