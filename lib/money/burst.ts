import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { grossFromNet, netFromGross } from "@/lib/mediaplan/deliverableBudget"
import { fromCents, sumCents, toCents } from "@/lib/money/cents"
import { parseMoney } from "@/lib/money/parse"

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
  /** Schedule media type. Production is its own bucket, same rule as computeCampaignFinancials. */
  mediaType?: string
}

export type LineTotals = {
  mediaCents: number
  feeCents: number
  totalCents: number
  deliverableMediaCents: number
  clientPaysMediaCents: number
  productionCents: number
  adServingCents?: number
}

/** Same token fold as normaliseScheduleMediaType. Only the production alias leaves media. */
function isProductionMediaType(mediaType: string | undefined): boolean {
  return String(mediaType ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "") === "production"
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
  const production: number[] = []
  const fee: number[] = []
  const total: number[] = []
  const deliverable: number[] = []
  const clientPays: number[] = []
  const adServing: number[] = []
  let sawAdServing = false
  const productionLine = isProductionMediaType(line.mediaType)

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
    const billedMediaCents = toCents(amounts.mediaAmount)
    if (productionLine) production.push(billedMediaCents)
    else media.push(billedMediaCents)
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
    productionCents: sumCents(production),
    ...(sawAdServing ? { adServingCents: sumCents(adServing) } : {}),
  }
}

export type DisplayLineTotals = {
  /** Billed media plus planned media the client pays the publisher. */
  mediaCents: number
  feeCents: number
  /** Shown media plus fee. Not `totalCents` from lineTotals, which drops client-paid media. */
  totalCents: number
  clientPaid: boolean
  /** A 100% fee on a net budget. Fee cents stay 0. */
  invalidNetFee: boolean
}

function flagged(value: unknown): boolean {
  return value === true || value === "true"
}

/**
 * What a card cell or title shows. Money still comes from lineTotals.
 * Bonus and package inclusions stay at zero. Package is not zeroed.
 */
export function displayLineTotals(line: LineMoney, ctx: LineTotalsContext): DisplayLineTotals {
  const totals = lineTotals(line, ctx)
  const clientPaid =
    flagged(ctx.clientPaysForMedia) ||
    flagged(line.clientPaysForMedia) ||
    (line.bursts ?? []).some((burst) => flagged(burst.clientPaysForMedia))
  const includesFees =
    flagged(ctx.budgetIncludesFees) ||
    flagged(line.budgetIncludesFees) ||
    (line.bursts ?? []).some((burst) => flagged(burst.budgetIncludesFees))
  const mediaCents = totals.mediaCents + totals.clientPaysMediaCents
  return {
    mediaCents,
    feeCents: totals.feeCents,
    totalCents: mediaCents + totals.feeCents,
    clientPaid,
    invalidNetFee: ctx.feePct === 100 && !includesFees,
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
    productionCents: sumCents(parts.map((part) => part.productionCents)),
    ...(sawAdServing
      ? { adServingCents: sumCents(parts.map((part) => part.adServingCents ?? 0)) }
      : {}),
  }
}

export type ChannelSummarySourceBurst = {
  budget?: unknown
  buyType?: string | null
  budgetIncludesFees?: boolean | string | null
  clientPaysForMedia?: boolean | string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export type ChannelSummarySourceLine = {
  buyType?: string | null
  budgetIncludesFees?: boolean | string | null
  clientPaysForMedia?: boolean | string | null
  bursts?: readonly ChannelSummarySourceBurst[] | null
}

export type ChannelSummaryBurst = {
  amount: number
  start: Date | string
  end: Date | string
}

export type ChannelSummaryLine = {
  media: number
  fee: number
  totalCost: number
  bursts: ChannelSummaryBurst[]
}

export type ChannelSummaryTotals = {
  lines: ChannelSummaryLine[]
  overallMedia: number
  overallFee: number
  overallCost: number
}

function optionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined
  return value
}

function optionalFlag(value: boolean | string | null | undefined): boolean | undefined {
  if (value == null) return undefined
  return value === true || value === "true"
}

function burstSpan(value: Date | string | null | undefined): Date | string {
  if (value instanceof Date || typeof value === "string") return value
  return ""
}

function toLineMoney(line: ChannelSummarySourceLine, bursts = line.bursts): LineMoney {
  return {
    buyType: optionalText(line.buyType),
    budgetIncludesFees: optionalFlag(line.budgetIncludesFees),
    clientPaysForMedia: optionalFlag(line.clientPaysForMedia),
    bursts: (bursts ?? []).map((burst) => ({
      budget: burst.budget,
      buyType: optionalText(burst.buyType) ?? optionalText(line.buyType),
      budgetIncludesFees: optionalFlag(burst.budgetIncludesFees) ?? optionalFlag(line.budgetIncludesFees),
      clientPaysForMedia: optionalFlag(burst.clientPaysForMedia) ?? optionalFlag(line.clientPaysForMedia),
    })),
  }
}

function shownMediaCents(totals: LineTotals): number {
  return totals.mediaCents + totals.clientPaysMediaCents
}

/**
 * Campaign header and container summary money.
 * Client-pays media is included, matching Total Ex GST. Dollars are converted once, at the edge.
 */
export function channelSummaryTotals(
  lines: readonly ChannelSummarySourceLine[],
  feePct: number,
): ChannelSummaryTotals {
  const pct = Number.isFinite(feePct) ? feePct : 0
  const ctx = { feePct: pct }
  const moneyLines = lines.map((line) => toLineMoney(line))
  const campaign = campaignTotals(moneyLines, ctx)
  const mediaCents = shownMediaCents(campaign)
  const summarised = lines.map((line) => {
    const whole = lineTotals(toLineMoney(line), ctx)
    const lineMediaCents = shownMediaCents(whole)
    const bursts = (line.bursts ?? []).map((burst) => {
      const one = lineTotals(toLineMoney(line, [burst]), ctx)
      return {
        amount: fromCents(shownMediaCents(one) + one.feeCents),
        start: burstSpan(burst.startDate),
        end: burstSpan(burst.endDate),
      }
    })
    return {
      media: fromCents(lineMediaCents),
      fee: fromCents(whole.feeCents),
      totalCost: fromCents(lineMediaCents + whole.feeCents),
      bursts,
    }
  })
  return {
    lines: summarised,
    overallMedia: fromCents(mediaCents),
    overallFee: fromCents(campaign.feeCents),
    overallCost: fromCents(mediaCents + campaign.feeCents),
  }
}
