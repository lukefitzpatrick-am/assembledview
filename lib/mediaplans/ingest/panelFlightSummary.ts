/**
 * Panel flight summary helpers for review UI + accept round-trip.
 * Convention: dark/unavailable/blank = no flight row (see panels.ts / 0027).
 */

export type PanelFlightLike = {
  period_start?: string | null
  period_end?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  is_live?: boolean
  isLive?: boolean
  is_bonus?: boolean
  isBonus?: boolean
  /** Grid columns covered by a contiguous status run. */
  period_count?: number
  periodCount?: number
}

export function isFlightLive(f: PanelFlightLike): boolean {
  return f.is_live ?? f.isLive ?? true
}

export function isFlightBonus(f: PanelFlightLike): boolean {
  return f.is_bonus ?? f.isBonus ?? false
}

export function flightPeriodCount(f: PanelFlightLike): number {
  const n = f.period_count ?? f.periodCount
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return n
  return 1
}

/** Live period slots vs sheet grid width ("live 4 of 6 periods"). */
export function summarizePanelFlights(
  flights: readonly PanelFlightLike[],
  gridPeriodCount: number,
): { livePeriodCount: number; totalPeriodCount: number; label: string } {
  const total = Math.max(0, Math.floor(gridPeriodCount))
  const live = flights
    .filter(isFlightLive)
    .reduce((n, f) => n + flightPeriodCount(f), 0)
  return {
    livePeriodCount: live,
    totalPeriodCount: total,
    label: `live ${live} of ${total} periods`,
  }
}
