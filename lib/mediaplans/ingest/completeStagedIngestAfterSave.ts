/**
 * Complete a staged ingest after a human Save. Called from POST /api/plans/save
 * after savePlanVersion commits. Never rolls back the version. Never called
 * from savePlanVersion itself.
 */

import { recordIngestRun } from "@/lib/mediaplans/ingest/ingestRuns"
import {
  getIngestStage,
  retainIngestStage,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import { insertIngestPanels } from "@/lib/mediaplans/ingest/insertIngestPanels"
import {
  keyIngestPanelsToSavedIds,
  type SavedLineForIngestPanels,
} from "@/lib/mediaplans/ingest/keyIngestPanelsToSavedIds"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import { evaluateTemplateCoverage } from "@/lib/mediaplans/ingest/templateCoverage"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"

export type CompleteStagedIngestAfterSaveArgs = {
  ingestStageId?: string | null
  mbaNumber: string
  masterId: number
  acceptedVersionId: number
  savedLineItems: SavedLineForIngestPanels[]
  uploadedBy: string | null
}

export type CompleteStagedIngestAfterSaveResult = {
  ingestStageRetained: boolean
  ingestPanelError?: string
}

export type CompleteStagedIngestAfterSaveDeps = {
  getStage?: typeof getIngestStage
  insertPanels?: typeof insertIngestPanels
  recordRun?: typeof recordIngestRun
  retainStage?: typeof retainIngestStage
  keyPanels?: typeof keyIngestPanelsToSavedIds
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

export async function completeStagedIngestAfterSave(
  args: CompleteStagedIngestAfterSaveArgs,
  deps: CompleteStagedIngestAfterSaveDeps = {},
): Promise<CompleteStagedIngestAfterSaveResult> {
  const stageId = args.ingestStageId?.trim()
  if (!stageId) return { ingestStageRetained: false }

  const getStage = deps.getStage ?? getIngestStage
  const insertPanels = deps.insertPanels ?? insertIngestPanels
  const recordRun = deps.recordRun ?? recordIngestRun
  const retainStage = deps.retainStage ?? retainIngestStage
  const keyPanels = deps.keyPanels ?? keyIngestPanelsToSavedIds

  const staged = await getStage(stageId)
  if (!staged) {
    console.warn("[plans/save] ingest stage missing or expired", {
      ingestStageId: stageId,
    })
    return { ingestStageRetained: false }
  }

  if (staged.retainedAt) {
    console.info("[plans/save] ingest stage already retained", {
      ingestStageId: stageId,
    })
    return { ingestStageRetained: true }
  }

  const proposal = staged.review.proposal
  if (!proposal) {
    console.warn("[plans/save] ingest stage has no proposal", {
      ingestStageId: stageId,
    })
    return { ingestStageRetained: false }
  }

  const { panels, sourcePanelCount, survivingIngestPanelCount } = keyPanels({
    proposal,
    mbaNumber: args.mbaNumber,
    savedLineItems: args.savedLineItems,
    resolvedControlled: staged.review.template_coverage?.resolved_controlled,
  })
  if (sourcePanelCount > 0 && panels.length === 0) {
    const ingestPanelError =
      "Plan saved, but panels were not written: could not match ingest panels to saved line item ids"
    console.error("[plans/save] ingest panel remap empty", {
      ingestStageId: stageId,
      sourcePanelCount,
    })
    return { ingestStageRetained: false, ingestPanelError }
  }
  if (panels.length !== survivingIngestPanelCount) {
    const ingestPanelError = `Plan saved, but panels were not written: ingest panel count mismatch (wrote ${panels.length}, expected ${survivingIngestPanelCount} for surviving ingest rows)`
    console.error("[plans/save] ingest panel remap mismatch", {
      ingestStageId: stageId,
      sourcePanelCount,
      survivingIngestPanelCount,
      written: panels.length,
    })
    return { ingestStageRetained: false, ingestPanelError }
  }

  try {
    if (panels.length > 0) await insertPanels(panels)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Panel insert failed"
    console.error("[plans/save] ingest panel insert failed", err)
    return {
      ingestStageRetained: false,
      ingestPanelError: `Plan saved, but panels were not written: ${msg}`,
    }
  }

  let requiredCoverage: number | null = null
  try {
    const coverage = evaluateTemplateCoverage({
      mediaType: proposal.media_type,
      profile: staged.review.profile ?? null,
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

  const publisherName =
    staged.review.detected_publisher ?? proposal.publisher_name
  const baseRun = runFields({
    publisherName,
    fileName: staged.fileName,
    uploadedBy: args.uploadedBy ?? staged.uploadedBy,
    detectedConfidence: staged.review.publisher_confidence,
    requiredCoverage,
    proposal,
  })

  try {
    await recordRun({
      ...baseRun,
      outcome: "accepted",
      outcomeReason: null,
      acceptedVersionId: args.acceptedVersionId,
    })
  } catch (err) {
    console.warn("[plans/save] ingest_runs write failed", err)
  }

  try {
    await retainStage({
      stageId,
      masterId: args.masterId,
      acceptedVersionId: args.acceptedVersionId,
    })
  } catch (err) {
    console.warn("[plans/save] retainIngestStage failed", err)
  }

  return { ingestStageRetained: true }
}
