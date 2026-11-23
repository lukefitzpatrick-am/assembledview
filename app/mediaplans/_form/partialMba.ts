/**
 * Partial MBA on the plan form (B52, S33 A). Edit only today: create has no
 * saved version to scope. The month sources, the B21 billing vs delivery
 * guard (switch `partial_mba_billing_guard`) and the save rail line live here
 * so they are tested as behaviour, not as page text.
 */
import type { BillingMonth } from "@/lib/billing/types"
import type { ComputeCampaignFinancialsOpts } from "@/lib/finance/computeCampaignFinancials"
import { cloneBillingMonths } from "@/app/mediaplans/_form/billingMonths"
import { describePartialMbaPublishRail } from "@/lib/mediaplan/drafts/pill"
import { billingMonthsHaveDetailedLineItems } from "@/lib/mediaplan/partialMba"
import {
  computePartialMbaBillingVsDelivery,
  describePartialMbaGuardRail,
  type PartialMbaGuardResult,
} from "@/lib/mediaplan/partialMbaBillingVsDelivery"

export type PartialMbaMonthSources = {
  /** `partial_mba_billing_guard` (B21, M8, Q14). */
  guardOn: boolean
  /** The working billing schedule. */
  working: BillingMonth[]
  /** The auto billing months with lines (`manualBillingAutoReferenceMonths`). */
  autoReference: BillingMonth[] | null | undefined
  /** The delivery months. */
  autoDelivery: BillingMonth[]
}

/**
 * M8: with no line rows in working billing, the partial MBA starts from the
 * auto billing months (with lines), not the delivery months. Off: none.
 */
function billingFallback(src: PartialMbaMonthSources): BillingMonth[] | null {
  if (!src.guardOn) return null
  return (src.autoReference?.length ?? 0) > 0 ? (src.autoReference as BillingMonth[]) : null
}

/**
 * The months a partial MBA picks from: working billing with line rows, then
 * the auto billing months (switch on), then delivery (or working when there
 * is no delivery).
 */
export function partialMbaBaselineMonths(src: PartialMbaMonthSources): BillingMonth[] {
  if (billingMonthsHaveDetailedLineItems(src.working)) return src.working
  const billing = billingFallback(src)
  if (billing) return billing
  return src.autoDelivery.length > 0 ? src.autoDelivery : src.working
}

/**
 * The same order, as a copy with line rows. The delivery fallback gets its
 * line rows from the page's `attachLineItemsToMonths(…, "delivery")`.
 */
export function partialMbaLineItemMonths(
  src: PartialMbaMonthSources,
  attachDeliveryLines: (months: BillingMonth[]) => BillingMonth[]
): BillingMonth[] {
  if (billingMonthsHaveDetailedLineItems(src.working)) return cloneBillingMonths(src.working)
  const billing = billingFallback(src)
  if (billing) return cloneBillingMonths(billing)
  const base = src.autoDelivery.length > 0 ? src.autoDelivery : src.working
  return attachDeliveryLines(cloneBillingMonths(base))
}

/**
 * B21 (Q11): billing vs delivery on the partial MBA months. Only with the
 * switch on, on a partial MBA, once every channel has its lines; else null.
 */
export function partialMbaBillingGuardWhenOn(args: {
  on: boolean
  isPartial: boolean
  allChannelsHydrated: boolean
  perLine: Parameters<typeof computePartialMbaBillingVsDelivery>[0]["perLine"]
  selectedMonthYears: readonly string[]
  laterAddedMediaKeys: readonly string[]
}): PartialMbaGuardResult | null {
  if (!args.on || !args.isPartial || !args.allChannelsHydrated) return null
  return computePartialMbaBillingVsDelivery({
    perLine: args.perLine,
    selectedMonthYears: args.selectedMonthYears,
    laterAddedMediaKeys: args.laterAddedMediaKeys,
  })
}

/** The save rail's scope line: the partial MBA count, then (B21, Q13) one guard line. */
export function partialMbaSaveScopeNote(args: {
  isPartial: boolean
  inCount: number
  totalCount: number
  guard: PartialMbaGuardResult | null
}): string | null {
  return (
    [
      describePartialMbaPublishRail({ isPartial: args.isPartial, inCount: args.inCount, totalCount: args.totalCount }),
      args.guard ? describePartialMbaGuardRail(args.guard) : null,
    ]
      .filter(Boolean)
      .join(" ") || null
  )
}

function validDate(d: Date | null | undefined): Date | undefined {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : undefined
}

/**
 * The options for a partial MBA's provisional financials. The fee comes from
 * its fee billing months, as the published MBA slice (the engine's month
 * scope, S4).
 */
export function partialMbaFinancialsOptions(args: {
  campaignStart: Date | null | undefined
  campaignEnd: Date | null | undefined
  selectedMonthYears: string[]
}): ComputeCampaignFinancialsOpts {
  return {
    campaignStart: validDate(args.campaignStart),
    campaignEnd: validDate(args.campaignEnd),
    selectedMonthYears: args.selectedMonthYears.length > 0 ? args.selectedMonthYears : undefined,
  }
}
