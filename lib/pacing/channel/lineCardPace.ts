import {
  computeCampaignDays,
  computeDaysPassed,
  computeDaysRemaining,
  computeExpectedPct,
  computeExpectedSpend,
  computeRequiredDaily,
} from "@/lib/pacing/maths"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import type { ChannelSourceState } from "@/lib/pacing/portfolio/types"
import type { LineCardBurstState, LineCardBursts, LineCardPace } from "./lineCardTypes"

export const OVER_PACING_FINISH_RATIO = 1.15

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function lineTimePct(
  start: string | null | undefined,
  end: string | null | undefined,
  asOf: string,
): number {
  if (!start || !end) return 0
  const days = computeCampaignDays(start, end)
  if (days <= 0) return 0
  return computeExpectedPct(computeDaysPassed(start, end, asOf), days) * 100
}

export function lineDaysLeft(
  start: string | null | undefined,
  end: string | null | undefined,
  asOf: string,
): number {
  if (!start || !end) return 0
  return computeDaysRemaining(start, end, asOf)
}

export function spendVsExpectedPct(spend: number, budget: number, timePct: number): number {
  const expected = computeExpectedSpend(budget, timePct / 100)
  if (!(expected > 0)) return spend > 0 ? 100 : 0
  return (spend / expected) * 100
}

/** Straight-line finish: spend / time elapsed. */
export function projectLineFinish(spend: number, timePct: number): number | null {
  if (!(timePct > 0) || !Number.isFinite(spend)) return null
  return spend / (timePct / 100)
}

export function isLineOverPacing(
  linePct: number,
  projected: number | null,
  budget: number,
): boolean {
  return (
    linePct > 110 &&
    projected != null &&
    budget > 0 &&
    projected > budget * OVER_PACING_FINISH_RATIO
  )
}

export function resolveLinePace(input: {
  timePct: number
  linePct: number
  spend: number
  budget: number
  start: string | null | undefined
  asOf: string
  hasFactRows: boolean
}): LineCardPace {
  const { timePct, linePct, spend, budget, start, asOf, hasFactRows } = input
  if (start && asOf < start) return "no_data"
  if (!hasFactRows && timePct > 0 && !(spend > 0)) return "no_data"
  if (timePct > 0 && !(spend > 0) && !(budget > 0)) return "no_data"
  const projected = projectLineFinish(spend, timePct)
  if (isLineOverPacing(linePct, projected, budget)) return "over_pacing"
  const status = deliveryStatusFromPct(linePct)
  if (status === "ahead") return "ahead"
  if (status === "behind") return "behind"
  if (status === "on-track") return "on_track"
  return "no_data"
}

export function resolveSourceState(input: {
  start: string | null | undefined
  asOf: string
  hasFactRows: boolean
  inFlight: boolean
}): ChannelSourceState {
  if (input.start && input.asOf < input.start) return "not_started"
  if (input.hasFactRows) return "reporting"
  if (input.inFlight) return "no_source"
  return "not_started"
}

export function burstStates(
  total: number,
  currentIndex: number | null,
): LineCardBursts {
  const states: LineCardBurstState[] = []
  for (let i = 0; i < total; i += 1) {
    if (currentIndex == null) {
      states.push("future")
      continue
    }
    if (i < currentIndex) states.push("done")
    else if (i === currentIndex) states.push("now")
    else states.push("future")
  }
  return {
    index: currentIndex == null ? null : currentIndex + 1,
    total,
    states,
  }
}

export function burstMonthLabel(start: string | null | undefined): string | null {
  if (!start) return null
  const ms = Date.parse(`${start}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" }).format(ms)
}

export function perDayPlanForWindow(
  budget: number,
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end || !(budget > 0)) return null
  const days = computeCampaignDays(start, end)
  if (days <= 0) return null
  return budget / days
}

export function perDayLeftForWindow(
  remaining: number,
  start: string | null | undefined,
  end: string | null | undefined,
  asOf: string,
): number | null {
  if (!start || !end) return null
  const daysLeft = computeDaysRemaining(start, end, asOf)
  return computeRequiredDaily(remaining, 0, daysLeft)
}
