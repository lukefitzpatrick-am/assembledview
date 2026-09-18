import { inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst"
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts"

function burstPlannedSpend(burst: { mediaAmount?: number; budget: number }): number {
  return burst.mediaAmount && burst.mediaAmount > 0 ? burst.mediaAmount : burst.budget
}

/**
 * Planned × inclusive elapsed share of the line's bursts.
 * Same function spendDeliveryProgressCard uses for expected-to-date.
 * Null when there are no bursts.
 */
export function expectedSpendToDateFromBursts(
  rawBursts: unknown,
  planned: number,
  asOfDate: string,
): number | null {
  const bursts = parseBurstsToNormalised(rawBursts)
  if (bursts.length === 0) return null

  let expected = 0
  let burstMoney = 0
  for (const burst of bursts) {
    const totalDays = inclusiveDaysBetween(burst.startDate, burst.endDate)
    if (!totalDays) continue
    const amount = burstPlannedSpend(burst)
    burstMoney += amount
    if (asOfDate < burst.startDate) continue
    const windowEnd = asOfDate > burst.endDate ? burst.endDate : asOfDate
    const elapsed = inclusiveDaysBetween(burst.startDate, windowEnd)
    if (!elapsed) continue
    expected += amount * Math.min(1, Math.max(0, elapsed / totalDays))
  }
  if (burstMoney > 0) return expected

  const start = bursts[0]!.startDate
  const end = bursts.reduce((latest, burst) => (burst.endDate > latest ? burst.endDate : latest), bursts[0]!.endDate)
  const totalDays = inclusiveDaysBetween(start, end)
  if (!totalDays || planned <= 0) return null
  if (asOfDate < start) return 0
  const windowEnd = asOfDate > end ? end : asOfDate
  const elapsed = inclusiveDaysBetween(start, windowEnd)
  if (!elapsed) return null
  return planned * Math.min(1, Math.max(0, elapsed / totalDays))
}
