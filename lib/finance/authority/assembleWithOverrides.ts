/**
 * Shared C1 / Plan-C authority input assembly.
 *
 * Exactly mirrors the compute path inside {@link recomputeAndValidateBillingScheduleOnSave}:
 * 1. attachOverridesToLineInputs (billing_overrides table wins)
 * 2. computeCampaignFinancials(attached, { feeLoading }, opts)
 */

import {
  attachOverridesToLineInputs,
  type BillingOverrideRow,
} from "@/lib/finance/billingOverrides"
import type {
  CampaignFinancials,
  FeeLoading,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"
import {
  computeCampaignFinancials,
  type ComputeCampaignFinancialsOpts,
} from "@/lib/finance/computeCampaignFinancials"

export type AssembleCampaignFinancialsWithOverridesArgs = {
  lineItems: LineItemInput[]
  feeLoading: FeeLoading
  overrideRows: BillingOverrideRow[]
  opts?: ComputeCampaignFinancialsOpts
}

export type AssembledCampaignFinancials = {
  /** Line inputs after table overrides attached (same array passed to compute). */
  lineItems: LineItemInput[]
  financials: CampaignFinancials
}

/**
 * C1 compute assembly — single source of truth for save-path recompute.
 */
export function assembleCampaignFinancialsWithOverrides(
  args: AssembleCampaignFinancialsWithOverridesArgs
): AssembledCampaignFinancials {
  const lineItems = attachOverridesToLineInputs(args.lineItems, args.overrideRows)
  const financials = computeCampaignFinancials(
    lineItems,
    { feeLoading: args.feeLoading },
    args.opts
  )
  return { lineItems, financials }
}

/**
 * Build {@link ComputeCampaignFinancialsOpts} from authority monthScope / approvalState / client.
 */
export function buildComputeOptsFromAuthorityArgs(args: {
  approvalState?: { selectedMonthYears?: readonly string[] }
  monthScope?: {
    campaignStart?: Date
    campaignEnd?: Date
    selectedMonthYears?: readonly string[]
  }
  client?: {
    adservaudio?: number
    getRateForMediaType?: (mediaType: string) => number
    isManualBilling?: boolean
  }
}): ComputeCampaignFinancialsOpts | undefined {
  const selectedMonthYears =
    args.monthScope?.selectedMonthYears ?? args.approvalState?.selectedMonthYears
  const opts: ComputeCampaignFinancialsOpts = {
    ...(args.monthScope?.campaignStart
      ? { campaignStart: args.monthScope.campaignStart }
      : {}),
    ...(args.monthScope?.campaignEnd ? { campaignEnd: args.monthScope.campaignEnd } : {}),
    ...(selectedMonthYears && selectedMonthYears.length > 0
      ? { selectedMonthYears }
      : {}),
    ...(args.client?.adservaudio != null ? { adservaudio: args.client.adservaudio } : {}),
    ...(args.client?.getRateForMediaType
      ? { getRateForMediaType: args.client.getRateForMediaType }
      : {}),
    ...(args.client?.isManualBilling != null
      ? { isManualBilling: args.client.isManualBilling }
      : {}),
  }
  return Object.keys(opts).length > 0 ? opts : undefined
}
