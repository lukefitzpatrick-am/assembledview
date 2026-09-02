/**
 * Accept an ingest proposal through the normal save path (MR-4).
 * Never bypasses savePlanVersion; never auto-accepts.
 */

import type {
  SavePlanMode,
  SavePlanVersionInput,
} from "@/lib/data/savePlan"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"
import { evaluateOohExpertPreference } from "@/lib/mediaplans/ingest/oohLargeFormatExpertGate"
import {
  stampProposalForSave,
  type IngestPanelRow,
} from "@/lib/mediaplans/ingest/stampProposalForSave"

export type AcceptCampaignTarget = {
  masterId: number
  mbaNumber: string
  versionNumber: number
  mode: SavePlanMode
  campaignName?: string | null
  campaignStatus?: string | null
  campaignStartDate?: string | null
  campaignEndDate?: string | null
  brand?: string | null
  channelFlags?: Record<string, unknown> | null
}

export type AcceptIngestDeps = {
  savePlanVersion: (
    input: SavePlanVersionInput,
  ) => Promise<{
    versionId: number
    versionNumber: number
    lineCount: number
  }>
  insertPanels: (rows: IngestPanelRow[]) => Promise<number>
}

export type AcceptIngestResult = {
  versionId: number
  versionNumber: number
  lineCount: number
  panelCount: number
  lineItemIds: string[]
  /** When true, OOH should open expert view and suppress the card list. */
  preferOohExpertView: boolean
  /** Count of OOH lines with buy_granularity=panel that drove the preference. */
  oohPanelLineCount: number
}

/**
 * Stamp IDs → savePlanVersion → insert panels+flights keyed by stamped IDs.
 * Cancel is a no-op at the call site (never invoke this).
 */
export async function acceptIngestProposal(
  args: {
    proposal: IngestProposal
    campaign: AcceptCampaignTarget
    feeLoading: FeeLoading
    /** When set, these existing lines are kept and ingest lines appended. */
    existingLineItems?: SavePlanVersionInput["lineItems"]
    resolvedControlled?: import("@/lib/mediaplans/ingest/templateCoverage").ResolvedControlledValue[]
  },
  deps: AcceptIngestDeps,
): Promise<AcceptIngestResult> {
  const { lineItems, panels } = stampProposalForSave(
    args.proposal,
    args.campaign.mbaNumber,
    args.resolvedControlled,
  )

  const merged = [...(args.existingLineItems ?? []), ...lineItems]

  const saved = await deps.savePlanVersion({
    masterId: args.campaign.masterId,
    mbaNumber: args.campaign.mbaNumber,
    versionNumber: args.campaign.versionNumber,
    mode: args.campaign.mode,
    campaignName: args.campaign.campaignName,
    campaignStatus: args.campaign.campaignStatus ?? "draft",
    campaignStartDate: args.campaign.campaignStartDate,
    campaignEndDate: args.campaign.campaignEndDate,
    brand: args.campaign.brand,
    channelFlags: args.campaign.channelFlags ?? {
      [lineItems[0]?.channel === "radio" ? "radio" : "ooh"]: true,
    },
    lineItems: merged,
    feeLoading: args.feeLoading,
  })

  const panelCount = await deps.insertPanels(panels)

  const expertPref = evaluateOohExpertPreference({ lineItems, panels })

  return {
    versionId: saved.versionId,
    versionNumber: saved.versionNumber,
    lineCount: saved.lineCount,
    panelCount,
    lineItemIds: lineItems.map((l) => l.lineItemId),
    preferOohExpertView: expertPref.preferOohExpertView,
    oohPanelLineCount: expertPref.panelLineCount,
  }
}
