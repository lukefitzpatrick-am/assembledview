/**
 * Shared Accept path for Hub POST /api/admin/ingest/accept and AVA chat.
 * Same 409 money / required-field gates; ingest_runs on accept and blocked.
 */

import { acceptIngestProposal } from "@/lib/mediaplans/ingest/acceptIngestProposal"
import type {
  AcceptCampaignTarget,
  AcceptIngestDeps,
  AcceptIngestResult,
} from "@/lib/mediaplans/ingest/acceptIngestProposal"
import { recordIngestRun } from "@/lib/mediaplans/ingest/ingestRuns"
import {
  getIngestStage,
  retainIngestStage,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import { resolveIngestCampaignFromDb } from "@/lib/mediaplans/ingest/resolveIngestCampaign"
import { evaluateTemplateCoverage } from "@/lib/mediaplans/ingest/templateCoverage"
import {
  NO_PUBLISHER_PROFILE_MESSAGE,
  summariseIngestReview,
} from "@/lib/mediaplans/ingest/summariseIngestReview"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"

export type ExecuteIngestAcceptArgs = {
  stageId?: string | null
  proposal?: IngestProposal | null
  mbaNumber?: string | null
  versionNumber?: number
  uploadedBy: string | null
  confirm: boolean
  fileName?: string | null
  detectedConfidence?: number | null
  publisherName?: string | null
  feeLoading?: FeeLoading
}

export type ExecuteIngestAcceptOk = AcceptIngestResult & {
  ok: true
}

export type ExecuteIngestAcceptFail = {
  ok: false
  status: number
  error: string
  ask_mba?: boolean
  reconciliation?: IngestProposal["reconciliation"]
}

export type ExecuteIngestAcceptResult =
  | ExecuteIngestAcceptOk
  | ExecuteIngestAcceptFail

export type ExecuteIngestAcceptOverrides = Partial<AcceptIngestDeps> & {
  resolveCampaign?: (mba: string) => Promise<AcceptCampaignTarget>
  recordRun?: typeof recordIngestRun
}

let testOverrides: ExecuteIngestAcceptOverrides | null = null

export function setExecuteIngestAcceptDepsForTests(
  deps: ExecuteIngestAcceptOverrides | null,
): void {
  testOverrides = deps
}

function runFields(args: {
  publisherName: string | null
  fileName: string | null
  uploadedBy: string | null
  detectedConfidence: number | null
  requiredCoverage: number | null
  proposal: IngestProposal | null
}) {
  const recon = args.proposal?.reconciliation
  return {
    publisherId: args.publisherName
      ? resolveCatalogueIdForProfileName(args.publisherName)
      : null,
    publisherName: args.publisherName,
    fileName: args.fileName,
    uploadedBy: args.uploadedBy,
    detectedConfidence: args.detectedConfidence,
    requiredCoverage: args.requiredCoverage,
    lineItemCount: recon?.line_item_count ?? 0,
    panelCount: recon?.panel_count ?? 0,
    burstCount: recon?.burst_count ?? 0,
    moneyDelta: recon?.delta ?? null,
  }
}

export async function executeIngestAccept(
  args: ExecuteIngestAcceptArgs,
  deps: ExecuteIngestAcceptOverrides = {},
): Promise<ExecuteIngestAcceptResult> {
  const merged: ExecuteIngestAcceptOverrides = { ...testOverrides, ...deps }

  if (args.confirm !== true) {
    return {
      ok: false,
      status: 400,
      error:
        "I need a confirm in chat before I write this schedule in.",
    }
  }

  const mba = args.mbaNumber?.trim()
  if (!mba) {
    return {
      ok: false,
      status: 400,
      error:
        "Which campaign should this schedule attach to? I won't guess.",
      ask_mba: true,
    }
  }

  const staged = args.stageId ? await getIngestStage(args.stageId) : null
  const review = staged?.review ?? null
  const proposal = args.proposal ?? review?.proposal ?? null
  if (!proposal) {
    return {
      ok: false,
      status: 400,
      error: "There's no schedule review attached. Drop the xlsx again.",
    }
  }

  const fileName = args.fileName ?? staged?.fileName ?? null
  const publisherName =
    args.publisherName ?? review?.detected_publisher ?? proposal.publisher_name
  const detectedConfidence =
    args.detectedConfidence ?? review?.publisher_confidence ?? null

  if (review) {
    const summary = summariseIngestReview(review, {
      stageId: args.stageId ?? staged?.stageId ?? "",
      fileName,
    })
    if (summary.unknown_publisher) {
      return {
        ok: false,
        status: 409,
        error: summary.no_profile_message ?? NO_PUBLISHER_PROFILE_MESSAGE,
      }
    }
  }

  const recordRun = merged.recordRun ?? recordIngestRun
  let requiredCoverage: number | null = null
  try {
    const coverage = evaluateTemplateCoverage({
      mediaType: proposal.media_type,
      profile: review?.profile ?? null,
      shape: null,
      proposal,
    })
    requiredCoverage =
      coverage.required_count > 0
        ? coverage.required_matched / coverage.required_count
        : coverage.completeness
  } catch {
    requiredCoverage = null
  }
  const baseRun = runFields({
    publisherName,
    fileName,
    uploadedBy: args.uploadedBy,
    detectedConfidence,
    requiredCoverage,
    proposal,
  })

  const recon = proposal.reconciliation
  if (recon && recon.accept_ok === false) {
    await recordRun({
      ...baseRun,
      outcome: "blocked",
      outcomeReason: recon.block_reason ?? "Money total is outside the 0.5% gate. Nothing was written.",
      acceptedVersionId: null,
    })
    return {
      ok: false,
      status: 409,
      error: recon.block_reason ?? "Money total is outside the 0.5% gate. Nothing was written.",
      reconciliation: recon,
    }
  }

  const resolveCampaign =
    merged.resolveCampaign ??
    (async (mbaNumber: string) => {
      const resolved = await resolveIngestCampaignFromDb(
        mbaNumber,
        args.versionNumber,
      )
      if ("error" in resolved) {
        throw new Error(resolved.error)
      }
      return resolved
    })

  let campaign: AcceptCampaignTarget
  try {
    campaign = await resolveCampaign(mba)
  } catch (e) {
    return {
      ok: false,
      status: 400,
      error: e instanceof Error ? e.message : "Couldn't find that campaign.",
    }
  }

  const savePlanVersion =
    merged.savePlanVersion ??
    (await import("@/lib/data/savePlan")).savePlanVersion
  const insertPanels =
    merged.insertPanels ??
    (await import("@/lib/mediaplans/ingest/insertIngestPanels")).insertIngestPanels

  const result = await acceptIngestProposal(
    {
      proposal,
      campaign,
      feeLoading: args.feeLoading ?? {},
    },
    {
      savePlanVersion: savePlanVersion as AcceptIngestDeps["savePlanVersion"],
      insertPanels,
    },
  )

  await recordRun({
    ...baseRun,
    outcome: "accepted",
    outcomeReason: null,
    acceptedVersionId: result.versionId,
  })

  if (args.stageId) {
    await retainIngestStage({
      stageId: args.stageId,
      masterId: campaign.masterId,
      acceptedVersionId: result.versionId,
    })
  }

  return { ok: true, ...result }
}
export async function executeIngestAcceptWithCampaign(
  args: {
    proposal: IngestProposal
    campaign: AcceptCampaignTarget
    uploadedBy: string | null
    fileName?: string | null
    detectedConfidence?: number | null
    feeLoading?: FeeLoading
    stageId?: string | null
  },
  deps: ExecuteIngestAcceptOverrides = {},
): Promise<ExecuteIngestAcceptResult> {
  return executeIngestAccept(
    {
      stageId: args.stageId,
      proposal: args.proposal,
      mbaNumber: args.campaign.mbaNumber,
      versionNumber: args.campaign.versionNumber,
      uploadedBy: args.uploadedBy,
      confirm: true,
      fileName: args.fileName,
      detectedConfidence: args.detectedConfidence,
      publisherName: args.proposal.publisher_name,
      feeLoading: args.feeLoading,
    },
    {
      ...deps,
      resolveCampaign: async () => args.campaign,
    },
  )
}
