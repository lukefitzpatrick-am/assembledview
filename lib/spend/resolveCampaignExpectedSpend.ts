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
  } = input

  const start = campaignStartISO ?? undefined
  const end = campaignEndISO ?? undefined

  const fromDeliveryMonthly = expectedSpendToDateFromDeliveryScheduleMonthly(deliverySchedule, monthlyOpts)
  if (fromDeliveryMonthly > 0) return fromDeliveryMonthly

  const fromMonthly = expectedSpendToDateFromMonthlyCalendar(monthlySpend, monthlyOpts)
  if (fromMonthly > 0) return fromMonthly

  const metric = Number(metricsExpectedSpendToDate)
  if (Number.isFinite(metric) && metric > 0) return metric

  const fromDelivery = calculateExpectedSpendToDateFromDeliverySchedule(
    deliverySchedule,
    start,
    end,
  )
  if (fromDelivery > 0) return fromDelivery

  const fromBilling = calculateExpectedSpendToDateFromBillingSchedule(billingSchedule, start ?? null, end ?? null)
  if (fromBilling > 0) return fromBilling

  return 0
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
}

export function resolveCampaignTotalPlannedSpend(input: ResolveCampaignTotalPlannedInput): number {
  const fromDeliveryMonthly = totalPlannedSpendFromDeliveryScheduleMonthly(
    input.deliverySchedule,
    input.monthlyOpts,
  )
  if (fromDeliveryMonthly > 0) return fromDeliveryMonthly

  const fromMonthly = totalPlannedSpendFromMonthly(input.monthlySpend, input.monthlyOpts)
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
