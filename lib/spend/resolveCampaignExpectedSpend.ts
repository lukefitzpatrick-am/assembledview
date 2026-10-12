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
    return headlineAfterAssumedLines({
      headline: fromDeliveryMonthly,
      deliverySchedule,
      campaignStartISO,
      campaignEndISO,
      asOfISO: monthlyOpts?.asOfISO,
      assumedLines,
    })
  }

  const fromMonthly = expectedSpendToDateFromMonthlyCalendar(monthlySpend, opts)
  if (fromMonthly > 0) return fromMonthly

  const metric = Number(metricsExpectedSpendToDate)
  if (Number.isFinite(metric) && metric > 0) return metric

  const fromDelivery = calculateExpectedSpendToDateFromDeliverySchedule(
    deliverySchedule,
    start,
    end,
    new Date(),
    basis,
  )
  if (fromDelivery > 0) return fromDelivery

  const fromBilling = calculateExpectedSpendToDateFromBillingSchedule(billingSchedule, start ?? null, end ?? null)
  if (fromBilling > 0) return fromBilling

  return 0
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
