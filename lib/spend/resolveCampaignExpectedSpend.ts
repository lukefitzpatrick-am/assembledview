import { fromCents, toCents } from "@/lib/money/cents"
import type { AssumedExpectedLine } from "@/lib/spend/assumedSpend"
import { channelExpectedToDate } from "@/lib/spend/channelExpectedToDate"
import { calculateExpectedSpendToDateFromDeliverySchedule } from "@/lib/spend/expectedSpend"
import {
  calculateExpectedSpendToDateFromBillingSchedule,
  totalPlannedSpendFromBillingSchedule,
} from "@/lib/spend/billingScheduleExpectedToDate"
import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  expectedSpendToDateFromMonthlyCalendar,
  totalPlannedSpendFromDeliveryScheduleMonthly,
  totalPlannedSpendFromMonthly,
  type MonthlyPlanCampaignOpts,
} from "@/lib/spend/monthlyPlanCalendar"

export type ResolveCampaignSpendInput = {
  billingSchedule: unknown
  campaignStartISO: string | null
  campaignEndISO: string | null
  monthlySpend: unknown
  monthlyOpts?: MonthlyPlanCampaignOpts
  /** From mediaplans API when already computed server-side */
  metricsExpectedSpendToDate?: number
  deliverySchedule?: unknown
  /** media when this number is compared with platform delivered spend. */
  basis?: "media" | "all_in"
  /**
   * Assumed-spend lines. When the delivery schedule produced the headline,
   * their burst sum replaces their share of that headline.
   */
  assumedLines?: readonly AssumedExpectedLine[]
}

/**
 * Single resolution order for campaign “expected spend to date”:
 * 1. Delivery schedule on the plan version (monthly buckets, Melbourne proration)
 * 2. Pre-aggregated monthly spend (metrics) + same calendar proration
 * 3. API metric fallback
 * 4. Legacy delivery parser (`lib/spend/expectedSpend`)
 * 5. Billing schedule
 */
export function resolveCampaignExpectedSpendToDate(input: ResolveCampaignSpendInput): number {
  return resolveExpectedWithSource(input).value
}

/** Which branch produced the figure. Only the first two honour `monthlyOpts.asOfISO`. */
type ExpectedSource = "delivery_monthly" | "monthly" | "metric" | "legacy_delivery" | "billing" | "none"

function resolveExpectedWithSource(input: ResolveCampaignSpendInput): {
  value: number
  source: ExpectedSource
} {
  const {
    billingSchedule,
    campaignStartISO,
    campaignEndISO,
    monthlySpend,
    monthlyOpts,
    metricsExpectedSpendToDate,
    deliverySchedule,
    basis = "all_in",
    assumedLines,
  } = input

  const start = campaignStartISO ?? undefined
  const end = campaignEndISO ?? undefined
  const opts = { ...monthlyOpts, basis }

  const fromDeliveryMonthly = expectedSpendToDateFromDeliveryScheduleMonthly(deliverySchedule, opts)
  if (fromDeliveryMonthly > 0) {
    return {
      value: headlineAfterAssumedLines({
        headline: fromDeliveryMonthly,
        deliverySchedule,
        campaignStartISO,
        campaignEndISO,
        asOfISO: monthlyOpts?.asOfISO,
        assumedLines,
      }),
      source: "delivery_monthly",
    }
  }

  const fromMonthly = expectedSpendToDateFromMonthlyCalendar(monthlySpend, opts)
  if (fromMonthly > 0) return { value: fromMonthly, source: "monthly" }

  const metric = Number(metricsExpectedSpendToDate)
  if (Number.isFinite(metric) && metric > 0) return { value: metric, source: "metric" }

  const fromDelivery = calculateExpectedSpendToDateFromDeliverySchedule(
    deliverySchedule,
    start,
    end,
    new Date(),
    basis,
  )
  if (fromDelivery > 0) return { value: fromDelivery, source: "legacy_delivery" }

  const fromBilling = calculateExpectedSpendToDateFromBillingSchedule(billingSchedule, start ?? null, end ?? null)
  if (fromBilling > 0) return { value: fromBilling, source: "billing" }

  return { value: 0, source: "none" }
}

