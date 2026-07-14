/**
 * MBA fee-override persistence planner.
 *
 * TRADE-OFF: With MBA fee following the per-line fee override, billing fee == MBA fee
 * by construction, so `validation.billableEqualsMba` no longer catches fee drift.
 * The compensating control for fee is this version/approval trigger (media remains
 * gated by the billable=MBA check). Never mutate an approved MBA's dollar total in
 * place — spawn the next media_plan_version carrying the override instead.
 */

import type { CampaignFinancials, LineItemInput } from "@/lib/finance/campaignFinancials.types"

export type MbaFeeOverridePriorStatus =
  | "draft"
  | "pending-approval"
  | "pending_approval"
  | "approved"
  | "booked"
  | "completed"
  | string

export type MbaFeeOverridePersistencePlan =
  | {
      action: "noop"
      rebill_needed: false
      mbaFeeAdjusted: false
    }
  | {
      action: "apply_inplace"
      rebill_needed: true
      mbaFeeAdjusted: true
    }
  | {
      action: "spawn_version"
      rebill_needed: true
      mbaFeeAdjusted: true
      /** Status for the new version — prior approved row stays untouched. */
      nextStatus: "pending-approval"
      /** Line inputs to persist on the new version (includes fee overrides). */
      lineItems: LineItemInput[]
    }

function isApprovedStatus(status: string): boolean {
  const s = status.trim().toLowerCase()
  return s === "approved" || s === "booked" || s === "completed"
}

/**
 * Decide whether a fee override that moves MBA fee must apply in place or spawn
 * a new draft/pending-approval version.
 *
 * Timing-only overrides (`mbaFeeAdjusted === false`) are a noop for versioning.
 * Amount changes on a non-approved MBA apply in place; on an approved MBA they
 * spawn the next version and set `rebill_needed`.
 */
export function planMbaFeeOverridePersistence(input: {
  priorStatus: MbaFeeOverridePriorStatus
  financials: Pick<CampaignFinancials, "mbaFeeAdjusted" | "rebill_needed">
  /** Line inputs carrying fee overrides — returned on spawn so callers persist them. */
  lineItems: LineItemInput[]
}): MbaFeeOverridePersistencePlan {
  if (!input.financials.mbaFeeAdjusted) {
    return {
      action: "noop",
      rebill_needed: false,
      mbaFeeAdjusted: false,
    }
  }

  if (isApprovedStatus(String(input.priorStatus ?? ""))) {
    return {
      action: "spawn_version",
      rebill_needed: true,
      mbaFeeAdjusted: true,
      nextStatus: "pending-approval",
      lineItems: input.lineItems,
    }
  }

  return {
    action: "apply_inplace",
    rebill_needed: true,
    mbaFeeAdjusted: true,
  }
}
