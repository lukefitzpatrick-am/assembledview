import { formatMoney } from "@/lib/format/money"
import type { SpendPacingBand } from "@/lib/pacing/status"

export type StatusSentenceInput = {
  pacingStatus: SpendPacingBand | "critical" | string
  /** 0–1 fraction (actual vs expected, or actual vs budget). */
  spendPct: number
  /** 0–1 fraction (delivered vs planned impressions). */
  impressionsPct: number
  channelsReporting?: number
  channelsTotal?: number
  /** First reporting channel whose glance card status (spend, or deliverable when spend is hidden) is ahead. */
  aheadChannelName?: string | null
  cpmActual?: number
  cpmPlanned?: number
  expectedSpend?: number
  actualSpend?: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isBehindOrCritical(status: string): boolean {
  return status === "behind" || status === "over-pacing" || status === "critical"
}

function spendGapLabel(expectedSpend: number | undefined, actualSpend: number | undefined): string {
  const expected = isFiniteNumber(expectedSpend) ? expectedSpend : 0
  const actual = isFiniteNumber(actualSpend) ? actualSpend : 0
  return formatMoney(expected - actual, { decimals: 0 })
}

/**
 * Campaign "Where we are" sentence. First matching rule wins; no other copy.
 */
export function statusSentence(input: StatusSentenceInput): string {
  const {
    pacingStatus,
    spendPct,
    impressionsPct,
    channelsReporting,
    channelsTotal,
    aheadChannelName,
    cpmActual,
    cpmPlanned,
    expectedSpend,
    actualSpend,
  } = input

  if (
    isFiniteNumber(channelsTotal) &&
    isFiniteNumber(channelsReporting) &&
    channelsReporting < channelsTotal &&
    spendPct < 0.5
  ) {
    const base = `${channelsReporting} of ${channelsTotal} channels are reporting so far, which is why delivered spend looks low.`
    const name = typeof aheadChannelName === "string" ? aheadChannelName.trim() : ""
    if (name) return `${base} ${name} is ahead.`
    return base
  }

  const spendKnown = isFiniteNumber(actualSpend)
  if (!spendKnown) {
    return "No delivery reported yet."
  }

  if (
    isFiniteNumber(cpmActual) &&
    isFiniteNumber(cpmPlanned) &&
    impressionsPct > spendPct + 0.15 &&
    cpmActual < cpmPlanned
  ) {
    return "Delivery is ahead on impressions and under on spend because media is buying cheaper than planned."
  }

  if (isBehindOrCritical(pacingStatus)) {
    return `Spend is behind the plan by ${spendGapLabel(expectedSpend, actualSpend)}. See the channel cards below for where.`
  }

  return "Delivery is on track against the plan."
}