function dayBeforeISO(iso: string): string {
  const [year, month, day] = iso.split("-").map((part) => Number(part))
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export type ExpectedSpendWindow = {
  /** First day of the window (inclusive, `YYYY-MM-DD`). */
  startISO: string
  /** Last day of the window (inclusive). Melbourne yesterday at the latest. */
  endISO: string
  /** Nothing expected yet (window ends before it starts). */
  empty: boolean
}

/**
 * Expected media for a pacing window (`resolvePacingWindow`), not "to today".
 * To date: the figure as at `window.endISO`. A window that starts after the
 * campaign start is the figure at its end less the figure the day before it
 * starts. Fallback sources that cannot be dated (API metric, legacy parser,
 * billing) return their to-date figure unchanged.
 */
export function resolveCampaignExpectedSpendForWindow(
  input: ResolveCampaignSpendInput & { window: ExpectedSpendWindow },
): number {
  const { window, ...rest } = input
  if (window.empty) return 0
  const atEnd = resolveExpectedWithSource({
    ...rest,
    monthlyOpts: { ...rest.monthlyOpts, asOfISO: window.endISO },
  })
  const dated = atEnd.source === "delivery_monthly" || atEnd.source === "monthly"
  const campaignStart = rest.campaignStartISO ?? rest.monthlyOpts?.campaignStartISO ?? null
  if (!dated || !campaignStart || window.startISO <= campaignStart) return atEnd.value
  const before = resolveExpectedWithSource({
    ...rest,
    monthlyOpts: { ...rest.monthlyOpts, asOfISO: dayBeforeISO(window.startISO) },
  })
  const beforeValue = before.source === atEnd.source ? before.value : 0
  return fromCents(Math.max(0, toCents(atEnd.value) - toCents(beforeValue)))
}

function sliceExpectedCents(
  deliverySchedule: unknown,
  campaignStartISO: string | null,
  campaignEndISO: string | null,
  asOfISO: string | null | undefined,
  assumedLines?: readonly AssumedExpectedLine[],
): number {
  return channelExpectedToDate({
    deliverySchedule,
    campaignStartISO,
    campaignEndISO,
    asOfISO,
    assumedLines,
  }).reduce((sum, slice) => sum + toCents(slice.expected), 0)
}

/** Headline minus the schedule slices, plus the slices after assumed lines replace their share. */
function headlineAfterAssumedLines(args: {
  headline: number
  deliverySchedule: unknown
  campaignStartISO: string | null
  campaignEndISO: string | null
  asOfISO: string | null | undefined
  assumedLines?: readonly AssumedExpectedLine[]
}): number {
  if (!args.assumedLines || args.assumedLines.length === 0) return args.headline
  const before = sliceExpectedCents(
    args.deliverySchedule,
    args.campaignStartISO,
    args.campaignEndISO,
    args.asOfISO,
  )
  const after = sliceExpectedCents(
    args.deliverySchedule,
    args.campaignStartISO,
    args.campaignEndISO,
    args.asOfISO,
    args.assumedLines,
  )
  return fromCents(toCents(args.headline) - before + after)
}

export type ResolveCampaignTotalPlannedInput = {
  deliverySchedule?: unknown
  monthlySpend: unknown
  monthlyOpts?: MonthlyPlanCampaignOpts
  billingSchedule: unknown
  campaignStartISO: string | null
  campaignEndISO: string | null
  /** Final fallback when schedules don’t sum (e.g. fees-only plans) */
  campaignBudget?: number
  /** Plan and billing totals stay all_in unless a caller asks for media. */
  basis?: "media" | "all_in"
}

export function resolveCampaignTotalPlannedSpend(input: ResolveCampaignTotalPlannedInput): number {
  const basis = input.basis ?? "all_in"
  const monthlyOpts = { ...input.monthlyOpts, basis }
  const fromDeliveryMonthly = totalPlannedSpendFromDeliveryScheduleMonthly(
    input.deliverySchedule,
    monthlyOpts,
  )
  if (fromDeliveryMonthly > 0) return fromDeliveryMonthly

  const fromMonthly = totalPlannedSpendFromMonthly(input.monthlySpend, monthlyOpts)
  if (fromMonthly > 0) return fromMonthly

  const fromBilling = totalPlannedSpendFromBillingSchedule(
    input.billingSchedule,
    input.campaignStartISO,
    input.campaignEndISO,
  )
  if (fromBilling > 0) return fromBilling

  const bud = input.campaignBudget
  if (typeof bud === "number" && Number.isFinite(bud) && bud > 0) return bud

  return 0
}
