import { buildDateListISO } from "@/lib/delivery/search/searchCore"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { fromCents, toCents } from "@/lib/money/cents"

/** Card and section title. Not "Booked spend (flat allocation)". */
export const ASSUMED_SPEND_LABEL = "Assumed spend"

/** spendMode on an assumed row. Not "allocated" or "reported". */
export const ASSUMED_SPEND_MODE = "assumed" as const

/** CAP_APPLIED on the fact row. Not "flat_allocation" or "fixed_cost". */
export const ASSUMED_SPEND_CAP_APPLIED = "assumed_spend" as const

export type AssumedSpendDay = {
  date: string
  cents: number
}

export type AssumedDateWindow = {
  startDate: string
  endDate: string
}

/**
 * Even integer cents on each inclusive day of one window, through asOfDate.
 * Days after asOfDate are 0. The rounding remainder lands on the last day
 * only once that day is on or before asOfDate.
 * Half-up is toCents. The window is the burst's own dates, not a month bucket.
 */
export function assumedDailyCents(args: {
  deliveryMediaCents: number
  startDate: string
  endDate: string
  asOfDate: string
}): AssumedSpendDay[] {
  return assignEvenCents(
    buildDateListISO(args.startDate, args.endDate),
    args.deliveryMediaCents,
    args.asOfDate,
  )
}

export type AssumedBurstInput = {
  rawBudget: number
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  feePct: number
  buyType?: string
  startDate: string
  endDate: string
  asOfDate: string
  /** When present, these dates replace the burst window. Money stays the burst's delivery media. */
  panelFlights?: readonly AssumedDateWindow[]
}

/**
 * Daily cents for one burst. The amount is computeBurstAmounts deliveryMediaAmount.
 * Bonus and package_inclusions return nothing. Client-pays uses delivery media.
 * Panel flights win over the burst dates.
 */
export function assumedSpendForBurst(args: AssumedBurstInput): AssumedSpendDay[] {
  const { deliveryMediaAmount } = computeBurstAmounts({
    rawBudget: args.rawBudget,
    budgetIncludesFees: args.budgetIncludesFees,
    clientPaysForMedia: args.clientPaysForMedia,
    feePct: args.feePct,
    buyType: args.buyType,
  })
  if (!(deliveryMediaAmount > 0)) return []

  const cents = toCents(deliveryMediaAmount)
  const flights = (args.panelFlights ?? []).filter(
    (flight) => flight.startDate && flight.endDate,
  )
  if (flights.length === 0) {
    return assumedDailyCents({
      deliveryMediaCents: cents,
      startDate: args.startDate,
      endDate: args.endDate,
      asOfDate: args.asOfDate,
    })
  }
  if (flights.length === 1) {
    return assumedDailyCents({
      deliveryMediaCents: cents,
      startDate: flights[0].startDate,
      endDate: flights[0].endDate,
      asOfDate: args.asOfDate,
    })
  }
  return assignEvenCents(uniqueFlightDates(flights), cents, args.asOfDate)
}

function assignEvenCents(
  dates: readonly string[],
  totalCents: number,
  asOfDate: string,
): AssumedSpendDay[] {
  if (dates.length === 0) return []
  if (!Number.isInteger(totalCents)) {
    throw new TypeError(`assumedDailyCents: non-integer cents ${totalCents}`)
  }
  const perDay = toCents(fromCents(totalCents) / dates.length)
  const lastDate = dates[dates.length - 1]
  const ended = lastDate <= asOfDate
  return dates.map((date, index) => {
    if (date > asOfDate) return { date, cents: 0 }
    if (ended && index === dates.length - 1) {
      return { date, cents: totalCents - perDay * (dates.length - 1) }
    }
    return { date, cents: perDay }
  })
}

function uniqueFlightDates(flights: readonly AssumedDateWindow[]): string[] {
  const dates = new Set<string>()
  for (const flight of flights) {
    for (const date of buildDateListISO(flight.startDate, flight.endDate)) {
      dates.add(date)
    }
  }
  return [...dates].sort()
}
