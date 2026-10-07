import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { grossFromNet, netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { parseMoney } from "@/lib/money/parse"
import { sumCents, toCents } from "@/lib/money/cents"

export { computeBurstAmounts, grossFromNet, netFromGross }

export type LineTotalsContext = {
  feePct: number
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
}

type BurstMoney = {
  budget?: unknown
  buyType?: string
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
  adServingAmount?: unknown
}

type LineMoney = {
  bursts?: BurstMoney[]
  buyType?: string
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
}

export type LineTotals = {
  mediaCents: number
  feeCents: number
  totalCents: number
  deliverableMediaCents: number
  clientPaysMediaCents: number
  adServingCents?: number
}

function flag(value: unknown): boolean {
  return value === true || value === "true"
}

function burstBudget(burst: BurstMoney): number | null {
  if (typeof burst.budget === "number") return Number.isFinite(burst.budget) ? burst.budget : null
  return parseMoney(burst.budget)
}

/**
 * Sums a line's bursts through computeBurstAmounts, in cents.
 * A 100% fee on a net budget yields a finite fee of 0 (the divide-by-zero guard).
 */
export function lineTotals(line: LineMoney, ctx: LineTotalsContext): LineTotals {
  const media: number[] = []
  const fee: number[] = []
  const total: number[] = []
  const deliverable: number[] = []
  const clientPays: number[] = []
  const adServing: number[] = []
  let sawAdServing = false

  for (const burst of line.bursts ?? []) {
    const budget = burstBudget(burst)
    if (budget == null) continue
    const clientPaysForMedia = flag(burst.clientPaysForMedia) || flag(line.clientPaysForMedia) || flag(ctx.clientPaysForMedia)
    const amounts = computeBurstAmounts({
      rawBudget: budget,
      budgetIncludesFees:
        flag(burst.budgetIncludesFees) || flag(line.budgetIncludesFees) || flag(ctx.budgetIncludesFees),
      clientPaysForMedia,
      feePct: ctx.feePct,
      buyType: burst.buyType ?? line.buyType,
    })
    media.push(toCents(amounts.mediaAmount))
    fee.push(toCents(amounts.feeAmount))
    total.push(toCents(amounts.totalAmount))
    deliverable.push(toCents(amounts.deliveryMediaAmount))
    clientPays.push(clientPaysForMedia ? toCents(amounts.deliveryMediaAmount) : 0)
    const serving = typeof burst.adServingAmount === "number" ? burst.adServingAmount : parseMoney(burst.adServingAmount)
    if (serving != null) {
      sawAdServing = true
      adServing.push(toCents(serving))
    }
  }

  return {
    mediaCents: sumCents(media),
    feeCents: sumCents(fee),
    totalCents: sumCents(total),
    deliverableMediaCents: sumCents(deliverable),
    clientPaysMediaCents: sumCents(clientPays),
    ...(sawAdServing ? { adServingCents: sumCents(adServing) } : {}),
  }
}

export function campaignTotals(lines: LineMoney[], ctx: LineTotalsContext): LineTotals {
  const parts = lines.map((line) => lineTotals(line, ctx))
  const sawAdServing = parts.some((part) => part.adServingCents != null)
  return {
    mediaCents: sumCents(parts.map((part) => part.mediaCents)),
    feeCents: sumCents(parts.map((part) => part.feeCents)),
    totalCents: sumCents(parts.map((part) => part.totalCents)),
    deliverableMediaCents: sumCents(parts.map((part) => part.deliverableMediaCents)),
    clientPaysMediaCents: sumCents(parts.map((part) => part.clientPaysMediaCents)),
    ...(sawAdServing
      ? { adServingCents: sumCents(parts.map((part) => part.adServingCents ?? 0)) }
      : {}),
  }
}
