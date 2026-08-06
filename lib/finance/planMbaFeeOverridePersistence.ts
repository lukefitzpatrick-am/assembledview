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
import { isApprovedOrBeyond } from "@/lib/docs/isApprovedOrBeyond"

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

/**
 * Decide whether a fee override that moves MBA fee must apply in place or spawn
 * a new draft/pending-approval version.
 *
 * Timing-only overrides (`mbaFeeAdjusted === false`) are a noop for versioning.
 * Amount changes on a non-approved MBA apply in place; on an approved MBA they
 * spawn the next version and set `rebill_needed`.
 *
 * Stage 1 scope: publication (published_at) answers "may the client have this".
 * Mutability still keys off commercial status until Stage 2 makes published
 * versions immutable deliberately. Do not merge these two predicates —
 * they are different sets (planned is downloadable but not frozen).
 *
 * MB-13: both write paths refuse amount-changing fee overrides, so the
 * `mbaFeeAdjusted === true` branches below are unreachable for gated data
 * and are retained as a defect path only.
 */
export function planMbaFeeOverridePersistence(input: {
  priorStatus: MbaFeeOverridePriorStatus
  /**
   * VC1-1 plumbing — selected but not the mutability gate (Stage 1).
   * Spawn/in-place uses `priorStatus` via `isApprovedOrBeyond`.
   */
  priorPublishedAt?: string | null
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

  void input.priorPublishedAt

  // Defect path: amount-changing override reached compute despite write gates.
  if (isApprovedOrBeyond(String(input.priorStatus ?? ""))) {
    return {
      action: "spawn_version",
      rebill_needed: true,
      mbaFeeAdjusted: true,
      nextStatus: "pending-approval",
      lineItems: input.lineItems,
    }
  }

  // Defect path: same — gated data should never land here.
  return {
    action: "apply_inplace",
    rebill_needed: true,
    mbaFeeAdjusted: true,
  }
}
