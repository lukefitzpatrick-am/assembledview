/**
 * In-memory staged ingest review (no migration).
 * Chat and Hub deep-link (`?stage=`) share the same package — not a re-upload.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"

export type StagedIngest = {
  stageId: string
  review: IngestReviewPackage
  fileName: string | null
  uploadedBy: string | null
  createdAt: string
}

const stages = new Map<string, StagedIngest>()

export function clearIngestStageForTests() {
  stages.clear()
}

export function putIngestStage(args: {
  review: IngestReviewPackage
  fileName?: string | null
  uploadedBy?: string | null
  stageId?: string
}): string {
  const stageId = args.stageId?.trim() || crypto.randomUUID()
  stages.set(stageId, {
    stageId,
    review: args.review,
    fileName: args.fileName ?? null,
    uploadedBy: args.uploadedBy ?? null,
    createdAt: new Date().toISOString(),
  })
  return stageId
}

export function getIngestStage(stageId: string | null | undefined): StagedIngest | null {
  const id = stageId?.trim()
  if (!id) return null
  return stages.get(id) ?? null
}

export function deleteIngestStage(stageId: string): void {
  stages.delete(stageId)
}
