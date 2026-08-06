/**
 * MBA fee-override persistence planner.
 *
 * TRADE-OFF: With MBA fee following the per-line fee override, billing fee == MBA fee
 * by construction, so `validation.billableEqualsMba` no longer catches fee drift.
 * The compensating control for fee is this version/publication trigger (media remains
 * gated by the billable=MBA check). Never mutate a published MBA's dollar total in
 * place — spawn the next media_plan_version carrying the override instead.
 */

import type { CampaignFinancials, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

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
      /** Status for the new version — prior published row stays untouched. */
      nextStatus: "pending-approval"
      /** Line inputs to persist on the new version (includes fee overrides). */
      lineItems: LineItemInput[]
    }

/**
 * Decide whether a fee override that moves MBA fee must apply in place or spawn
 * a new draft/pending-approval version.
 *
 * Timing-only overrides (`mbaFeeAdjusted === false`) are a noop for versioning.
 * Amount changes on an unpublished version apply in place; on a published version
 * they spawn the next version and set `rebill_needed`.
 *
 * VC Stage 1: spawn iff `priorPublishedAt` is non-null via `isVersionPublished`.
 * `priorStatus` is retained for callers/tests but is not the publication gate.
 *
 * MB-13: both write paths refuse amount-changing fee overrides, so the
 * `mbaFeeAdjusted === true` branches below are unreachable for gated data
 * and are retained as a defect path only.
 */
export function planMbaFeeOverridePersistence(input: {
  priorStatus: MbaFeeOverridePriorStatus
  /**
   * VC Stage 1 — `published_at` of the version being overridden.
   * Omit / null = unpublished → apply_inplace; non-null → spawn_version.
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

  // Defect path: amount-changing override reached compute despite write gates.
  if (isVersionPublished({ publishedAt: input.priorPublishedAt ?? null })) {
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
